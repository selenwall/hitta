import { DEFAULT_GAME, WIN_POINTS } from './constants.js';

export function encodeStateToURL(next) {
  const url = new URL(location.href);
  const params = url.searchParams;
  params.set('pa', next.playerAName || '');
  params.set('pb', next.playerBName || '');
  params.set('sa', String(next.playerAScore || 0));
  params.set('sb', String(next.playerBScore || 0));
  params.set('t', next.currentTurn || 'A');
  params.set('lbl', next.targetLabel || '');
  params.set('cf', String(next.targetConfidence || 0));
  params.set('act', next.isActive ? '1' : '0');
  params.set('w', next.winner || '');
  params.set('wp', String(next.winPoints || WIN_POINTS));
  params.set('cx', next.canceledBy || '');
  params.set('gid', next.gameId || '');
  history.replaceState({}, '', url);
}

export function decodeStateFromURL() {
  const url = new URL(location.href);
  const p = url.searchParams;
  return {
    ...DEFAULT_GAME,
    playerAName: p.get('pa') || '',
    playerBName: p.get('pb') || '',
    playerAScore: parseInt(p.get('sa') || '0', 10) || 0,
    playerBScore: parseInt(p.get('sb') || '0', 10) || 0,
    currentTurn: (p.get('t') || 'A') === 'B' ? 'B' : 'A',
    targetLabel: p.get('lbl') || '',
    targetConfidence: parseFloat(p.get('cf') || '0') || 0,
    isActive: p.get('act') === '1',
    winner: p.get('w') || '',
    winPoints: parseInt(p.get('wp') || String(WIN_POINTS), 10) || WIN_POINTS,
    canceledBy: p.get('cx') || '',
    gameId: p.get('gid') || '',
  };
}
