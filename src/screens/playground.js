import { updateScoreBar, setScreen, screens, buildDetectionBox, showLoader, hideLoader, showCameraError } from '../ui.js';
import { startCamera, stopCamera, startLiveDetect, CameraAbortedError } from '../camera.js';
import { loadModel, detectObjects, getModel, parseBbox, getLabel, getScore } from '../detector.js';
import { translateLabelToSv } from '../translations.js';
import { MIN_SCORE } from '../constants.js';
import { navigate, getCurrentScreen } from '../router.js';

let playgroundRenderId = 0;

// Playground: try the camera and object detection outside a game. Nothing is
// sent to the server; it only shows what the AI recognises and whether it is
// confident enough to count in a real game.
export function renderPlayground() {
  updateScoreBar();
  setScreen('playground');
  stopCamera();
  screens.playground.innerHTML = '';

  const renderId = ++playgroundRenderId;
  const isCurrent = () => renderId === playgroundRenderId && getCurrentScreen() === 'playground';

  let facingMode = 'environment';

  const container = document.createElement('div');
  container.className = 'col';

  const instruction = document.createElement('div');
  instruction.className = 'pill';
  instruction.textContent = 'Lekplats: rikta kameran mot saker och se vad AI:n känner igen';
  container.appendChild(instruction);

  const vw = document.createElement('div');
  vw.className = 'video-wrap';
  const video = document.createElement('video');
  video.playsInline = true;
  video.muted = true;
  video.autoplay = true;
  const overlay = document.createElement('div');
  overlay.className = 'overlay boxes';
  vw.appendChild(video);
  vw.appendChild(overlay);
  container.appendChild(vw);

  const found = document.createElement('div');
  found.className = 'card col';
  const foundTitle = document.createElement('div');
  foundTitle.textContent = 'Det här ser AI:n';
  const foundList = document.createElement('div');
  foundList.className = 'found-list';
  const foundHint = document.createElement('div');
  foundHint.className = 'hint';
  foundHint.textContent = `Gröna objekt (minst ${(MIN_SCORE * 100).toFixed(0)}% säkerhet) räknas i spelet.`;
  found.append(foundTitle, foundList, foundHint);
  container.appendChild(found);

  const actions = document.createElement('div');
  actions.className = 'footer-actions';
  const back = document.createElement('button');
  back.className = 'ghost';
  back.textContent = 'Tillbaka';
  back.onclick = () => navigate('home');
  const flip = document.createElement('button');
  flip.textContent = 'Byt kamera';
  actions.append(back, flip);
  container.appendChild(actions);
  screens.playground.appendChild(container);

  const showFound = (preds) => {
    if (!preds.length) {
      const empty = document.createElement('div');
      empty.className = 'hint';
      empty.textContent = 'Inga objekt hittade ännu.';
      foundList.replaceChildren(empty);
      return;
    }
    foundList.replaceChildren(...preds
      .slice()
      .sort((a, b) => getScore(b) - getScore(a))
      .map((p) => {
        const confidence = getScore(p);
        const counts = confidence > MIN_SCORE;
        const item = document.createElement('span');
        item.className = counts ? 'badge active' : 'badge';
        const pct = `${(confidence * 100).toFixed(0)}%`;
        item.textContent = `${getLabel(p).toUpperCase()} ${pct}`;
        translateLabelToSv(getLabel(p)).then(sv => {
          item.textContent = `${(sv || '').toUpperCase()} ${pct}${counts ? '' : ' – för osäker'}`;
        }).catch(() => {});
        return item;
      }));
  };

  const drawLiveBoxes = (preds) => {
    overlay.innerHTML = '';
    const vwRect = vw.getBoundingClientRect();
    const scaleX = vwRect.width && video.videoWidth ? vwRect.width / video.videoWidth : 1;
    const scaleY = vwRect.height && video.videoHeight ? vwRect.height / video.videoHeight : 1;
    preds.filter(p => getScore(p) > MIN_SCORE).forEach((p) => {
      const [x, y, w, h] = parseBbox(p);
      const { box, lab } = buildDetectionBox(x, y, w, h, scaleX, scaleY, getLabel(p), getScore(p));
      box.appendChild(lab);
      overlay.appendChild(box);
    });
  };

  const liveDetect = async (isLive) => {
    const model = getModel();
    if (!model || video.readyState < 2) return;
    const preds = (await detectObjects(model, video)) || [];
    if (!isLive()) return;
    drawLiveBoxes(preds);
    showFound(preds);
  };

  async function startCameraAndDetect() {
    try {
      await startCamera(video, facingMode);
      if (!isCurrent()) return;
      showLoader();
      await loadModel();
      if (!isCurrent()) return;
      hideLoader();
      showFound([]);
      startLiveDetect(liveDetect);
    } catch (err) {
      if (err instanceof CameraAbortedError || !isCurrent()) return;
      hideLoader();
      console.error('Camera start error:', err);
      showCameraError(vw, err.message || 'Kunde inte starta kamera. Ge kameratillstånd och försök igen.', () => navigate('playground'));
    }
  }
  startCameraAndDetect();

  flip.onclick = async () => {
    flip.disabled = true;
    facingMode = facingMode === 'environment' ? 'user' : 'environment';
    overlay.innerHTML = '';
    await startCameraAndDetect();
    flip.disabled = false;
  };
}
