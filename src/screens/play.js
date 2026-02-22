import { store } from '../store.js';
import { navigate } from '../router.js';
import { encodeStateToURL } from '../urlState.js';
import { updateScoreBar, setScreen, screens, showFeedbackPlusOne } from '../ui.js';
import { startCamera, stopCamera, stopLiveDetect, startLiveDetect } from '../camera.js';
import { loadModel, detectObjects, getModel } from '../detector.js';
import { translateLabelToSv } from '../translations.js';
import { MIN_SCORE, WIN_POINTS, TURN_SECONDS } from '../constants.js';
import { resetTimer, startTimer, stopTimer, formatTime } from '../timer.js';

function parseBbox(p) {
  if (p.bbox && Array.isArray(p.bbox)) return p.bbox;
  return [p.x, p.y, p.width, p.height];
}

function checkWinner() {
  const target = store.game.winPoints || WIN_POINTS;
  if (store.game.playerAScore >= target) return 'A';
  if (store.game.playerBScore >= target) return 'B';
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
  pill.className = 'pill';
  pill.innerHTML = `<span>Hitta: <span class="name">${(store.game.targetLabel || '').toUpperCase()}</span></span>`;
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
  timerEl.className = 'pill timer';
  timerEl.id = 'play-timer';
  timerEl.textContent = formatTime(TURN_SECONDS);
  const snap = document.createElement('button');
  snap.className = 'primary';
  snap.textContent = 'Ta bild';
  const giveUp = document.createElement('button');
  giveUp.className = 'ghost';
  giveUp.textContent = 'Ge upp';

  try {
    if (store.game.gameId && localStorage.getItem('itta_owner_gid') === store.game.gameId) {
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'danger';
      cancelBtn.textContent = 'Avbryt spel';
      cancelBtn.onclick = () => {
        stopTimer();
        stopCamera();
        store.game.isActive = false;
        store.game.canceledBy = store.game.playerAName || 'Spelare A';
        encodeStateToURL(store.game);
        navigate('cancel');
      };
      actions.appendChild(cancelBtn);
    }
  } catch {}

  actions.appendChild(timerEl);
  actions.appendChild(snap);
  actions.appendChild(giveUp);
  container.appendChild(actions);
  screens.play.appendChild(container);

  const ctx = canvas.getContext('2d');

  function finishRound() {
    store.game.currentTurn = store.game.currentTurn === 'A' ? 'B' : 'A';
    store.game.targetLabel = '';
    store.game.targetConfidence = 0;
    const w = checkWinner();
    store.game.winner = w;
    encodeStateToURL(store.game);
    navigate(w ? 'win' : 'detect');
  }

  const drawLiveBoxes = (preds) => {
    overlay.classList.remove('interactive');
    overlay.innerHTML = '';
    const vwRect = vw.getBoundingClientRect();
    const scaleX = vwRect.width && video.videoWidth ? vwRect.width / video.videoWidth : 1;
    const scaleY = vwRect.height && video.videoHeight ? vwRect.height / video.videoHeight : 1;
    (preds || []).filter(p => (p.confidence || p.score) > MIN_SCORE).forEach((p) => {
      const [x, y, w, h] = parseBbox(p);
      const b = document.createElement('div');
      b.className = 'box';
      b.style.left = `${x * scaleX}px`;
      b.style.top = `${y * scaleY}px`;
      b.style.width = `${w * scaleX}px`;
      b.style.height = `${h * scaleY}px`;
      const lab = document.createElement('label');
      const label = p.label || p.class || '';
      const confidence = p.confidence || p.score || 0;
      lab.textContent = `${label.toUpperCase()} ${(confidence * 100).toFixed(0)}%`;
      translateLabelToSv(label).then(sv => {
        lab.textContent = `${(sv || '').toUpperCase()} ${(confidence * 100).toFixed(0)}%`;
      }).catch(() => {});
      b.appendChild(lab);
      overlay.appendChild(b);
    });
  };

  const drawInteractiveBoxes = (preds, onPick) => {
    overlay.classList.add('interactive');
    overlay.innerHTML = '';
    const scaleX = overlay.clientWidth && canvas.width ? overlay.clientWidth / canvas.width : 1;
    const scaleY = overlay.clientHeight && canvas.height ? overlay.clientHeight / canvas.height : 1;
    preds.forEach((p) => {
      const [x, y, w, h] = parseBbox(p);
      const b = document.createElement('div');
      b.className = 'box';
      b.style.left = `${x * scaleX}px`;
      b.style.top = `${y * scaleY}px`;
      b.style.width = `${w * scaleX}px`;
      b.style.height = `${h * scaleY}px`;
      const lab = document.createElement('label');
      const label = p.label || p.class || '';
      const confidence = p.confidence || p.score || 0;
      lab.textContent = `${label.toUpperCase()} ${(confidence * 100).toFixed(0)}%`;
      translateLabelToSv(label).then(sv => {
        lab.textContent = `${(sv || '').toUpperCase()} ${(confidence * 100).toFixed(0)}%`;
      }).catch(() => {});
      lab.onclick = (e) => { e.stopPropagation(); onPick(p); };
      b.appendChild(lab);
      overlay.appendChild(b);
    });
  };

  startCamera(video).then(loadModel).then(() => {
    resetTimer();
    startTimer(() => {
      stopCamera();
      finishRound();
    });
    startLiveDetect(async () => {
      const model = getModel();
      if (!model || video.readyState < 2) return;
      const preds = await detectObjects(model, video);
      drawLiveBoxes(preds || []);
    });
  }).catch(err => {
    console.error('Kamerastart fel:', err);
    alert(err.message || 'Kunde inte starta kamera. Ge kameratillstånd och försök igen.');
    setScreen('home');
  });

  giveUp.onclick = () => {
    stopTimer();
    stopCamera();
    finishRound();
  };

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
      const preds = (allPreds || []).filter(p => (p.confidence || p.score) > MIN_SCORE);
      stopCamera();
      if (!preds.length) {
        alert('Inga objekt över 60% hittades. Försök igen.');
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

      const awardOnce = (success) => {
        if (roundAwarded) return;
        roundAwarded = true;
        if (success) {
          if (store.game.currentTurn === 'A') store.game.playerBScore += 1;
          else store.game.playerAScore += 1;
          updateScoreBar();
          showFeedbackPlusOne();
        }
        stopTimer();
        finishRound();
      };

      drawInteractiveBoxes(preds, (p) => {
        const label = p.label || p.class || '';
        awardOnce(label.toLowerCase() === (store.game.targetLabel || '').toLowerCase());
      });

      const chooser = document.createElement('div');
      chooser.className = 'card col';
      const chooserTitle = document.createElement('div');
      chooserTitle.textContent = 'Eller välj i listan';
      chooser.appendChild(chooserTitle);
      const grid = document.createElement('div');
      grid.className = 'grid';
      preds.slice(0, 6).forEach((p) => {
        const btn = document.createElement('button');
        const label = p.label || p.class || '';
        const confidence = p.confidence || p.score || 0;
        btn.textContent = `${label.toUpperCase()} ${(confidence * 100).toFixed(0)}%`;
        translateLabelToSv(label).then(sv => {
          btn.textContent = `${(sv || '').toUpperCase()} ${(confidence * 100).toFixed(0)}%`;
        }).catch(() => {});
        btn.onclick = () => {
          const lbl = p.label || p.class || '';
          awardOnce(lbl.toLowerCase() === (store.game.targetLabel || '').toLowerCase());
        };
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
