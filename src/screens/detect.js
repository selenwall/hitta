import { store } from '../store.js';
import { updateScoreBar, setScreen, screens, buildDetectionBox, showLoader, hideLoader } from '../ui.js';
import { startCamera, stopCamera, stopLiveDetect, startLiveDetect } from '../camera.js';
import { loadModel, detectObjects, getModel, parseBbox, getLabel, getScore } from '../detector.js';
import { translateLabelToSv } from '../translations.js';
import { MIN_SCORE } from '../constants.js';
import { updateGame } from '../firebase.js';
import { navigate } from '../router.js';

export function renderDetect() {
  updateScoreBar();
  setScreen('detect');
  stopCamera();
  screens.detect.innerHTML = '';

  const container = document.createElement('div');
  container.className = 'col';

  const instruction = document.createElement('div');
  instruction.className = 'pill';
  instruction.textContent = store.testMode
    ? 'Testläge: fotografera ett objekt som du sedan ska hitta igen'
    : 'Fotografera ett objekt att utmana motspelaren med';
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

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'danger';
  cancelBtn.textContent = 'Avbryt spel';
  cancelBtn.onclick = async () => {
    cancelBtn.disabled = true;
    const canceledBy = store.myRole === 'A' ? store.game.playerAName : store.game.playerBName;
    await updateGame(store.gameId, { status: 'canceled', canceledBy });
  };
  actions.appendChild(cancelBtn);

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
      const { box, lab } = buildDetectionBox(x, y, w, h, scaleX, scaleY, getLabel(p), getScore(p));
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
    (preds || []).filter(p => getScore(p) > MIN_SCORE).forEach((p) => {
      const [x, y, w, h] = parseBbox(p);
      const { box, lab } = buildDetectionBox(x, y, w, h, scaleX, scaleY, getLabel(p), getScore(p));
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
    const updates = { targetLabel: getLabel(p), targetConfidence: getScore(p) };
    try {
      await updateGame(store.gameId, updates);
    } catch (err) {
      console.error('Kunde inte skicka utmaningen:', err);
      alert('Kunde inte skicka utmaningen. Kontrollera din anslutning och välj objektet igen.');
      return;
    }
    // Optimistic local update so the next screen shows the chosen challenge
    // immediately instead of after the next poll.
    store.game = { ...store.game, ...updates };
    // Test mode: you are also the finder — go straight to the play screen.
    navigate(store.testMode ? 'play' : 'wait');
  }

  async function startCameraAndDetect() {
    try {
      await startCamera(video);
      showLoader();
      await loadModel();
      hideLoader();
      startLiveDetect(async () => {
        const model = getModel();
        if (!model || video.readyState < 2) return;
        const preds = await detectObjects(model, video);
        drawLiveBoxes(preds);
      });
    } catch (err) {
      hideLoader();
      console.error('Camera start error:', err);
      alert(err.message || 'Kunde inte starta kamera. Ge kameratillstånd och försök igen.');
      setScreen('home');
    }
  }
  startCameraAndDetect();

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
          drawLiveBoxes(preds);
        });
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
        const label = getLabel(p);
        const confidence = getScore(p);
        const btn = document.createElement('button');
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
