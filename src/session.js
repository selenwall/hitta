// Remembers which player this device is in a game, plus the secret token the
// server issued for that role. sessionStorage keeps a role tied to its tab;
// localStorage lets a player rejoin after closing the tab or the browser.
const key = (gameId) => `hitta_player_${gameId}`;

export function saveSession(gameId, role, token) {
  const value = JSON.stringify({ role, token });
  try { sessionStorage.setItem(key(gameId), value); } catch {}
  try { localStorage.setItem(key(gameId), value); } catch {}
}

export function loadSession(gameId) {
  for (const storage of ['sessionStorage', 'localStorage']) {
    try {
      const { role, token } = JSON.parse(window[storage].getItem(key(gameId)) || 'null') || {};
      if ((role === 'A' || role === 'B') && token) return { role, token };
    } catch {}
  }
  return null;
}
