// URL state is now minimal — only the game ID is stored in the URL.
// All other game state lives in Firebase Realtime Database.

export function getGameIdFromURL() {
  return new URL(location.href).searchParams.get('gid') || '';
}

export function setGameIdInURL(gameId) {
  const url = new URL(location.href);
  url.search = '';
  if (gameId) url.searchParams.set('gid', gameId);
  history.replaceState({}, '', url);
}
