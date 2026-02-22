import { store } from './store.js';
import { decodeStateFromURL } from './urlState.js';
import { updateScoreBar } from './ui.js';
import { renderHome } from './screens/home.js';
import { renderDetect } from './screens/detect.js';
import { renderWait } from './screens/wait.js';
import { renderPlay } from './screens/play.js';
import { renderWin } from './screens/win.js';
import { renderCancel } from './screens/cancel.js';

export function navigate(screen) {
  switch (screen) {
    case 'home': renderHome(); break;
    case 'detect': renderDetect(); break;
    case 'wait': renderWait(); break;
    case 'play': renderPlay(); break;
    case 'win': renderWin(); break;
    case 'cancel': renderCancel(); break;
  }
}

export function route() {
  store.game = decodeStateFromURL();
  updateScoreBar();
  if (store.game.canceledBy) { renderCancel(); return; }
  if (!store.game.isActive) { renderHome(); return; }
  if (store.game.winner) { renderWin(); return; }
  if (store.game.targetLabel) { renderPlay(); return; }
  renderDetect();
}
