// Only the game ID is stored in the URL; all other game state lives in Netlify Blobs.

export function getGameIdFromURL() {
  return new URL(location.href).searchParams.get('gid') || '';
}

export function setGameIdInURL(gameId) {
  const url = new URL(location.href);
  url.search = '';
  if (gameId) url.searchParams.set('gid', gameId);
  history.replaceState({}, '', url);
}
