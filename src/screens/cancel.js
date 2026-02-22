import { store } from '../store.js';
import { navigate } from '../router.js';
import { setGameIdInURL } from '../urlState.js';
import { updateScoreBar, setScreen, screens } from '../ui.js';
import { DEFAULT_GAME } from '../constants.js';

export function renderCancel() {
  updateScoreBar();
  setScreen('cancel');
  screens.cancel.innerHTML = '';

  const c = document.createElement('div');
  c.className = 'center card';

  const msg = document.createElement('h2');
  msg.textContent = `${store.game.canceledBy || 'Spelaren'} avbröt spelet`;

  const info = document.createElement('div');
  info.className = 'notice';
  info.textContent = 'Spelet är avslutat. Starta ett nytt spel från startsidan.';

  const home = document.createElement('button');
  home.className = 'primary';
  home.textContent = 'Till startsidan';
  home.onclick = () => {
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
  c.appendChild(info);
  c.appendChild(home);
  screens.cancel.appendChild(c);
}
