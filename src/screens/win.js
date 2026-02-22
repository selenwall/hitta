import { store } from '../store.js';
import { navigate } from '../router.js';
import { setGameIdInURL } from '../urlState.js';
import { updateScoreBar, setScreen, screens } from '../ui.js';
import { DEFAULT_GAME } from '../constants.js';

export function renderWin() {
  updateScoreBar();
  setScreen('win');
  screens.win.innerHTML = '';

  const c = document.createElement('div');
  c.className = 'center card';

  const who = store.game.winner === 'A' ? store.game.playerAName : store.game.playerBName;
  const msg = document.createElement('h2');
  msg.textContent = `${who} vann!`;

  const score = document.createElement('div');
  score.className = 'hint';
  score.textContent = `${store.game.playerAName} ${store.game.playerAScore} – ${store.game.playerBScore} ${store.game.playerBName}`;

  const again = document.createElement('button');
  again.className = 'primary';
  again.textContent = 'Spela igen';
  again.onclick = () => {
    // Detach Firebase listener and clear game state to start fresh
    if (store.unsubscribe) { store.unsubscribe(); store.unsubscribe = null; }
    const pa = store.game.playerAName || 'Spelare A';
    const pb = store.game.playerBName || 'Spelare B';
    store.game = { ...DEFAULT_GAME, playerAName: pa, playerBName: pb };
    store.gameId = '';
    store.myRole = null;
    setGameIdInURL('');
    navigate('home');
  };

  c.appendChild(msg);
  c.appendChild(score);
  c.appendChild(again);
  screens.win.appendChild(c);
}
