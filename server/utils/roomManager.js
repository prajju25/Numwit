// server/utils/roomManager.js
const { ROOM_PREFIX, MAX_PLAYERS } = require("../constants/constants");
const redis = require("../redisClient");

const ROOM_TTL_SECONDS = 3600;
const PUBLIC_ROOMS_SET = "public:rooms"; // Redis SET of joinable public room IDs

function getRoomKey(roomId) {
  return ROOM_PREFIX + roomId;
}

// ── saveRoom ───────────────────────────────────────────────────────────────────
async function saveRoom(room) {
  room.lastActiveAt = Date.now();
  const key = getRoomKey(room.id);
  await redis.set(key, JSON.stringify(room), { EX: ROOM_TTL_SECONDS });
  return room;
}

// ── addUserToRoom ──────────────────────────────────────────────────────────────
async function addUserToRoom(roomId, user, roomType, isCreator) {
  if (roomType === undefined) roomType = "public";
  if (isCreator === undefined) isCreator = false;

  if (user?.name) {
    user.name = user.name.replace(/<[^>]*>/g, "").trim().slice(0, 20);
  }
  if (!user || !user.name) throw new Error("Invalid user name");

  const key = getRoomKey(roomId);
  const roomData = await redis.get(key);
  if (roomType === "private" && !roomData && !isCreator) {
    throw new Error("Invalid or expired room ID");
  }

  const room = roomData
    ? JSON.parse(roomData)
    : { id: roomId, users: [] };

  if (room.users.length >= MAX_PLAYERS) throw new Error("Room is full");

  // Track host: first user to join is the host
  if (!room.hostSocketId) {
    room.hostSocketId = user.socketId;
  }

  room.type = roomType;

  // Remove any stale entry for this user — either the same socket
  // reconnecting, or (Phase 4) the same device rejoining with a fresh
  // socket.id after a page refresh. If the stale entry was the host,
  // transfer host status to the new connection.
  room.users = room.users.filter(function(u) {
    const isStale = u.socketId === user.socketId ||
      (user.deviceId && u.deviceId === user.deviceId);
    if (isStale && room.hostSocketId === u.socketId) {
      room.hostSocketId = user.socketId;
    }
    return !isStale;
  });
  room.users.push(user);
  room.lastActiveAt = Date.now();

  await redis.set(key, JSON.stringify(room), { EX: ROOM_TTL_SECONDS });

  // Add to public:rooms SET when a public room has space
  if (roomType === "public" && room.users.length < MAX_PLAYERS) {
    await redis.sAdd(PUBLIC_ROOMS_SET, roomId);
  }
  // Remove from SET when full
  if (roomType === "public" && room.users.length >= MAX_PLAYERS) {
    await redis.sRem(PUBLIC_ROOMS_SET, roomId);
  }

  return room;
}

// ── removeUserFromRoom ─────────────────────────────────────────────────────────
// Pass roomId when it's known (the lobby tracks socket → room): that's one
// GET. Without it — or if the user isn't in that room after all — every room
// is scanned, which costs a Redis round trip per room.
async function removeUserFromRoom(socketId, roomId) {
  if (roomId) {
    const key = getRoomKey(roomId);
    const raw = await redis.get(key);
    const result = raw ? await removeFromRoomData(key, JSON.parse(raw), socketId) : NOT_HERE;
    if (result !== NOT_HERE) return result;
  }

  const keys = await redis.keys(`${ROOM_PREFIX}*`);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (roomId && key === getRoomKey(roomId)) continue; // already checked
    const raw = await redis.get(key);
    if (!raw) continue;
    const result = await removeFromRoomData(key, JSON.parse(raw), socketId);
    if (result !== NOT_HERE) return result;
  }

  return null;
}

const NOT_HERE = Symbol("not in this room");

// Removes socketId from one room. Returns the updated room, null if the room
// was deleted (last user left), or NOT_HERE if the user wasn't in it.
async function removeFromRoomData(key, room, socketId) {
  const updatedUsers = room.users.filter(function(u) { return u.socketId !== socketId; });
  if (updatedUsers.length === room.users.length) return NOT_HERE;

  if (updatedUsers.length === 0) {
    await redis.del(key);
    await redis.sRem(PUBLIC_ROOMS_SET, room.id);
    return null;
  }

  room.users = updatedUsers;

  // Transfer host if the host left
  if (room.hostSocketId === socketId) {
    room.hostSocketId = updatedUsers[0].socketId;
  }

  await redis.set(key, JSON.stringify(room), { EX: ROOM_TTL_SECONDS });

  // Re-add to public SET if it has space again
  if (room.type === "public" && !room.game) {
    await redis.sAdd(PUBLIC_ROOMS_SET, room.id);
  }

  return room;
}

