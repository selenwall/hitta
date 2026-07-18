import { POLL_MS } from './constants.js';

const API = '/api/game';

export async function createGame(gameId, data) {
  const res = await fetch(`${API}?id=${encodeURIComponent(gameId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create game');
}

export async function updateGame(gameId, updates) {
  const res = await fetch(`${API}?id=${encodeURIComponent(gameId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error('Failed to update game');
}

// Returns null for missing/unknown games so callers can treat it as "no game".
// Other API functions throw on failure; getGame uses null to signal the poll
// loop to call back with null (which routes both players home) rather than
// retrying on a known-missing game.
export async function getGame(gameId) {
  const res = await fetch(`${API}?id=${encodeURIComponent(gameId)}`, { cache: 'no-store' });
  if (!res.ok) return null;
  return res.json();
}

export function subscribeGame(gameId, callback) {
  let active = true;
  let prev = '';
  let lastRev = 0;

  async function poll() {
    while (active) {
      try {
        const data = await getGame(gameId);
        // Discard stale reads: the server bumps `rev` on every write, so a
        // response with a lower rev than one we've already seen is old state
        // (e.g. a lagging replica right after a turn switch) — acting on it
        // would route players back to the previous round's screens.
        const rev = data ? (data.rev || 0) : 0;
        if (data && rev < lastRev) {
          // skip
        } else {
          const json = JSON.stringify(data);
          if (json !== prev) {
            prev = json;
            lastRev = rev;
            callback(data);
          }
        }
      } catch {
        // ignore transient errors, keep polling
      }
      await new Promise(r => setTimeout(r, POLL_MS));
    }
  }

  poll();
  return () => { active = false; };
}
