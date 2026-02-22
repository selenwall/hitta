import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js';
import {
  getDatabase,
  ref,
  set,
  get,
  update,
  onValue,
  off,
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-database.js';
import { FIREBASE_CONFIG } from './firebase-config.js';

let db;

export function initFirebase() {
  const app = initializeApp(FIREBASE_CONFIG);
  db = getDatabase(app);
}

function gameRef(gameId) {
  return ref(db, `games/${gameId}`);
}

export async function createGame(gameId, data) {
  await set(gameRef(gameId), data);
}

export async function updateGame(gameId, updates) {
  await update(gameRef(gameId), updates);
}

export async function getGame(gameId) {
  const snap = await get(gameRef(gameId));
  return snap.val();
}

export function subscribeGame(gameId, callback) {
  const r = gameRef(gameId);
  onValue(r, (snap) => callback(snap.val()));
  return () => off(r);
}