// ── getPublicRooms ─────────────────────────────────────────────────────────────
// O(1) lookup using the public:rooms SET instead of O(N) full key scan
async function getPublicRooms() {
  const roomIds = await redis.sMembers(PUBLIC_ROOMS_SET);

  for (let i = 0; i < roomIds.length; i++) {
    const roomData = await redis.get(getRoomKey(roomIds[i]));
    if (!roomData) {
      // Stale entry — clean up SET
      await redis.sRem(PUBLIC_ROOMS_SET, roomIds[i]);
      continue;
    }
    const room = JSON.parse(roomData);
    if (room.type === "public" && room.users.length < MAX_PLAYERS && !room.game) {
      return room;
    }
  }
  return null;
}

// ── getRoomsByType (for future display) ───────────────────────────────────────
async function getRoomsByType(roomType) {
  const keys = await redis.keys(`${ROOM_PREFIX}*`);
  const rooms = [];
  for (let i = 0; i < keys.length; i++) {
    const roomData = await redis.get(keys[i]);
    if (!roomData) continue;
    const room = JSON.parse(roomData);
    if (room.type === roomType) rooms.push(room);
  }
  return rooms;
}

// ── getRoomCounts (admin dashboard) ────────────────────────────────────────────
// Aggregate live counts across all rooms: totals plus a breakdown by room
// type (public / private / solo) and waiting-vs-in-progress.
async function getRoomCounts() {
  const keys = await redis.keys(`${ROOM_PREFIX}*`);

  const counts = {
    totalRooms: 0,
    totalPlayers: 0,
    waitingRooms: 0,
    gamesInProgress: 0,
    byType: {
      public:  { rooms: 0, players: 0 },
      private: { rooms: 0, players: 0 },
      solo:    { rooms: 0, players: 0 },
    },
  };

  for (let i = 0; i < keys.length; i++) {
    const raw = await redis.get(keys[i]);
    if (!raw) continue;
    const room = JSON.parse(raw);
    const type = room.type || "public";
    const playerCount = (room.users || []).length;

    counts.totalRooms++;
    counts.totalPlayers += playerCount;
    if (room.game) counts.gamesInProgress++;
    else counts.waitingRooms++;

    if (!counts.byType[type]) counts.byType[type] = { rooms: 0, players: 0 };
    counts.byType[type].rooms++;
    counts.byType[type].players += playerCount;
  }

  return counts;
}

// ── getActiveRooms (admin dashboard) ───────────────────────────────────────────
// Full list of live rooms with enough detail to render "active room" cards:
// id, type, player count/names, and whether a game is currently in progress.
// In-progress rooms are sorted first, then by player count (descending).
async function getActiveRooms() {
  const keys = await redis.keys(`${ROOM_PREFIX}*`);
  const rooms = [];

  for (let i = 0; i < keys.length; i++) {
    const raw = await redis.get(keys[i]);
    if (!raw) continue;
    const room = JSON.parse(raw);
    const users = room.users || [];

    rooms.push({
      id: room.id,
      type: room.type || "public",
      playerCount: users.length,
      players: users.map(function(u) {
        return { name: u.name, avatar: u.avatar, isBot: !!u.isBot };
      }),
      inProgress: !!room.game,
      gameEnded: !!room.gameEnded,
      round: room.game ? (room.game.round || null) : null,
      lastActiveAt: room.lastActiveAt || null,
    });
  }

  rooms.sort(function(a, b) {
    if (a.inProgress !== b.inProgress) return a.inProgress ? -1 : 1;
    return b.playerCount - a.playerCount;
  });

  return rooms;
}

// ── getRoom / getRoomById ──────────────────────────────────────────────────────
async function getRoom(roomId) {
  const roomData = await redis.get(getRoomKey(roomId));
  return roomData ? JSON.parse(roomData) : null;
}

async function getRoomById(roomId) {
  const roomData = await redis.get(getRoomKey(roomId));
  return roomData ? JSON.parse(roomData) : null;
}

// ── removeFromPublicSet (called when game starts) ─────────────────────────────
async function removeFromPublicSet(roomId) {
  await redis.sRem(PUBLIC_ROOMS_SET, roomId);
}

// ── deleteRoom (bot-fill cleanup: room with only bots left) ────────────────────
async function deleteRoom(roomId) {
  await redis.del(getRoomKey(roomId));
  await redis.sRem(PUBLIC_ROOMS_SET, roomId);
}

module.exports = {
  addUserToRoom,
  removeUserFromRoom,
  getRoomsByType,
  getRoomCounts,
  getActiveRooms,
  getPublicRooms,
  getRoom,
  getRoomById,
  saveRoom,
  removeFromPublicSet,
  deleteRoom,
};
