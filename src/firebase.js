import { POLL_MS } from './constants.js';

const API = '/api/game';

// Unguessable-enough ID for sharing in a URL (16 base36 chars from crypto RNG).
export function newGameId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, b => (b % 36).toString(36)).join('');
}

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

// Returns null for missing/unknown games so callers can treat it as "no game"
// (the poll loop then routes the player home). Server/network errors throw
// instead, so a transient 5xx mid-round is retried rather than treated as the
// game having disappeared — which would bounce players home and restart the
// round when it came back.
export async function getGame(gameId) {
  const res = await fetch(`${API}?id=${encodeURIComponent(gameId)}`, { cache: 'no-store' });
  if (res.status === 400 || res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to load game (${res.status})`);
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
