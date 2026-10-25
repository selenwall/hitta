import { DEFAULT_GAME } from './constants.js';

export const store = {
  game: { ...DEFAULT_GAME },
  gameId: '',        // Current game ID (from URL)
  myRole: null,      // 'A' | 'B' | null — persisted per gameId (see session.js)
  myToken: null,     // Secret issued by the server for myRole; sent on writes
  testMode: false,   // true when URL has ?mode=test — one device plays both roles
  unsubscribe: null, // Function to stop polling for game updates
};
