import { store } from '../store.js';
import { leaveGame } from '../router.js';
import { updateGame } from '../firebase.js';
import { updateScoreBar, setScreen, screens } from '../ui.js';

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
  home.onclick = leaveGame;

  c.appendChild(msg);
  c.appendChild(info);
  c.appendChild(home);
  screens.cancel.appendChild(c);
}

// "Avbryt spel" button shared by all in-game screens. The resulting status
// change reaches every player (this one included) through the poll loop.
export function makeCancelButton() {
  const btn = document.createElement('button');
  btn.className = 'danger';
  btn.textContent = 'Avbryt spel';
  btn.onclick = async () => {
    btn.disabled = true;
    btn.textContent = 'Avbryter...';
    const canceledBy = store.myRole === 'A' ? store.game.playerAName : store.game.playerBName;
    try {
      await updateGame(store.gameId, { status: 'canceled', canceledBy });
    } catch (err) {
      console.error('Kunde inte avbryta spelet:', err);
      if (err.status === 403) {
        // The server doesn't recognise this device as a player (e.g. its
        // token was lost), so it can't cancel — but the player still wants
        // out: leave the game locally.
        leaveGame();
        return;
      }
      btn.disabled = false;
      btn.textContent = 'Avbryt spel';
      alert('Kunde inte avbryta spelet. Kontrollera din anslutning och försök igen.');
    }
  };
  return btn;
}
