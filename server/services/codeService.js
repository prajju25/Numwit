// server/services/codeService.js
// Maps short 6-char alphanumeric codes → roomId.
// Codes are created when a private room is created and expire with the room.
// Storage: in-memory Map (good enough for single-node; swap for Redis in Phase 4).

var CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";
var CODE_LENGTH = 6;

// code → roomId
var codeToRoom = new Map();
// roomId → code  (reverse lookup for deduplication)
var roomToCode = new Map();

function generateCode() {
  var code = "";
  for (var i = 0; i < CODE_LENGTH; i++) {
    code += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return code;
}

/**
 * Create (or return existing) code for a roomId.
 * @param {string} roomId
 * @returns {string} code
 */
function getOrCreateCode(roomId) {
  if (roomToCode.has(roomId)) {
    return roomToCode.get(roomId);
  }

  var code;
  do { code = generateCode(); } while (codeToRoom.has(code));

  codeToRoom.set(code, roomId);
  roomToCode.set(roomId, code);
  return code;
}

/**
 * Resolve a code to a roomId. Returns null if not found.
 * @param {string} code
 * @returns {string|null}
 */
function resolveCode(code) {
  return codeToRoom.get(code) || null;
}

/**
 * Remove a room's code (call when room is deleted).
 * @param {string} roomId
 */
function removeRoom(roomId) {
  var code = roomToCode.get(roomId);
  if (code) {
    codeToRoom.delete(code);
    roomToCode.delete(roomId);
  }
}

module.exports = { getOrCreateCode, resolveCode, removeRoom };
