import { store } from '../store.js';
import { navigate } from '../router.js';
import { encodeStateToURL } from '../urlState.js';
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

  const again = document.createElement('button');
  again.className = 'primary';
  again.textContent = 'Spela igen';
  again.onclick = () => {
    const pa = store.game.playerAName || 'Spelare A';
    const pb = store.game.playerBName || 'Spelare B';
    store.game = { ...DEFAULT_GAME, playerAName: pa, playerBName: pb };
    encodeStateToURL(store.game);
    navigate('home');
  };

  c.appendChild(msg);
  c.appendChild(again);
  screens.win.appendChild(c);
}
