// File: backend/src/utils/cache.js

import redis from "../config/redis.js";

const cache = {
  async get(key) {
    try {
      const data = await redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      console.error("Cache get error:", e.message);
      return null;
    }
  },

  async set(key, value, ttl = 300) {
    try {
      await redis.setex(key, ttl, JSON.stringify(value));
    } catch (e) {
      console.error("Cache set error:", e.message);
    }
  },

  async del(key) {
    try {
      await redis.del(key);
    } catch (e) {
      console.error("Cache del error:", e.message);
    }
  },

  async flushAll() {
    try {
      await redis.flushdb();
    } catch (e) {
      console.error("Cache flush error:", e.message);
    }
  },
};

export const flushCache = () => cache.flushAll();
export default cache;