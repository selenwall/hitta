import { store } from './store.js';
import { translateLabelToSv } from './translations.js';

export const screens = {
  home: document.querySelector('#screen-home'),
  detect: document.querySelector('#screen-detect'),
  wait: document.querySelector('#screen-wait'),
  play: document.querySelector('#screen-play'),
  win: document.querySelector('#screen-win'),
  cancel: document.querySelector('#screen-cancel'),
  playground: document.querySelector('#screen-playground'),
};

const scoreBar = document.querySelector('#scoreBar');

export function setScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
}

export function updateScoreBar() {
  const aName = store.game.playerAName || 'Spelare A';
  const bName = store.game.playerBName || 'Spelare B';
  const isPlaying = store.game.status === 'playing' || store.game.isActive;
  const active = isPlaying ? (store.game.currentTurn === 'A' ? 'B' : 'A') : '';
  const aClass = active === 'A' ? 'badge active' : 'badge';
  const bClass = active === 'B' ? 'badge active' : 'badge';
  // Names come from the other player via the server, so build with text nodes
  // rather than innerHTML to avoid script injection.
  const span = (className, ...children) => {
    const el = document.createElement('span');
    el.className = className;
    el.append(...children);
    return el;
  };
  scoreBar.replaceChildren(
    span(aClass, aName, span('vs', ` ${store.game.playerAScore}`)),
    ' ',
    span('vs', 'vs'),
    ' ',
    span(bClass, span('vs', `${store.game.playerBScore} `), bName),
  );
}

export function buildDetectionBox(x, y, w, h, scaleX, scaleY, label, confidence) {
  const box = document.createElement('div');
  box.className = 'box';
  box.style.left = `${x * scaleX}px`;
  box.style.top = `${y * scaleY}px`;
  box.style.width = `${w * scaleX}px`;
  box.style.height = `${h * scaleY}px`;
  const lab = document.createElement('label');
  lab.textContent = `${label.toUpperCase()} ${(confidence * 100).toFixed(0)}%`;
  translateLabelToSv(label).then(sv => {
    lab.textContent = `${(sv || '').toUpperCase()} ${(confidence * 100).toFixed(0)}%`;
  }).catch(() => {});
  return { box, lab };
}

export function showFeedbackPlusOne() {
  const node = document.createElement('div');
  node.className = 'feedback';
  node.innerHTML = '👍 <span class="plus">+1</span>';
  document.body.appendChild(node);
  setTimeout(() => node.remove(), 3000);
}

// Replaces the camera view with an error and a retry button, so a player whose
// camera or model failed mid-game can recover without leaving the game.
export function showCameraError(videoWrap, message, onRetry) {
  const box = document.createElement('div');
  box.className = 'center card';
  const msg = document.createElement('div');
  msg.className = 'notice';
  msg.textContent = message;
  const retry = document.createElement('button');
  retry.className = 'primary';
  retry.textContent = 'Försök igen';
  retry.onclick = onRetry;
  box.append(msg, retry);
  videoWrap.replaceWith(box);
}

let loaderEl = null;

export function showLoader(msg = 'Laddar AI-modell...') {
  if (loaderEl) return;
  loaderEl = document.createElement('div');
  loaderEl.className = 'loader-overlay';
  loaderEl.innerHTML = `<div class="loader-spinner"></div><div class="loader-msg">${msg}</div>`;
  document.body.appendChild(loaderEl);
}

export function hideLoader() {
  if (loaderEl) {
    loaderEl.remove();
    loaderEl = null;
  }
}

export async function shareLink(text) {
  const url = location.href;
  const full = `${text} ${url}`.trim();
  if (navigator.share) {
    navigator.share({ title: 'Hitta! – Inbjudan', text, url }).catch(() => {});
    return;
  }
  const sms = `sms:?&body=${encodeURIComponent(full)}`;
  const opened = window.open(sms, '_blank');
  if (!opened) {
    const wa = `https://wa.me/?text=${encodeURIComponent(full)}`;
    const openedWa = window.open(wa, '_blank');
    if (!openedWa && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(full);
        alert('Länk kopierad. Klistra in i valfri app.');
      } catch {}
    }
  }
}
