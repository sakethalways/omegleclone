/**
 * Redis Client for Multi-Server Support
 * Handles all data persistence across multiple server instances
 * Falls back to in-memory storage if Redis is unavailable
 */

import type {
  ChatUser,
  ChatRoom,
  UserSession,
  ChatMessage,
} from "./chat-types";

interface RedisConfig {
  url?: string;
  host?: string;
  port?: number;
  password?: string;
}

let redisClient: any = null;
let redisConnected = false;

// Fallback in-memory storage (for single-server deployment or Redis unavailable)
const fallbackStorage = {
  users: new Map<string, ChatUser>(),
  rooms: new Map<string, ChatRoom>(),
  sessions: new Map<string, UserSession>(),
  queue: [] as ChatUser[],
  userEvents: new Map<string, Array<{ type: string; payload: unknown }>>(),
  userHeartbeat: new Map<string, number>(),
};

/**
 * Initialize Redis connection
 * Can be called multiple times safely
 */
export async function initializeRedis(config?: RedisConfig) {
  // Check if Redis URL is available
  const redisUrl = config?.url || process.env.REDIS_URL;

  if (!redisUrl) {
    console.log("[Redis] No REDIS_URL found - using in-memory storage (single server)");
    redisConnected = false;
    return;
  }

  try {
    // Dynamic import to avoid requiring Redis in local dev
    const { createClient } = await import("redis");

    redisClient = createClient({
      url: redisUrl,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            console.log("[Redis] Max reconnection attempts reached");
            return new Error("Redis max retries reached");
          }
          return retries * 50;
        },
        connectTimeout: 10000,
      },
    });

    redisClient.on("error", (err: Error) => {
      console.error("[Redis] Client error:", err.message);
      redisConnected = false;
    });

    redisClient.on("connect", () => {
      console.log("[Redis] Connected successfully");
      redisConnected = true;
    });

    redisClient.on("ready", () => {
      console.log("[Redis] Connection ready");
      redisConnected = true;
    });

    await redisClient.connect();
    redisConnected = true;
    console.log("[Redis] Initialized and connected");
  } catch (error) {
    console.warn(
      "[Redis] Connection failed:",
      error instanceof Error ? error.message : "Unknown error"
    );
    console.log("[Redis] Falling back to in-memory storage");
    redisConnected = false;
  }
}

/**
 * Check if Redis is connected
 */
export function isRedisConnected(): boolean {
  return redisConnected && redisClient !== null;
}

/**
 * Safe Redis/Fallback operations with automatic failover
 */

