const API = '/api/game';
const POLL_MS = 1500;

export function initFirebase() {
  // No-op — kept for router.js compatibility
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

export async function getGame(gameId) {
  const res = await fetch(`${API}?id=${encodeURIComponent(gameId)}`);
  if (!res.ok) return null;
  return res.json();
}

export function subscribeGame(gameId, callback) {
  let active = true;
  let prev = '';

  async function poll() {
    while (active) {
      try {
        const data = await getGame(gameId);
        const json = JSON.stringify(data);
        if (json !== prev) {
          prev = json;
          callback(data);
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
