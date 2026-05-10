import { store } from './store.js';
import { translateLabelToSv } from './translations.js';

export const screens = {
  home: document.querySelector('#screen-home'),
  detect: document.querySelector('#screen-detect'),
  wait: document.querySelector('#screen-wait'),
  play: document.querySelector('#screen-play'),
  win: document.querySelector('#screen-win'),
  cancel: document.querySelector('#screen-cancel'),
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
  scoreBar.innerHTML = `
    <span class="${aClass}">${aName}<span class="vs"> ${store.game.playerAScore}</span></span>
    <span class="vs">vs</span>
    <span class="${bClass}"><span class="vs">${store.game.playerBScore} </span>${bName}</span>
  `;
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