export const RedisService = {
  // === USER OPERATIONS ===
  async setUser(userId: string, user: ChatUser): Promise<void> {
    if (isRedisConnected()) {
      try {
        await redisClient.json.set(`user:${userId}`, "$", user);
        // Expire after 24 hours (user session expires)
        await redisClient.expire(`user:${userId}`, 86400);
      } catch (error) {
        console.error("[Redis] setUser failed:", error);
        fallbackStorage.users.set(userId, user);
      }
    } else {
      fallbackStorage.users.set(userId, user);
    }
  },

  async getUser(userId: string): Promise<ChatUser | null> {
    if (isRedisConnected()) {
      try {
        const user = await redisClient.json.get(`user:${userId}`);
        return user || null;
      } catch (error) {
        console.error("[Redis] getUser failed:", error);
        return fallbackStorage.users.get(userId) || null;
      }
    }
    return fallbackStorage.users.get(userId) || null;
  },

  async deleteUser(userId: string): Promise<void> {
    if (isRedisConnected()) {
      try {
        await redisClient.del(`user:${userId}`);
      } catch (error) {
        console.error("[Redis] deleteUser failed:", error);
        fallbackStorage.users.delete(userId);
      }
    } else {
      fallbackStorage.users.delete(userId);
    }
  },

  // === ROOM OPERATIONS ===
  async setRoom(roomId: string, room: ChatRoom): Promise<void> {
    if (isRedisConnected()) {
      try {
        await redisClient.json.set(`room:${roomId}`, "$", room);
        // Expire after 12 hours (conversation session)
        await redisClient.expire(`room:${roomId}`, 43200);
      } catch (error) {
        console.error("[Redis] setRoom failed:", error);
        fallbackStorage.rooms.set(roomId, room);
      }
    } else {
      fallbackStorage.rooms.set(roomId, room);
    }
  },

  async getRoom(roomId: string): Promise<ChatRoom | null> {
    if (isRedisConnected()) {
      try {
        const room = await redisClient.json.get(`room:${roomId}`);
        return room || null;
      } catch (error) {
        console.error("[Redis] getRoom failed:", error);
        return fallbackStorage.rooms.get(roomId) || null;
      }
    }
    return fallbackStorage.rooms.get(roomId) || null;
  },

  async deleteRoom(roomId: string): Promise<void> {
    if (isRedisConnected()) {
      try {
        await redisClient.del(`room:${roomId}`);
      } catch (error) {
        console.error("[Redis] deleteRoom failed:", error);
        fallbackStorage.rooms.delete(roomId);
      }
    } else {
      fallbackStorage.rooms.delete(roomId);
    }
  },

  // === SESSION OPERATIONS ===
  async setSession(userId: string, session: UserSession): Promise<void> {
    if (isRedisConnected()) {
      try {
        await redisClient.json.set(`session:${userId}`, "$", session);
        // Expire after 24 hours
        await redisClient.expire(`session:${userId}`, 86400);
      } catch (error) {
        console.error("[Redis] setSession failed:", error);
        fallbackStorage.sessions.set(userId, session);
      }
    } else {
      fallbackStorage.sessions.set(userId, session);
    }
  },

  async getSession(userId: string): Promise<UserSession | null> {
    if (isRedisConnected()) {
      try {
        const session = await redisClient.json.get(`session:${userId}`);
        return session || null;
      } catch (error) {
        console.error("[Redis] getSession failed:", error);
        return fallbackStorage.sessions.get(userId) || null;
      }
    }
    return fallbackStorage.sessions.get(userId) || null;
  },

  async deleteSession(userId: string): Promise<void> {
    if (isRedisConnected()) {
      try {
        await redisClient.del(`session:${userId}`);
      } catch (error) {
        console.error("[Redis] deleteSession failed:", error);
        fallbackStorage.sessions.delete(userId);
      }
    } else {
      fallbackStorage.sessions.delete(userId);
    }
  },

  // === QUEUE OPERATIONS ===
  async pushToQueue(user: ChatUser): Promise<void> {
    if (isRedisConnected()) {
      try {
        // Use LPUSH to add user to queue list (right side for FIFO)
        await redisClient.lPush(
          `queue:list`,
          JSON.stringify(user)
        );
      } catch (error) {
        console.error("[Redis] pushToQueue failed:", error);
        fallbackStorage.queue.push(user);
      }
    } else {
      fallbackStorage.queue.push(user);
    }
  },

  async popFromQueue(): Promise<ChatUser | null> {
    if (isRedisConnected()) {
      try {
        // Use RPOP to get from left side (FIFO)
        const userJson = await redisClient.rPop(`queue:list`);
        return userJson ? JSON.parse(userJson) : null;
      } catch (error) {
        console.error("[Redis] popFromQueue failed:", error);
        return fallbackStorage.queue.shift() || null;
      }
    }
    return fallbackStorage.queue.shift() || null;
  },

  async getQueue(): Promise<ChatUser[]> {
    if (isRedisConnected()) {
      try {
        const users = await redisClient.lRange(`queue:list`, 0, -1);
        return users.map((u: string) => JSON.parse(u));
      } catch (error) {
        console.error("[Redis] getQueue failed:", error);
        return [...fallbackStorage.queue];
      }
    }
    return [...fallbackStorage.queue];
  },

  async getQueueLength(): Promise<number> {
    if (isRedisConnected()) {
      try {
        return await redisClient.lLen(`queue:list`);
      } catch (error) {
        console.error("[Redis] getQueueLength failed:", error);
        return fallbackStorage.queue.length;
      }
    }
    return fallbackStorage.queue.length;
  },

  async removeFromQueue(userId: string): Promise<void> {
    if (isRedisConnected()) {
      try {
        // Get all users, filter, and rebuild queue
        const users = await redisClient.lRange(`queue:list`, 0, -1);
        const filtered = users
          .map((u: string) => JSON.parse(u))
          .filter((u: ChatUser) => u.id !== userId);

        // Clear and rebuild
        await redisClient.del(`queue:list`);
        for (const user of filtered) {
          await redisClient.lPush(`queue:list`, JSON.stringify(user));
        }
      } catch (error) {
        console.error("[Redis] removeFromQueue failed:", error);
        const idx = fallbackStorage.queue.findIndex((u) => u.id === userId);
        if (idx > -1) fallbackStorage.queue.splice(idx, 1);
      }
    } else {
      const idx = fallbackStorage.queue.findIndex((u) => u.id === userId);
      if (idx > -1) fallbackStorage.queue.splice(idx, 1);
    }
  },

  async clearQueue(): Promise<void> {
    if (isRedisConnected()) {
      try {
        await redisClient.del(`queue:list`);
      } catch (error) {
        console.error("[Redis] clearQueue failed:", error);
        fallbackStorage.queue = [];
      }
    } else {
      fallbackStorage.queue = [];
    }
  },

  // === EVENT QUEUE OPERATIONS ===
  async pushEvent(
    userId: string,
    event: { type: string; payload: unknown }
  ): Promise<void> {
    if (isRedisConnected()) {
      try {
        // Use rPush to add to tail for proper FIFO order
        await redisClient.rPush(
          `events:${userId}`,
          JSON.stringify(event)
        );
        // Expire events after 60 seconds (increased from 30s to ensure delivery)
        await redisClient.expire(`events:${userId}`, 60);
      } catch (error) {
        console.error("[Redis] pushEvent failed:", error);
        if (!fallbackStorage.userEvents.has(userId)) {
          fallbackStorage.userEvents.set(userId, []);
        }
        fallbackStorage.userEvents.get(userId)!.push(event);
      }
    } else {
      if (!fallbackStorage.userEvents.has(userId)) {
        fallbackStorage.userEvents.set(userId, []);
      }
      fallbackStorage.userEvents.get(userId)!.push(event);
    }
  },

  async getEvents(userId: string): Promise<Array<{ type: string; payload: unknown }>> {
    if (isRedisConnected()) {
      try {
        // Pop events atomically (one by one) - prevents duplicate delivery on concurrent polls
        const events = [];
        let event;
        while ((event = await redisClient.lPop(`events:${userId}`)) !== null) {
          events.push(JSON.parse(event));
        }
        return events;
      } catch (error) {
        console.error("[Redis] getEvents failed:", error);
        const events = fallbackStorage.userEvents.get(userId) || [];
        fallbackStorage.userEvents.delete(userId);
        return events;
      }
    }
    const events = fallbackStorage.userEvents.get(userId) || [];
    fallbackStorage.userEvents.delete(userId);
    return events;
  },

  // === HEARTBEAT / PRESENCE ===
  async setHeartbeat(userId: string, timestamp: number): Promise<void> {
    if (isRedisConnected()) {
      try {
        await redisClient.set(`heartbeat:${userId}`, timestamp.toString());
        // Expire after 2 minutes (heartbeat every 30s, so 4 missed = disconnect)
        await redisClient.expire(`heartbeat:${userId}`, 120);
      } catch (error) {
        console.error("[Redis] setHeartbeat failed:", error);
        fallbackStorage.userHeartbeat.set(userId, timestamp);
      }
    } else {
      fallbackStorage.userHeartbeat.set(userId, timestamp);
    }
  },

  async getHeartbeat(userId: string): Promise<number | null> {
    if (isRedisConnected()) {
      try {
        const timestamp = await redisClient.get(`heartbeat:${userId}`);
        return timestamp ? parseInt(timestamp) : null;
      } catch (error) {
        console.error("[Redis] getHeartbeat failed:", error);
        return fallbackStorage.userHeartbeat.get(userId) || null;
      }
    }
    return fallbackStorage.userHeartbeat.get(userId) || null;
  },

  async deleteHeartbeat(userId: string): Promise<void> {
    if (isRedisConnected()) {
      try {
        await redisClient.del(`heartbeat:${userId}`);
      } catch (error) {
        console.error("[Redis] deleteHeartbeat failed:", error);
        fallbackStorage.userHeartbeat.delete(userId);
      }
    } else {
      fallbackStorage.userHeartbeat.delete(userId);
    }
  },

  // === UTILITY ===
  async clear(): Promise<void> {
    if (isRedisConnected()) {
      try {
        // Clear all keys (be careful in production!)
        const keys = await redisClient.keys("*");
        if (keys.length > 0) {
          await redisClient.del(keys);
        }
      } catch (error) {
        console.error("[Redis] clear failed:", error);
      }
    }
    fallbackStorage.users.clear();
    fallbackStorage.rooms.clear();
    fallbackStorage.sessions.clear();
    fallbackStorage.queue = [];
    fallbackStorage.userEvents.clear();
    fallbackStorage.userHeartbeat.clear();
  },

  async getStatus() {
    return {
      redisConnected: isRedisConnected(),
      fallbackMode: !isRedisConnected(),
      queueLength: await RedisService.getQueueLength(),
    };
  },
};

export default RedisService;
