const { createClient } = require("redis");
const { v4: uuidv4 } = require("uuid");

const redisClient = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
});
redisClient.connect().catch(console.error);

module.exports = redisClient;
