/**
 * standings.js — final placings for the game-over screen and the text share.
 *
 * Winner first. Everyone else by how long they lasted: knocked out later
 * ranks higher. Points only break ties (several players knocked out in the
 * same round, or a game that ended early with nobody eliminated).
 */
export function rankPlayers(players, gameOver, history) {
  const outAt = {};
  (history || []).forEach((r, i) => {
    (r.newlyEliminated || []).forEach((id) => { outAt[id] = i; });
  });
  const lasted = (id) => (id in outAt ? outAt[id] : Infinity);
  const pts = (id) => gameOver?.points?.[id] ?? 0;

  return [...(players || [])].sort((a, b) => {
    if (a.socketId === gameOver?.winnerSocketId) return -1;
    if (b.socketId === gameOver?.winnerSocketId) return 1;
    const la = lasted(a.socketId);
    const lb = lasted(b.socketId);
    if (la !== lb) return la > lb ? -1 : 1;
    return pts(a.socketId) - pts(b.socketId);
  });
}
