import { store } from '../store.js';
import { navigate } from '../router.js';
import { encodeStateToURL } from '../urlState.js';
import { updateScoreBar, setScreen, screens } from '../ui.js';
import { checkCameraPermissions, startCamera } from '../camera.js';
import { loadModel } from '../detector.js';
import { WIN_POINTS } from '../constants.js';

function isOwner() {
  try {
    return store.game.gameId && localStorage.getItem('itta_owner_gid') === store.game.gameId;
  } catch {
    return false;
  }
}

export function renderHome() {
  updateScoreBar();
  setScreen('home');
  const hasActive = store.game.isActive;
  screens.home.innerHTML = '';

  const wrap = document.createElement('div');
  wrap.className = 'col card';

  const title = document.createElement('h2');
  title.textContent = 'Starta eller gå med i spel';
  wrap.appendChild(title);

  const cameraInfo = document.createElement('div');
  cameraInfo.className = 'hint';
  cameraInfo.innerHTML = '💡 <strong>Kameraproblem?</strong> Klicka på "Testa kamera" för att kontrollera behörigheter. Om kameran nekas, klicka på kameran-ikonen i adressfältet och välj "Tillåt".';
  wrap.appendChild(cameraInfo);

  const loadingInfo = document.createElement('div');
  loadingInfo.className = 'hint';
  loadingInfo.id = 'loading-info';
  loadingInfo.innerHTML = '⏳ <strong>Laddar AI-modeller...</strong> Detta kan ta några sekunder vid första besöket.';
  wrap.appendChild(loadingInfo);
  setTimeout(() => {
    document.getElementById('loading-info')?.remove();
  }, 3000);

  const nameRow = document.createElement('div');
  nameRow.className = 'col';

  const nameA = document.createElement('input');
  nameA.placeholder = 'Ditt namn';
  nameA.value = store.game.playerAName || '';
  nameA.autocapitalize = 'words';
  nameA.autocomplete = 'name';

  const nameB = document.createElement('input');
  nameB.placeholder = 'Motspelarens namn (om du startar)';
  nameB.value = store.game.playerBName || '';

  nameRow.appendChild(nameA);
  nameRow.appendChild(nameB);
  wrap.appendChild(nameRow);

  const roundsRow = document.createElement('div');
  roundsRow.className = 'row';
  const roundsLabel = document.createElement('label');
  roundsLabel.textContent = 'Spelomgångar (först till):';
  const rounds = document.createElement('select');
  [1, 3, 5].forEach(n => {
    const opt = document.createElement('option');
    opt.value = String(n);
    opt.textContent = String(n);
    if ((store.game.winPoints || WIN_POINTS) === n) opt.selected = true;
    rounds.appendChild(opt);
  });
  rounds.onchange = () => {
    store.game.winPoints = parseInt(rounds.value, 10) || WIN_POINTS;
    encodeStateToURL(store.game);
    updateScoreBar();
  };
  roundsRow.appendChild(roundsLabel);
  roundsRow.appendChild(rounds);
  if (!hasActive) wrap.appendChild(roundsRow);

  const startBtn = document.createElement('button');
  startBtn.className = 'primary';
  startBtn.textContent = 'Starta nytt spel';
  startBtn.onclick = () => {
    const gid = Math.random().toString(36).slice(2, 10);
    try { localStorage.setItem('itta_owner_gid', gid); } catch {}
    store.game = {
      ...store.game,
      playerAName: nameA.value.trim() || 'Spelare A',
      playerBName: nameB.value.trim() || 'Spelare B',
      playerAScore: 0,
      playerBScore: 0,
      currentTurn: 'A',
      targetLabel: '',
      targetConfidence: 0,
      isActive: true,
      winner: '',
      winPoints: parseInt(rounds.value, 10) || (store.game.winPoints || WIN_POINTS),
      canceledBy: '',
      gameId: gid,
    };
    encodeStateToURL(store.game);
    navigate('detect');
  };

  const joinBtn = document.createElement('button');
  joinBtn.className = 'ghost';
  joinBtn.textContent = hasActive ? 'Fortsätt' : 'Gå med i spel via länk';
  joinBtn.onclick = () => {
    if (!hasActive) {
      store.game.playerBName = nameA.value.trim() || store.game.playerBName || 'Spelare B';
      store.game.playerAName = store.game.playerAName || 'Spelare A';
      store.game.isActive = true;
      encodeStateToURL(store.game);
    }
    navigate(store.game.targetLabel ? 'play' : 'detect');
  };

  const testCameraBtn = document.createElement('button');
  testCameraBtn.className = 'ghost';
  testCameraBtn.textContent = 'Testa kamera';
  testCameraBtn.onclick = async () => {
    const check = await checkCameraPermissions();
    if (!check.supported || check.error) {
      alert(check.error);
      return;
    }
    const testVideo = document.createElement('video');
    testVideo.style.cssText = 'width:200px;height:150px;border:2px solid #333;margin:10px';
    const testContainer = document.createElement('div');
    testContainer.style.cssText = 'text-align:center;margin:20px 0';
    const statusDiv = document.createElement('div');
    statusDiv.textContent = 'Testar kamera och AI-modeller...';
    testContainer.appendChild(statusDiv);
    testContainer.appendChild(testVideo);
    screens.home.appendChild(testContainer);
    try {
      statusDiv.textContent = 'Laddar AI-modell...';
      await loadModel();
      statusDiv.textContent = 'AI-modell laddad, testar kamera...';
      await startCamera(testVideo);
      statusDiv.textContent = '✅ Kamera och AI fungerar!';
      statusDiv.style.color = 'green';
      setTimeout(() => testContainer.remove(), 3000);
    } catch (error) {
      statusDiv.textContent = '❌ ' + error.message;
      statusDiv.style.color = 'red';
      setTimeout(() => testContainer.remove(), 5000);
    }
  };

  wrap.appendChild(startBtn);
  wrap.appendChild(joinBtn);
  wrap.appendChild(testCameraBtn);
  screens.home.appendChild(wrap);
}
