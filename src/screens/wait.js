import { store } from '../store.js';
import { updateScoreBar, setScreen, screens } from '../ui.js';
import { stopCamera } from '../camera.js';
import { translateLabelToSv } from '../translations.js';
import { updateGame } from '../firebase.js';

export function renderWait() {
  updateScoreBar();
  setScreen('wait');
  stopCamera();
  screens.wait.innerHTML = '';

  const { game, gameId, myRole } = store;
  const c = document.createElement('div');
  c.className = 'center card';

  if (game.status === 'inviting' && myRole === 'A') {
    // Player A waiting for Player B to open the invite link and accept
    const h = document.createElement('h2');
    h.textContent = 'Inbjudan skickad!';
    c.appendChild(h);

    const msg = document.createElement('div');
    msg.textContent = `Väntar på att ${game.playerBName} accepterar inbjudan...`;
    c.appendChild(msg);

    const tip = document.createElement('div');
    tip.className = 'hint';
    tip.textContent = 'Håll den här skärmen öppen. Du får ett meddelande när motspelaren accepterar.';
    c.appendChild(tip);

    c.appendChild(makeCancelBtn(game, gameId, myRole));

  } else if (game.status === 'accepted' && myRole === 'A') {
    // Player B accepted — Player A can now start the game
    const h = document.createElement('h2');
    h.textContent = `${game.playerBName} är redo!`;
    c.appendChild(h);

    const startBtn = document.createElement('button');
    startBtn.className = 'primary';
    startBtn.textContent = 'Starta spelet!';
    startBtn.onclick = async () => {
      startBtn.disabled = true;
      await updateGame(gameId, { status: 'playing' });
      // Firebase listener navigates both players to their screens
    };
    c.appendChild(startBtn);
    c.appendChild(makeCancelBtn(game, gameId, myRole));

  } else if (game.status === 'accepted' && myRole === 'B') {
    // Player B waiting for Player A to start
    const h = document.createElement('h2');
    h.textContent = 'Inbjudan accepterad!';
    c.appendChild(h);

    const msg = document.createElement('div');
    msg.textContent = `Väntar på att ${game.playerAName} startar spelet...`;
    c.appendChild(msg);

  } else if (game.status === 'playing' && game.targetLabel) {
    // Challenger is waiting for finder to find the object
    const h = document.createElement('h2');
    h.textContent = 'Väntar på motspelaren...';
    c.appendChild(h);

    const info = document.createElement('div');
    const nameSpan = document.createElement('span');
    nameSpan.className = 'name';
    nameSpan.textContent = game.targetLabel.toUpperCase();
    info.append('Utmaningen: ', nameSpan);
    translateLabelToSv(game.targetLabel).then(sv => {
      if (sv) nameSpan.textContent = sv.toUpperCase();
    }).catch(() => {});
    c.appendChild(info);

    c.appendChild(makeCancelBtn(game, gameId, myRole));

  } else if (game.status === 'playing' && !game.targetLabel) {
    // Finder is waiting for challenger to pick an object
    const challName = game.currentTurn === 'A' ? game.playerAName : game.playerBName;
    const h = document.createElement('h2');
    h.textContent = 'Väntar på utmaning...';
    c.appendChild(h);

    const msg = document.createElement('div');
    msg.textContent = `${challName} väljer ett objekt att utmana dig med.`;
    c.appendChild(msg);
  }

  screens.wait.appendChild(c);
}

function makeCancelBtn(game, gameId, myRole) {
  const btn = document.createElement('button');
  btn.className = 'danger';
  btn.textContent = 'Avbryt spel';
  btn.style.marginTop = '1rem';
  btn.onclick = async () => {
    btn.disabled = true;
    const canceledBy = myRole === 'A' ? game.playerAName : game.playerBName;
    await updateGame(gameId, { status: 'canceled', canceledBy });
    // Firebase listener navigates both players to cancel screen
  };
  return btn;
}
