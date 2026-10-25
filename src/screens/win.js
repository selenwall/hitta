import { store } from '../store.js';
import { leaveGame } from '../router.js';
import { updateScoreBar, setScreen, screens } from '../ui.js';

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
  again.onclick = leaveGame;

  c.appendChild(msg);
  c.appendChild(score);
  c.appendChild(again);
  screens.win.appendChild(c);
}
