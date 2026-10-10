const { createClient } = require("redis");
const { v4: uuidv4 } = require("uuid");

const redisClient = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
});
// node-redis emits "error" on dropped connections (managed Redis such as
// Upstash closes idle ones) and reconnects on its own. Without a listener the
// unhandled "error" event would crash the whole process — and every game in it.
redisClient.on("error", (err) => console.error("Redis client error:", err.message));
redisClient.connect().catch(console.error);

module.exports = redisClient;
