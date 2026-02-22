import { store } from '../store.js';
import { navigate } from '../router.js';
import { encodeStateToURL } from '../urlState.js';
import { updateScoreBar, setScreen, screens } from '../ui.js';
import { stopCamera } from '../camera.js';
import { translateLabelToSv } from '../translations.js';

export function renderWait() {
  updateScoreBar();
  setScreen('wait');
  stopCamera();
  screens.wait.innerHTML = '';

  const c = document.createElement('div');
  c.className = 'center card';

  const info = document.createElement('div');
  info.innerHTML = `<div>Delad utmaning: <span class="name">${(store.game.targetLabel || '-').toUpperCase()}</span></div>`;
  translateLabelToSv(store.game.targetLabel).then(sv => {
    const span = info.querySelector('.name');
    if (span && sv) span.textContent = (sv || '').toUpperCase();
  }).catch(() => {});

  const tip = document.createElement('div');
  tip.className = 'hint';
  tip.textContent = 'Väntar på motspelaren. Dela länken om du inte gjort det.';

  const back = document.createElement('button');
  back.className = 'ghost';
  back.textContent = 'Till startsidan';
  back.onclick = () => navigate('home');

  try {
    if (store.game.gameId && localStorage.getItem('itta_owner_gid') === store.game.gameId) {
      const cancel = document.createElement('button');
      cancel.className = 'danger';
      cancel.textContent = 'Avbryt spel';
      cancel.onclick = () => {
        store.game.isActive = false;
        store.game.canceledBy = store.game.playerAName || 'Spelare A';
        encodeStateToURL(store.game);
        navigate('cancel');
      };
      c.appendChild(cancel);
    }
  } catch {}

  c.appendChild(info);
  c.appendChild(tip);
  c.appendChild(back);
  screens.wait.appendChild(c);
}
