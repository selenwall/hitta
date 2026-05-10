import { store } from '../store.js';
import { updateScoreBar, setScreen, screens, showFeedbackPlusOne, buildDetectionBox } from '../ui.js';
import { startCamera, stopCamera, stopLiveDetect, startLiveDetect } from '../camera.js';
import { loadModel, detectObjects, getModel, parseBbox, getLabel, getScore } from '../detector.js';
import { translateLabelToSv } from '../translations.js';
import { MIN_SCORE, WIN_POINTS, TURN_SECONDS } from '../constants.js';
import { resetTimer, startTimer, stopTimer, formatTime } from '../timer.js';
import { updateGame } from '../firebase.js';

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

  let roundAwarded = false;

  const container = document.createElement('div');
  container.className = 'col';

  const pill = document.createElement('div');
  pill.className = 'challenge-pill';
  pill.innerHTML = `Hitta: <span class="name">${(store.game.targetLabel || '').toUpperCase()}</span>`;
  translateLabelToSv(store.game.targetLabel).then(sv => {
    const span = pill.querySelector('.name');
    if (span && sv) span.textContent = (sv || '').toUpperCase();
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

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'danger';
  cancelBtn.textContent = 'Avbryt spel';
  cancelBtn.onclick = async () => {
    cancelBtn.disabled = true;
    stopTimer();
    stopCamera();
    stopLiveDetect();
    const canceledBy = store.myRole === 'A' ? store.game.playerAName : store.game.playerBName;
    await updateGame(store.gameId, { status: 'canceled', canceledBy });
  };
  actions.appendChild(cancelBtn);

  actions.appendChild(timerEl);
  actions.appendChild(snap);
  actions.appendChild(giveUp);
  container.appendChild(actions);
  screens.play.appendChild(container);

  const ctx = canvas.getContext('2d');

  async function finishRound(success) {
    if (roundAwarded) return;
    roundAwarded = true;

    stopTimer();
    stopCamera();
    stopLiveDetect();

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

    // Write round result — subscription on both devices handles navigation
    await updateGame(store.gameId, {
      playerAScore,
      playerBScore,
      currentTurn: newTurn,
      targetLabel: '',
      targetConfidence: 0,
      status: winner ? 'won' : 'playing',
      winner,
    });
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

  async function startCameraAndDetect() {
    try {
      await startCamera(video);
      await loadModel();
      resetTimer();
      startTimer(() => finishRound(false));
      startLiveDetect(async () => {
        const model = getModel();
        if (!model || video.readyState < 2) return;
        const preds = await detectObjects(model, video);
        drawLiveBoxes(preds || []);
      });
    } catch (err) {
      console.error('Camera start error:', err);
      alert(err.message || 'Kunde inte starta kamera. Ge kameratillstånd och försök igen.');
      setScreen('home');
    }
  }
  startCameraAndDetect();

  giveUp.onclick = () => finishRound(false);

  snap.onclick = async () => {
    try {
      stopLiveDetect();
      const model = await loadModel();
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      video.style.display = 'none';
      canvas.style.display = 'block';
      const allPreds = await detectObjects(model, canvas);
      const preds = (allPreds || []).filter(p => getScore(p) > MIN_SCORE);
      stopCamera();
      if (!preds.length) {
        alert(`Inga objekt över ${(MIN_SCORE * 100).toFixed(0)}% hittades. Försök igen.`);
        video.style.display = '';
        canvas.style.display = 'none';
        await startCamera(video);
        startLiveDetect(async () => {
          const model = getModel();
          if (!model || video.readyState < 2) return;
          const preds = await detectObjects(model, video);
          drawLiveBoxes(preds || []);
        });
        return;
      }

      drawInteractiveBoxes(preds, (p) => {
        finishRound(getLabel(p).toLowerCase() === (store.game.targetLabel || '').toLowerCase());
      });

      const chooser = document.createElement('div');
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
        btn.onclick = () => finishRound(label.toLowerCase() === (store.game.targetLabel || '').toLowerCase());
        grid.appendChild(btn);
      });
      chooser.appendChild(grid);
      screens.play.appendChild(chooser);
    } catch (e) {
      console.error(e);
      alert('Det gick inte att analysera bilden.');
    }
  };
}
