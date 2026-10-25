import { store } from './store.js';
import { subscribeGame } from './firebase.js';
import { getGameIdFromURL, getModeFromURL, setGameIdInURL } from './urlState.js';
import { loadSession } from './session.js';
import { DEFAULT_GAME } from './constants.js';
import { updateScoreBar, hideLoader } from './ui.js';
import { stopCamera } from './camera.js';
import { stopTimer } from './timer.js';
import { renderHome } from './screens/home.js';
import { renderDetect } from './screens/detect.js';
import { renderWait } from './screens/wait.js';
import { renderPlay } from './screens/play.js';
import { renderWin } from './screens/win.js';
import { renderCancel } from './screens/cancel.js';
import { renderPlayground } from './screens/playground.js';

let currentScreen = null;

export function navigate(screen) {
  currentScreen = screen;
  // Leaving a screen must release everything it started: otherwise e.g. the
  // opponent canceling mid-round leaves the camera on and the turn timer
  // running, and its expiry would submit a round from the cancel screen.
  stopTimer();
  stopCamera();
  hideLoader();
  switch (screen) {
    case 'home':   renderHome();   break;
    case 'detect': renderDetect(); break;
    case 'wait':   renderWait();   break;
    case 'play':   renderPlay();   break;
    case 'win':    renderWin();    break;
    case 'cancel': renderCancel(); break;
    case 'playground': renderPlayground(); break;
  }
}

// Drops this device out of the current game (keeping the names for the next
// one) and goes to the start screen. Server state is not touched.
export function leaveGame() {
  if (store.unsubscribe) { store.unsubscribe(); store.unsubscribe = null; }
  const pa = store.game.playerAName || 'Spelare A';
  const pb = store.game.playerBName || 'Spelare B';
  store.game = { ...DEFAULT_GAME, playerAName: pa, playerBName: pb };
  store.gameId = '';
  store.myRole = null;
  store.myToken = null;
  setGameIdInURL('');
  navigate('home');
}

export function getCurrentScreen() {
  return currentScreen;
}

function routeFromGame(game) {
  if (!game) {
    if (currentScreen !== 'home') navigate('home');
    return;
  }

  // If the local store has a more advanced status (optimistic update),
  // don't let a stale poll response overwrite it
  const statusOrder = { inviting: 0, accepted: 1, playing: 2, won: 3, canceled: 3 };
  const serverRank = statusOrder[game.status] ?? -1;
  const localRank = statusOrder[store.game.status] ?? -1;
  const effectiveStatus = serverRank >= localRank ? game.status : store.game.status;

  // Merge server data into store; keep isActive in sync with status
  store.game = { ...store.game, ...game, status: effectiveStatus, isActive: effectiveStatus === 'playing' };
  updateScoreBar();

  const myRole = store.myRole;
  let targetScreen;

  // If we have no role, send user to home to join/create
  if (!myRole) {
    if (currentScreen !== 'home') navigate('home');
    return;
  }

  switch (effectiveStatus) {
    case 'inviting':
      targetScreen = myRole === 'A' ? 'wait' : 'home';
      break;
    case 'accepted':
      targetScreen = 'wait';
      break;
    case 'playing': {
      if (store.testMode) {
        // Test mode: one device plays both roles — pick a target when none is
        // set, then find it yourself.
        targetScreen = game.targetLabel ? 'play' : 'detect';
        break;
      }
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
  store.testMode = getModeFromURL() === 'test';
  if (store.testMode) {
    const brand = document.querySelector('.brand');
    if (brand) brand.textContent = 'Hitta! – TEST';
  }
  const gameId = getGameIdFromURL();
  if (gameId) {
    // Only read from storage if this game's role isn't already live in memory.
    // A spurious popstate (common on mobile) would otherwise overwrite a
    // freshly-set in-memory role with an empty storage read.
    if (gameId !== store.gameId || !store.myRole) {
      const session = loadSession(gameId);
      store.myRole = session?.role || null;
      store.myToken = session?.token || null;
    }
    store.gameId = gameId;
    startSubscription(gameId);
  } else {
    store.gameId = '';
    store.myRole = null;
    store.myToken = null;
    if (currentScreen !== 'home') navigate('home');
    else renderHome();
  }
}
