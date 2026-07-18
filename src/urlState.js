// Only the game ID (and optional mode) is stored in the URL; all other game
// state lives in Netlify Blobs.

export function getGameIdFromURL() {
  return new URL(location.href).searchParams.get('gid') || '';
}

export function getModeFromURL() {
  return new URL(location.href).searchParams.get('mode') || '';
}

export function setGameIdInURL(gameId) {
  const url = new URL(location.href);
  const mode = url.searchParams.get('mode');
  url.search = '';
  if (gameId) url.searchParams.set('gid', gameId);
  if (mode) url.searchParams.set('mode', mode);
  history.replaceState({}, '', url);
}
