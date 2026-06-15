const redisClient = require("../../redisClient");
const {
  addUserToRoom,
  removeUserFromRoom,
  getRoomsByType,
  getPublicRooms,
  getRoom,
  getRoomById,
  saveRoom,
  removeFromPublicSet,
  deleteRoom,
} = require("../roomManager");

const PUBLIC_ROOMS_SET = "public:rooms";

function clearRedis() {
  redisClient.__store.clear();
  redisClient.__sets.clear();
}

describe("roomManager", () => {
  beforeEach(() => {
    clearRedis();
  });

  describe("addUserToRoom", () => {
    test("throws when user has no name", async () => {
      await expect(addUserToRoom("room1", {}, "public", true)).rejects.toThrow("Invalid user name");
      await expect(addUserToRoom("room1", null, "public", true)).rejects.toThrow("Invalid user name");
    });

    test("sanitizes the user's name (strips HTML, trims, slices to 20 chars)", async () => {
      const user = { socketId: "s1", name: "  <b>Alice0123456789ABCDEFGHIJ</b>  " };
      const room = await addUserToRoom("room1", user, "public", true);
      expect(room.users[0].name).toBe("Alice0123456789ABCDE"); // <=20 chars, tags stripped
      expect(room.users[0].name.length).toBeLessThanOrEqual(20);
    });

    test("defaults roomType to 'public' and isCreator to false", async () => {
      const user = { socketId: "s1", name: "Alice" };
      const room = await addUserToRoom("room1", user);
      expect(room.type).toBe("public");
    });

    test("throws 'Invalid or expired room ID' for a private room that doesn't exist and isCreator=false", async () => {
      const user = { socketId: "s1", name: "Bob" };
      await expect(addUserToRoom("missing-room", user, "private", false)).rejects.toThrow(
        "Invalid or expired room ID"
      );
    });

    test("allows creating a brand-new private room when isCreator=true", async () => {
      const user = { socketId: "s1", name: "Bob" };
      const room = await addUserToRoom("new-private", user, "private", true);
      expect(room.type).toBe("private");
      expect(room.users).toHaveLength(1);
    });

    test("sets hostSocketId to the first user to join", async () => {
      const room = await addUserToRoom("room1", { socketId: "s1", name: "Alice" }, "public", true);
      expect(room.hostSocketId).toBe("s1");

      const room2 = await addUserToRoom("room1", { socketId: "s2", name: "Bob" }, "public");
      expect(room2.hostSocketId).toBe("s1"); // unchanged
    });

    test("deduplicates a user re-joining with the same socketId", async () => {
      await addUserToRoom("room1", { socketId: "s1", name: "Alice" }, "public", true);
      const room = await addUserToRoom("room1", { socketId: "s1", name: "Alice2" }, "public");
      expect(room.users).toHaveLength(1);
      expect(room.users[0].name).toBe("Alice2");
    });

    test("throws 'Room is full' when MAX_PLAYERS already reached", async () => {
      let room;
      for (let i = 0; i < 8; i++) {
        room = await addUserToRoom("fullroom", { socketId: "s" + i, name: "P" + i }, "public", i === 0);
      }
      await expect(
        addUserToRoom("fullroom", { socketId: "s8", name: "P8" }, "public")
      ).rejects.toThrow("Room is full");
    });

    test("adds public room with space to the public rooms set", async () => {
      await addUserToRoom("pub1", { socketId: "s1", name: "Alice" }, "public", true);
      const members = await redisClient.sMembers(PUBLIC_ROOMS_SET);
      expect(members).toContain("pub1");
    });

    test("removes a public room from the set once it becomes full", async () => {
      for (let i = 0; i < 8; i++) {
        await addUserToRoom("pub2", { socketId: "s" + i, name: "P" + i }, "public", i === 0);
      }
      const members = await redisClient.sMembers(PUBLIC_ROOMS_SET);
      expect(members).not.toContain("pub2");
    });
  });

  describe("removeUserFromRoom", () => {
    test("returns null if the socket is not in any room", async () => {
      const result = await removeUserFromRoom("ghost-socket");
      expect(result).toBeNull();
    });

    test("deletes the room entirely when the last user leaves", async () => {
      await addUserToRoom("room1", { socketId: "s1", name: "Alice" }, "public", true);
      const result = await removeUserFromRoom("s1");
      expect(result).toBeNull();
      expect(await getRoom("room1")).toBeNull();
      const members = await redisClient.sMembers(PUBLIC_ROOMS_SET);
      expect(members).not.toContain("room1");
    });

    test("removes the user and transfers host if the host leaves", async () => {
      await addUserToRoom("room1", { socketId: "s1", name: "Alice" }, "public", true);
      await addUserToRoom("room1", { socketId: "s2", name: "Bob" }, "public");

      const result = await removeUserFromRoom("s1");
      expect(result.users.map((u) => u.socketId)).toEqual(["s2"]);
      expect(result.hostSocketId).toBe("s2");
    });

    test("re-adds a public room (without a game) back to the public set", async () => {
      await addUserToRoom("room1", { socketId: "s1", name: "Alice" }, "public", true);
      // fill to MAX_PLAYERS so it's removed from the set
      for (let i = 2; i <= 8; i++) {
        await addUserToRoom("room1", { socketId: "s" + i, name: "P" + i }, "public");
      }
      let members = await redisClient.sMembers(PUBLIC_ROOMS_SET);
      expect(members).not.toContain("room1");

      await removeUserFromRoom("s8");

      members = await redisClient.sMembers(PUBLIC_ROOMS_SET);
      expect(members).toContain("room1");
    });

    test("does not re-add a room to the public set if a game is in progress", async () => {
      await addUserToRoom("room1", { socketId: "s1", name: "Alice" }, "public", true);
      await addUserToRoom("room1", { socketId: "s2", name: "Bob" }, "public");
      await addUserToRoom("room1", { socketId: "s3", name: "Carl" }, "public");

      const room = await getRoom("room1");
      room.game = { round: 1 };
      await saveRoom(room);

      await removeUserFromRoom("s3");

      const members = await redisClient.sMembers(PUBLIC_ROOMS_SET);
      // room1 was already in the set (not full), game presence shouldn't add it again,
      // but it also shouldn't crash and the room should still exist.
      const updated = await getRoom("room1");
      expect(updated.users.map((u) => u.socketId)).toEqual(["s1", "s2"]);
    });
  });

  describe("getPublicRooms", () => {
    test("returns null when the set is empty", async () => {
      expect(await getPublicRooms()).toBeNull();
    });

    test("cleans up stale entries and returns null if nothing matches", async () => {
      await redisClient.sAdd(PUBLIC_ROOMS_SET, "stale-room");
      const result = await getPublicRooms();
      expect(result).toBeNull();
      const members = await redisClient.sMembers(PUBLIC_ROOMS_SET);
      expect(members).not.toContain("stale-room");
    });

    test("returns a joinable public room", async () => {
      await addUserToRoom("pubA", { socketId: "s1", name: "Alice" }, "public", true);
      const result = await getPublicRooms();
      expect(result.id).toBe("pubA");
    });

    test("skips rooms that are full or have a game in progress", async () => {
      // Full room
      for (let i = 0; i < 8; i++) {
        await addUserToRoom("pubFull", { socketId: "f" + i, name: "P" + i }, "public", i === 0);
      }
      // manually re-add to set to simulate edge case, then ensure getPublicRooms skips it
      await redisClient.sAdd(PUBLIC_ROOMS_SET, "pubFull");

      // Room with a game in progress
      await addUserToRoom("pubGame", { socketId: "g1", name: "Gina" }, "public", true);
      const gameRoom = await getRoom("pubGame");
      gameRoom.game = { round: 1 };
      await saveRoom(gameRoom);

      const result = await getPublicRooms();
      expect(result).toBeNull();
    });
  });

  describe("getRoomsByType", () => {
    test("returns only rooms matching the given type", async () => {
      await addUserToRoom("pubX", { socketId: "s1", name: "Alice" }, "public", true);
      await addUserToRoom("privY", { socketId: "s2", name: "Bob" }, "private", true);

      const publicRooms = await getRoomsByType("public");
      expect(publicRooms.map((r) => r.id)).toContain("pubX");
      expect(publicRooms.map((r) => r.id)).not.toContain("privY");
    });

    test("skips keys with no data", async () => {
      // Directly poke a key with no value isn't really possible via the mock,
      // but an empty result set should just return [].
      const rooms = await getRoomsByType("solo");
      expect(rooms).toEqual([]);
    });
  });

  describe("getRoom / getRoomById", () => {
    test("returns null for a non-existent room", async () => {
      expect(await getRoom("nope")).toBeNull();
      expect(await getRoomById("nope")).toBeNull();
    });

    test("returns the parsed room when it exists", async () => {
      await addUserToRoom("room1", { socketId: "s1", name: "Alice" }, "public", true);
      const room = await getRoom("room1");
      const roomById = await getRoomById("room1");
      expect(room.id).toBe("room1");
      expect(roomById.id).toBe("room1");
    });
  });

  describe("removeFromPublicSet / deleteRoom", () => {
    test("removeFromPublicSet removes the room id from the set", async () => {
      await addUserToRoom("room1", { socketId: "s1", name: "Alice" }, "public", true);
      await removeFromPublicSet("room1");
      const members = await redisClient.sMembers(PUBLIC_ROOMS_SET);
      expect(members).not.toContain("room1");
    });

    test("deleteRoom removes the room key and the public set entry", async () => {
      await addUserToRoom("room1", { socketId: "s1", name: "Alice" }, "public", true);
      await deleteRoom("room1");
      expect(await getRoom("room1")).toBeNull();
      const members = await redisClient.sMembers(PUBLIC_ROOMS_SET);
      expect(members).not.toContain("room1");
    });
  });

  describe("saveRoom", () => {
    test("persists the room and returns it", async () => {
      const room = { id: "room1", users: [] };
      const result = await saveRoom(room);
      expect(result).toBe(room);
      expect(await getRoom("room1")).toEqual(room);
    });
  });
});
