import { TURN_SECONDS } from './constants.js';

let timerInterval = null;
let secondsLeft = TURN_SECONDS;

export function formatTime(total) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function resetTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
  secondsLeft = TURN_SECONDS;
  document.querySelector('#play-timer')?.replaceChildren(document.createTextNode(formatTime(secondsLeft)));
}

export function startTimer(onExpire) {
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    secondsLeft -= 1;
    const el = document.querySelector('#play-timer');
    if (el) el.textContent = formatTime(secondsLeft);
    if (secondsLeft <= 0) {
      clearInterval(timerInterval);
      timerInterval = null;
      onExpire?.();
    }
  }, 1000);
}

export function stopTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
}
