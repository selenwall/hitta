import { store } from '../store.js';
import { navigate } from '../router.js';
import { encodeStateToURL } from '../urlState.js';
import { updateScoreBar, setScreen, screens, shareLink } from '../ui.js';
import { startCamera, stopCamera, stopLiveDetect, startLiveDetect } from '../camera.js';
import { loadModel, detectObjects, getModel } from '../detector.js';
import { translateLabelToSv } from '../translations.js';
import { MIN_SCORE } from '../constants.js';

function buildBox(x, y, w, h, scaleX, scaleY, label, confidence) {
  const b = document.createElement('div');
  b.className = 'box';
  b.style.left = `${x * scaleX}px`;
  b.style.top = `${y * scaleY}px`;
  b.style.width = `${w * scaleX}px`;
  b.style.height = `${h * scaleY}px`;
  const lab = document.createElement('label');
  lab.textContent = `${label.toUpperCase()} ${(confidence * 100).toFixed(0)}%`;
  translateLabelToSv(label).then(sv => {
    lab.textContent = `${(sv || '').toUpperCase()} ${(confidence * 100).toFixed(0)}%`;
  }).catch(() => {});
  return { box: b, lab };
}

function parseBbox(p) {
  if (p.bbox && Array.isArray(p.bbox)) return p.bbox;
  return [p.x, p.y, p.width, p.height];
}

export function renderDetect() {
  updateScoreBar();
  setScreen('detect');
  stopCamera();
  screens.detect.innerHTML = '';

  const container = document.createElement('div');
  container.className = 'col';

  const instruction = document.createElement('div');
  instruction.className = 'pill';
  instruction.textContent = 'Fotografera ett objekt att utmana motspelaren med';
  container.appendChild(instruction);

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
  const snap = document.createElement('button');
  snap.className = 'primary';
  snap.textContent = 'Ta bild';

  try {
    if (store.game.gameId && localStorage.getItem('itta_owner_gid') === store.game.gameId) {
      const cancel = document.createElement('button');
      cancel.className = 'danger';
      cancel.textContent = 'Avbryt spel';
      cancel.onclick = () => {
        store.game.isActive = false;
        store.game.canceledBy = store.game.playerAName || 'Spelare A';
        encodeStateToURL(store.game);
        navigate('cancel');
      };
      actions.appendChild(cancel);
    }
  } catch {}

  actions.appendChild(snap);
  container.appendChild(actions);
  screens.detect.appendChild(container);

  const ctx = canvas.getContext('2d');

  const drawInteractiveBoxes = (preds, onPick) => {
    overlay.classList.add('interactive');
    overlay.innerHTML = '';
    const scaleX = overlay.clientWidth && canvas.width ? overlay.clientWidth / canvas.width : 1;
    const scaleY = overlay.clientHeight && canvas.height ? overlay.clientHeight / canvas.height : 1;
    preds.forEach((p) => {
      const [x, y, w, h] = parseBbox(p);
      const label = p.label || p.class || '';
      const confidence = p.confidence || p.score || 0;
      const { box, lab } = buildBox(x, y, w, h, scaleX, scaleY, label, confidence);
      lab.onclick = (e) => { e.stopPropagation(); onPick(p); };
      box.appendChild(lab);
      overlay.appendChild(box);
    });
  };

  const drawLiveBoxes = (preds) => {
    overlay.classList.remove('interactive');
    overlay.innerHTML = '';
    const vwRect = vw.getBoundingClientRect();
    const scaleX = vwRect.width && video.videoWidth ? vwRect.width / video.videoWidth : 1;
    const scaleY = vwRect.height && video.videoHeight ? vwRect.height / video.videoHeight : 1;
    (preds || []).filter(p => (p.confidence || p.score) > MIN_SCORE).forEach((p) => {
      const [x, y, w, h] = parseBbox(p);
      const label = p.label || p.class || '';
      const confidence = p.confidence || p.score || 0;
      const { box, lab } = buildBox(x, y, w, h, scaleX, scaleY, label, confidence);
      lab.onclick = async (e) => {
        e.stopPropagation();
        try {
          stopLiveDetect();
          await loadModel();
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          video.style.display = 'none';
          canvas.style.display = 'block';
          stopCamera();
          await pickTarget(p);
        } catch (err) {
          console.error(err);
        }
      };
      box.appendChild(lab);
      overlay.appendChild(box);
    });
  };

  async function pickTarget(p) {
    store.game.targetLabel = p.label || p.class || '';
    store.game.targetConfidence = p.confidence || p.score || 0;
    store.game.isActive = true;
    store.game.winner = '';
    encodeStateToURL(store.game);
    const sv = await translateLabelToSv(store.game.targetLabel);
    const text = `${store.game.playerAName} utmanar ${store.game.playerBName} att hitta: ${(sv || '').toUpperCase()}. Ställning ${store.game.playerAScore}-${store.game.playerBScore}.`;
    await shareLink(text);
    navigate('wait');
  }

  startCamera(video).then(loadModel).then(() => {
    startLiveDetect(async () => {
      const model = getModel();
      if (!model || video.readyState < 2) return;
      const preds = await detectObjects(model, video);
      console.log('Live detection result:', preds);
      drawLiveBoxes(preds);
    });
  }).catch(err => {
    console.error('Kamerastart fel:', err);
    alert(err.message || 'Kunde inte starta kamera. Ge kameratillstånd och försök igen.');
    setScreen('home');
  });

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
        return;
      }
      drawInteractiveBoxes(preds, pickTarget);

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
        btn.onclick = () => pickTarget(p);
        grid.appendChild(btn);
      });
      chooser.appendChild(grid);
      screens.detect.appendChild(chooser);
    } catch (e) {
      console.error(e);
      alert('Det gick inte att analysera bilden.');
    }
  };
}
