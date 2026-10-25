import { store } from '../store.js';
import { updateScoreBar, setScreen, screens, showFeedbackPlusOne, buildDetectionBox, showLoader, hideLoader, showCameraError } from '../ui.js';
import { makeCancelButton } from './cancel.js';
import { startCamera, stopCamera, stopLiveDetect, startLiveDetect, CameraAbortedError } from '../camera.js';
import { loadModel, detectObjects, getModel, parseBbox, getLabel, getScore } from '../detector.js';
import { translateLabelToSv } from '../translations.js';
import { MIN_SCORE, WIN_POINTS, TURN_SECONDS } from '../constants.js';
import { resetTimer, startTimer, stopTimer, formatTime } from '../timer.js';
import { updateGame } from '../firebase.js';
import { navigate, getCurrentScreen } from '../router.js';

let playRenderId = 0;

function computeWinner(aScore, bScore, winPoints) {
  if (aScore >= winPoints) return 'A';
  if (bScore >= winPoints) return 'B';
  return '';
}

export function renderPlay() {
  updateScoreBar();
  setScreen('play');
  stopCamera();
  screens.play.innerHTML = '';

  // Async work (camera start, model load, saving a round) can finish after the
  // player has been routed elsewhere; it must not act on a screen that's gone.
  const renderId = ++playRenderId;
  const isCurrent = () => renderId === playRenderId && getCurrentScreen() === 'play';

  let roundAwarded = false;
  let pendingUpdates = null; // set when a finished round failed to save, so a retry reuses the same result

  const container = document.createElement('div');
  container.className = 'col';

  const pill = document.createElement('div');
  pill.className = 'challenge-pill';
  const nameSpan = document.createElement('span');
  nameSpan.className = 'name';
  nameSpan.textContent = (store.game.targetLabel || '').toUpperCase();
  pill.append('Hitta: ', nameSpan);
  translateLabelToSv(store.game.targetLabel).then(sv => {
    if (sv) nameSpan.textContent = sv.toUpperCase();
  }).catch(() => {});
  container.appendChild(pill);

  const vw = document.createElement('div');
  vw.className = 'video-wrap';
  const video = document.createElement('video');
  video.playsInline = true;
  video.muted = true;
  video.autoplay = true;
  const canvas = document.createElement('canvas');
  canvas.style.display = 'none';
  const overlay = document.createElement('div');
  overlay.className = 'overlay boxes';
  vw.appendChild(video);
  vw.appendChild(canvas);
  vw.appendChild(overlay);
  container.appendChild(vw);

  const actions = document.createElement('div');
  actions.className = 'footer-actions';
  const timerEl = document.createElement('div');
  timerEl.className = 'timer-display';
  timerEl.id = 'play-timer';
  timerEl.textContent = formatTime(TURN_SECONDS);
  const snap = document.createElement('button');
  snap.className = 'primary';
  snap.textContent = 'Ta bild';
  const giveUp = document.createElement('button');
  giveUp.className = 'ghost';
  giveUp.textContent = 'Ge upp';

  // Timer and camera keep running until the cancel lands; navigating to the
  // cancel screen stops them, and a failed cancel leaves the round playable.
  actions.appendChild(makeCancelButton());

  actions.appendChild(timerEl);
  actions.appendChild(snap);
  actions.appendChild(giveUp);
  container.appendChild(actions);
  screens.play.appendChild(container);

  const ctx = canvas.getContext('2d');

  let snapBusy = false;
  let frozen = false; // a still frame is shown; "Ta bild" then means retake
  let chooser = null;

  async function finishRound(success) {
    if (roundAwarded || !isCurrent()) return;
    roundAwarded = true;

    stopTimer();
    stopCamera();
    stopLiveDetect();

    let updates = pendingUpdates;
    if (!updates) {
      let { playerAScore, playerBScore, currentTurn, winPoints } = store.game;
      winPoints = winPoints || WIN_POINTS;

      if (success) {
        // Finder scores: when turn='A' (A challenges), B is the finder
        if (currentTurn === 'A') playerBScore += 1;
        else playerAScore += 1;
        showFeedbackPlusOne();
      }

      const newTurn = currentTurn === 'A' ? 'B' : 'A';
      const winner = computeWinner(playerAScore, playerBScore, winPoints);

      updates = {
        playerAScore,
        playerBScore,
        currentTurn: newTurn,
        targetLabel: '',
        targetConfidence: 0,
        status: winner ? 'won' : 'playing',
        winner,
      };
    }

    // Persist the round result with retries — losing this write would leave
    // the other player waiting forever on the previous round.
    let saved = false;
    for (let attempt = 0; attempt < 3 && !saved; attempt++) {
      try {
        await updateGame(store.gameId, updates);
        saved = true;
      } catch (err) {
        console.error(`Kunde inte spara rundan (försök ${attempt + 1}):`, err);
        if (attempt < 2) await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
    if (!isCurrent()) return;
    if (!saved) {
      roundAwarded = false;
      pendingUpdates = updates;
      alert('Kunde inte spara rundan. Kontrollera din anslutning och tryck "Ge upp" för att försöka igen.');
      return;
    }
    pendingUpdates = null;

    // Optimistic local update so the score bar and next screen are correct
    // immediately instead of after the next poll.
    const { winner } = updates;
    store.game = { ...store.game, ...updates };

    // Navigate immediately — the finder always becomes the next challenger.
    // The other player's subscription handles their side within POLL_MS.
    navigate(winner ? 'win' : 'detect');
  }

  const drawLiveBoxes = (preds) => {
    overlay.classList.remove('interactive');
    overlay.innerHTML = '';
    const vwRect = vw.getBoundingClientRect();
    const scaleX = vwRect.width && video.videoWidth ? vwRect.width / video.videoWidth : 1;
    const scaleY = vwRect.height && video.videoHeight ? vwRect.height / video.videoHeight : 1;
    (preds || []).filter(p => getScore(p) > MIN_SCORE).forEach((p) => {
      const [x, y, w, h] = parseBbox(p);
      const { box, lab } = buildDetectionBox(x, y, w, h, scaleX, scaleY, getLabel(p), getScore(p));
      box.appendChild(lab);
      overlay.appendChild(box);
    });
  };

  const drawInteractiveBoxes = (preds, onPick) => {
    overlay.classList.add('interactive');
    overlay.innerHTML = '';
    const scaleX = overlay.clientWidth && canvas.width ? overlay.clientWidth / canvas.width : 1;
    const scaleY = overlay.clientHeight && canvas.height ? overlay.clientHeight / canvas.height : 1;
    preds.forEach((p) => {
      const [x, y, w, h] = parseBbox(p);
      const { box, lab } = buildDetectionBox(x, y, w, h, scaleX, scaleY, getLabel(p), getScore(p));
      lab.onclick = (e) => { e.stopPropagation(); onPick(p); };
      box.appendChild(lab);
      overlay.appendChild(box);
    });
  };

  const liveDetect = async (isLive) => {
    const model = getModel();
    if (!model || video.readyState < 2) return;
    const preds = await detectObjects(model, video);
    if (isLive()) drawLiveBoxes(preds || []);
  };

  // Back from a still frame to the live camera (the turn timer keeps running).
  async function resumeLive() {
    chooser?.remove();
    chooser = null;
    overlay.innerHTML = '';
    video.style.display = '';
    canvas.style.display = 'none';
    frozen = false;
    snap.textContent = 'Ta bild';
    try {
      await startCamera(video);
    } catch (err) {
      if (err instanceof CameraAbortedError || !isCurrent()) return;
      showCameraError(vw, err.message, () => navigate('play'));
      return;
    }
    if (isCurrent()) startLiveDetect(liveDetect);
  }

  async function startCameraAndDetect() {
    try {
      await startCamera(video);
      if (!isCurrent()) return;
      showLoader();
      await loadModel();
      // Only touch the loader while still current: after navigating away it
      // may belong to the next screen.
      if (!isCurrent()) return;
      hideLoader();
      resetTimer();
      startTimer(() => finishRound(false));
      startLiveDetect(liveDetect);
    } catch (err) {
      if (err instanceof CameraAbortedError || !isCurrent()) return;
      hideLoader();
      console.error('Camera start error:', err);
      showCameraError(vw, err.message || 'Kunde inte starta kamera. Ge kameratillstånd och försök igen.', () => navigate('play'));
    }
  }
  startCameraAndDetect();

  giveUp.onclick = () => finishRound(false);

  const isTarget = (label) => label.toLowerCase() === (store.game.targetLabel || '').toLowerCase();

  snap.onclick = async () => {
    if (roundAwarded || snapBusy) return;
    snapBusy = true;
    snap.disabled = true;
    try {
      if (frozen) {
        await resumeLive();
        return;
      }
      const model = await loadModel();
      if (!isCurrent()) return;
      stopLiveDetect();
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      video.style.display = 'none';
      canvas.style.display = 'block';
      stopCamera();
      frozen = true;
      snap.textContent = 'Ta ny bild';
      const allPreds = await detectObjects(model, canvas);
      const preds = (allPreds || []).filter(p => getScore(p) > MIN_SCORE);
      if (!isCurrent()) return;
      if (!preds.length) {
        alert(`Inga objekt över ${(MIN_SCORE * 100).toFixed(0)}% hittades. Försök igen.`);
        await resumeLive();
        return;
      }

      drawInteractiveBoxes(preds, (p) => finishRound(isTarget(getLabel(p))));

      chooser = document.createElement('div');
      chooser.className = 'card col';
      const chooserTitle = document.createElement('div');
      chooserTitle.textContent = 'Eller välj i listan';
      chooser.appendChild(chooserTitle);
      const grid = document.createElement('div');
      grid.className = 'grid';
      preds.slice(0, 6).forEach((p) => {
        const label = getLabel(p);
        const confidence = getScore(p);
        const btn = document.createElement('button');
        btn.textContent = `${label.toUpperCase()} ${(confidence * 100).toFixed(0)}%`;
        translateLabelToSv(label).then(sv => {
          btn.textContent = `${(sv || '').toUpperCase()} ${(confidence * 100).toFixed(0)}%`;
        }).catch(() => {});
        btn.onclick = () => finishRound(isTarget(label));
        grid.appendChild(btn);
      });
      chooser.appendChild(grid);
      screens.play.appendChild(chooser);
    } catch (e) {
      if (e instanceof CameraAbortedError || !isCurrent()) return;
      console.error(e);
      alert('Det gick inte att analysera bilden.');
    } finally {
      snapBusy = false;
      snap.disabled = false;
    }
  };
}
