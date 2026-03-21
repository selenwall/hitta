import { DEFAULT_GAME } from './constants.js';

export const store = {
  game: { ...DEFAULT_GAME },
  gameId: '',        // Current game ID (from URL)
  myRole: null,      // 'A' | 'B' | null — stored in localStorage per gameId
  unsubscribe: null, // Function to stop polling for game updates
};
