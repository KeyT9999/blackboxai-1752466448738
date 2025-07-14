const redis = require('redis');
const { redisUrl, nodeEnv } = require('../config/config');

let client = null;

const createRedisClient = async () => {
  try {
    client = redis.createClient({
      url: redisUrl,
      retry_strategy: (options) => {
        if (options.error && options.error.code === 'ECONNREFUSED') {
          console.error('Redis server connection refused');
          return new Error('Redis server connection refused');
        }
        if (options.total_retry_time > 1000 * 60 * 60) {
          console.error('Redis retry time exhausted');
          return new Error('Retry time exhausted');
        }
        if (options.attempt > 10) {
          console.error('Redis connection attempts exceeded');
          return undefined;
        }
        return Math.min(options.attempt * 100, 3000);
      }
    });

    client.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });

    client.on('connect', () => {
      console.log('Redis Client Connected');
    });

    client.on('ready', () => {
      console.log('Redis Client Ready');
    });

    client.on('end', () => {
      console.log('Redis Client Disconnected');
    });

    await client.connect();
    return client;
  } catch (error) {
    console.error('Failed to create Redis client:', error);
    if (nodeEnv === 'production') {
      throw error;
    }
    return null; // In development, continue without Redis
  }
};

const getRedisClient = () => {
  return client;
};

// Cache utilities
const setCache = async (key, value, expireInSeconds = 3600) => {
  if (!client) return false;
  try {
    await client.setEx(key, expireInSeconds, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error('Redis set error:', error);
    return false;
  }
};

const getCache = async (key) => {
  if (!client) return null;
  try {
    const value = await client.get(key);
    return value ? JSON.parse(value) : null;
  } catch (error) {
    console.error('Redis get error:', error);
    return null;
  }
};

const deleteCache = async (key) => {
  if (!client) return false;
  try {
    await client.del(key);
    return true;
  } catch (error) {
    console.error('Redis delete error:', error);
    return false;
  }
};

const deleteCachePattern = async (pattern) => {
  if (!client) return false;
  try {
    const keys = await client.keys(pattern);
    if (keys.length > 0) {
      await client.del(keys);
    }
    return true;
  } catch (error) {
    console.error('Redis delete pattern error:', error);
    return false;
  }
};

// Pub/Sub utilities for chat scaling
const publishMessage = async (channel, message) => {
  if (!client) return false;
  try {
    await client.publish(channel, JSON.stringify(message));
    return true;
  } catch (error) {
    console.error('Redis publish error:', error);
    return false;
  }
};

const subscribeToChannel = async (channel, callback) => {
  if (!client) return false;
  try {
    const subscriber = client.duplicate();
    await subscriber.connect();
    await subscriber.subscribe(channel, (message) => {
      try {
        const parsedMessage = JSON.parse(message);
        callback(parsedMessage);
      } catch (error) {
        console.error('Error parsing subscribed message:', error);
      }
    });
    return subscriber;
  } catch (error) {
    console.error('Redis subscribe error:', error);
    return false;
  }
};

module.exports = {
  createRedisClient,
  getRedisClient,
  setCache,
  getCache,
  deleteCache,
  deleteCachePattern,
  publishMessage,
  subscribeToChannel
};
