export const WIN_POINTS = 5;
export const TURN_SECONDS = 120;
export const MIN_SCORE = 0.6;
export const POLL_MS = 800;
export const LIVE_DETECT_MS = 600;
// Sent with every API request. Bump together with MIN_CLIENT_VERSION in
// netlify/functions/game.js when the API changes incompatibly; open tabs
// running older code then reload themselves.
export const CLIENT_VERSION = 2;

export const DEFAULT_GAME = {
  playerAName: '',
  playerBName: '',
  playerAScore: 0,
  playerBScore: 0,
  currentTurn: 'A',
  targetLabel: '',
  targetConfidence: 0,
  isActive: false,
  winner: '',
  winPoints: 5,
  canceledBy: '',
  gameId: '',
};
