import { store } from './store.js';
import { initFirebase, subscribeGame } from './firebase.js';
import { getGameIdFromURL } from './urlState.js';
import { updateScoreBar } from './ui.js';
import { renderHome } from './screens/home.js';
import { renderDetect } from './screens/detect.js';
import { renderWait } from './screens/wait.js';
import { renderPlay } from './screens/play.js';
import { renderWin } from './screens/win.js';
import { renderCancel } from './screens/cancel.js';

let firebaseInited = false;
let currentScreen = null;

export function navigate(screen) {
  currentScreen = screen;
  switch (screen) {
    case 'home':   renderHome();   break;
    case 'detect': renderDetect(); break;
    case 'wait':   renderWait();   break;
    case 'play':   renderPlay();   break;
    case 'win':    renderWin();    break;
    case 'cancel': renderCancel(); break;
  }
}

export function getCurrentScreen() {
  return currentScreen;
}

function routeFromGame(game) {
  if (!game) {
    if (currentScreen !== 'home') navigate('home');
    return;
  }

  // Merge Firebase data into store; keep isActive in sync for legacy helpers
  store.game = { ...store.game, ...game, isActive: game.status === 'playing' };
  updateScoreBar();

  const myRole = store.myRole;
  let targetScreen;

  switch (game.status) {
    case 'inviting':
      targetScreen = myRole === 'A' ? 'wait' : 'home';
      break;
    case 'accepted':
      targetScreen = 'wait';
      break;
    case 'playing': {
      const isChallenger = game.currentTurn === myRole;
      if (game.targetLabel) {
        // Target chosen — challenger waits, finder plays
        targetScreen = isChallenger ? 'wait' : 'play';
      } else {
        // No target yet — challenger picks, finder waits
        targetScreen = isChallenger ? 'detect' : 'wait';
      }
      break;
    }
    case 'won':
      targetScreen = 'win';
      break;
    case 'canceled':
      targetScreen = 'cancel';
      break;
    default:
      targetScreen = 'home';
  }

  if (targetScreen !== currentScreen) {
    navigate(targetScreen);
  } else if (targetScreen === 'wait') {
    // Re-render wait to reflect updated state (e.g. 'inviting' → 'accepted')
    renderWait();
  }
  // detect and play screens are NOT re-rendered mid-screen (camera/timer are active)
}

export function startSubscription(gameId) {
  if (store.unsubscribe) {
    store.unsubscribe();
    store.unsubscribe = null;
  }
  store.unsubscribe = subscribeGame(gameId, routeFromGame);
}

export function route() {
  if (!firebaseInited) {
    initFirebase();
    firebaseInited = true;
  }

  const gameId = getGameIdFromURL();
  if (gameId) {
    store.gameId = gameId;
    try {
      store.myRole = localStorage.getItem(`hitta_role_${gameId}`) || null;
    } catch {
      store.myRole = null;
    }
    startSubscription(gameId);
  } else {
    store.gameId = '';
    store.myRole = null;
    if (currentScreen !== 'home') navigate('home');
    else renderHome();
  }
}
