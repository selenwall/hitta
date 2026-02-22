import { store } from './store.js';

export const $ = (sel) => document.querySelector(sel);
export const $$ = (sel) => Array.from(document.querySelectorAll(sel));

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
  const active = store.game.isActive ? (store.game.currentTurn === 'A' ? 'B' : 'A') : '';
  const aClass = active === 'A' ? 'badge active' : 'badge';
  const bClass = active === 'B' ? 'badge active' : 'badge';
  scoreBar.innerHTML = `
    <span class="${aClass}">${aName}<span class="vs"> ${store.game.playerAScore}</span></span>
    <span class="vs">vs</span>
    <span class="${bClass}"><span class="vs">${store.game.playerBScore} </span>${bName}</span>
  `;
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
    navigator.share({ title: 'itta! utmaning', text, url }).catch(() => {});
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
