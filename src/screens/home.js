import { store } from '../store.js';
import { navigate, startSubscription } from '../router.js';
import { setGameIdInURL } from '../urlState.js';
import { updateScoreBar, setScreen, screens } from '../ui.js';
import { checkCameraPermissions, startCamera } from '../camera.js';
import { loadModel } from '../detector.js';
import { WIN_POINTS } from '../constants.js';
import { createGame, updateGame, getGame } from '../firebase.js';

export function renderHome() {
  updateScoreBar();
  setScreen('home');
  screens.home.innerHTML = '';

  // If there is a game ID but no role, this is Player B accepting an invite
  if (store.gameId && !store.myRole) {
    renderAcceptInvite();
  } else {
    renderCreateGame();
  }
}

function renderCreateGame() {
  const wrap = document.createElement('div');
  wrap.className = 'col card';

  const title = document.createElement('h2');
  title.textContent = 'Nytt spel';
  wrap.appendChild(title);

  const cameraInfo = document.createElement('div');
  cameraInfo.className = 'hint';
  cameraInfo.innerHTML = '💡 <strong>Kameraproblem?</strong> Klicka på "Testa kamera" för att kontrollera behörigheter.';
  wrap.appendChild(cameraInfo);

  const nameA = document.createElement('input');
  nameA.placeholder = 'Ditt namn';
  nameA.value = store.game.playerAName || '';
  nameA.autocapitalize = 'words';
  nameA.autocomplete = 'name';
  wrap.appendChild(nameA);

  const nameB = document.createElement('input');
  nameB.placeholder = 'Motspelaren namn';
  nameB.value = store.game.playerBName || '';
  wrap.appendChild(nameB);

  const roundsRow = document.createElement('div');
  roundsRow.className = 'row';
  const roundsLabel = document.createElement('label');
  roundsLabel.textContent = 'Poäng att vinna:';
  const rounds = document.createElement('select');
  [1, 3, 5].forEach(n => {
    const opt = document.createElement('option');
    opt.value = String(n);
    opt.textContent = String(n);
    if ((store.game.winPoints || WIN_POINTS) === n) opt.selected = true;
    rounds.appendChild(opt);
  });
  roundsRow.appendChild(roundsLabel);
  roundsRow.appendChild(rounds);
  wrap.appendChild(roundsRow);

  const sendBtn = document.createElement('button');
  sendBtn.className = 'primary';
  sendBtn.textContent = 'Skicka spelinbjudan';
  sendBtn.onclick = async () => {
    sendBtn.disabled = true;
    sendBtn.textContent = 'Skapar spel...';

    const playerAName = nameA.value.trim() || 'Spelare A';
    const playerBName = nameB.value.trim() || 'Spelare B';
    const winPoints = parseInt(rounds.value, 10) || WIN_POINTS;
    const gameId = Math.random().toString(36).slice(2, 10);

    try { localStorage.setItem(`hitta_role_${gameId}`, 'A'); } catch {}
    store.myRole = 'A';
    store.gameId = gameId;

    await createGame(gameId, {
      playerAName,
      playerBName,
      playerAScore: 0,
      playerBScore: 0,
      currentTurn: 'A',
      targetLabel: '',
      targetConfidence: 0,
      status: 'inviting',
      winner: '',
      winPoints,
      canceledBy: '',
      createdAt: Date.now(),
    });

    setGameIdInURL(gameId);

    // Start Firebase subscription — it will navigate to 'wait' once data arrives
    startSubscription(gameId);

    // Share the invite link
    const url = location.href;
    const text = `${playerAName} utmanar dig till Hitta! – Objektduellen. Öppna länken för att acceptera:`;
    if (navigator.share) {
      navigator.share({ title: 'Hitta! – Inbjudan', text, url }).catch(() => {});
    } else {
      const smsUrl = `sms:?&body=${encodeURIComponent(`${text} ${url}`)}`;
      const opened = window.open(smsUrl, '_blank');
      if (!opened) {
        const wa = `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`;
        const openedWa = window.open(wa, '_blank');
        if (!openedWa && navigator.clipboard?.writeText) {
          try {
            await navigator.clipboard.writeText(`${text} ${url}`);
            alert('Inbjudningslänk kopierad! Klistra in i valfri app.');
          } catch {}
        }
      }
    }
  };
  wrap.appendChild(sendBtn);

  const testCameraBtn = document.createElement('button');
  testCameraBtn.className = 'ghost';
  testCameraBtn.textContent = 'Testa kamera';
  testCameraBtn.onclick = async () => {
    const check = await checkCameraPermissions();
    if (!check.supported || check.error) { alert(check.error); return; }
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
  wrap.appendChild(testCameraBtn);
  screens.home.appendChild(wrap);
}

async function renderAcceptInvite() {
  screens.home.innerHTML = '<div class="center card"><div>Laddar inbjudan...</div></div>';

  const game = await getGame(store.gameId);
  if (!game) {
    screens.home.innerHTML = '<div class="center card"><div>Spelet hittades inte. Kontrollera länken.</div></div>';
    return;
  }

  // If game is already canceled or finished, show appropriate message
  if (game.status === 'canceled' || game.status === 'won') {
    screens.home.innerHTML = '<div class="center card"><div>Det här spelet är redan avslutat.</div></div>';
    return;
  }

  screens.home.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'col card';

  const title = document.createElement('h2');
  title.textContent = `${game.playerAName} bjuder in dig!`;
  wrap.appendChild(title);

  const sub = document.createElement('div');
  sub.className = 'hint';
  sub.textContent = `Spelomgångar: ${game.winPoints}`;
  wrap.appendChild(sub);

  const nameInput = document.createElement('input');
  nameInput.placeholder = 'Ditt namn';
  nameInput.value = game.playerBName || '';
  nameInput.autocapitalize = 'words';
  nameInput.autocomplete = 'name';
  wrap.appendChild(nameInput);

  const acceptBtn = document.createElement('button');
  acceptBtn.className = 'primary';
  acceptBtn.textContent = 'Acceptera inbjudan';
  acceptBtn.onclick = async () => {
    acceptBtn.disabled = true;
    acceptBtn.textContent = 'Accepterar...';
    const playerBName = nameInput.value.trim() || 'Spelare B';
    try { localStorage.setItem(`hitta_role_${store.gameId}`, 'B'); } catch {}
    store.myRole = 'B';
    await updateGame(store.gameId, { playerBName, status: 'accepted' });
    // Firebase listener (already set up in route()) will navigate to 'wait'
  };
  wrap.appendChild(acceptBtn);
  screens.home.appendChild(wrap);
}
