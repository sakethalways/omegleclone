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

  // === SESSION CLEANUP (Prevent TTL-based memory leaks) ===
  async cleanupExpiredSessions(): Promise<number> {
    // Called periodically to clean up sessions that should have expired
    // This prevents sessions from hanging around for 24 hours if cleanup logic fails
    if (isRedisConnected()) {
      try {
        // Get all session keys and check if corresponding users exist
        const keys = await redisClient.keys("session:*");
        let cleaned = 0;
        
        for (const key of keys) {
          const userId = key.replace("session:", "");
          const user = await redisClient.json.get(`user:${userId}`);
          
          // If user doesn't exist but session does, delete the stale session
          if (!user) {
            await redisClient.del(key);
            cleaned++;
            console.log(`[Redis] Cleaned up stale session for user ${userId}`);
          }
        }
        
        return cleaned;
      } catch (error) {
        console.error("[Redis] cleanupExpiredSessions failed:", error);
        return 0;
      }
    } else {
      // In fallback mode, clean up sessions without corresponding users
      let cleaned = 0;
      const sessionIds = Array.from(fallbackStorage.sessions.keys());
      
      for (const sessionId of sessionIds) {
        if (!fallbackStorage.users.has(sessionId)) {
          fallbackStorage.sessions.delete(sessionId);
          cleaned++;
        }
      }
      
      return cleaned;
    }
  },

  // === QUEUE OPERATIONS ===
  async pushToQueue(user: ChatUser): Promise<void> {
    if (isRedisConnected()) {
      try {
        // Use Lua script for atomic duplicate check and push
        const script = `
          local queue_key = KEYS[1]
          local user_json = ARGV[1]
          local user_id = ARGV[2]
          local users = redis.call('lrange', queue_key, 0, -1)
          
          for _, u_json in ipairs(users) do
            local u = cjson.decode(u_json)
            if u.id == user_id then
              return 0
            end
          end
          
          redis.call('rpush', queue_key, user_json)
          return 1
        `;
        
        const result = await redisClient.eval(script, {
          keys: ['queue:list'],
          arguments: [JSON.stringify(user), user.id],
        });
        
        if (result === 1) {
          console.log(`[Redis] User ${user.id} added to queue`);
        } else {
          console.log(`[Redis] User ${user.id} already in queue, skipping duplicate push`);
        }
      } catch (error) {
        console.error("[Redis] pushToQueue failed:", error);
        // Check fallback storage too
        const isDuplicate = fallbackStorage.queue.some((u) => u.id === user.id);
        if (!isDuplicate) {
          fallbackStorage.queue.push(user);
        }
      }
    } else {
      const isDuplicate = fallbackStorage.queue.some((u) => u.id === user.id);
      if (!isDuplicate) {
        fallbackStorage.queue.push(user);
      }
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

  async isUserInQueue(userId: string): Promise<boolean> {
    if (isRedisConnected()) {
      try {
        const users = await redisClient.lRange(`queue:list`, 0, -1);
        return users.some((u: string) => {
          const parsed = JSON.parse(u);
          return parsed.id === userId;
        });
      } catch (error) {
        console.error("[Redis] isUserInQueue failed:", error);
        return fallbackStorage.queue.some((u) => u.id === userId);
      }
    }
    return fallbackStorage.queue.some((u) => u.id === userId);
  },

  // === PENDING OPERATIONS ===
  async addPendingRequeue(userId: string, delayMs: number): Promise<void> {
    if (isRedisConnected()) {
      try {
        const requeueTime = Date.now() + delayMs;
        await redisClient.zAdd(`pending:requeue`, {
          score: requeueTime,
          member: userId,
        });
      } catch (error) {
        console.error("[Redis] addPendingRequeue failed:", error);
      }
    }
  },

  async getPendingRequeues(): Promise<string[]> {
    if (isRedisConnected()) {
      try {
        const now = Date.now();
        const userIds = await redisClient.zRangeByScore(`pending:requeue`, 0, now);
        // Remove them from pending
        if (userIds.length > 0) {
          await redisClient.zRemRangeByScore(`pending:requeue`, 0, now);
        }
        return userIds;
      } catch (error) {
        console.error("[Redis] getPendingRequeues failed:", error);
        return [];
      }
    }
    return [];
  },

  async getPendingRequeueCount(): Promise<number> {
    if (isRedisConnected()) {
      try {
        // Get count of ALL pending requeues (including future ones)
        const count = await redisClient.zCard(`pending:requeue`);
        return count;
      } catch (error) {
        console.error("[Redis] getPendingRequeueCount failed:", error);
        return 0;
      }
    }
    return 0;
  },

  // === MATCH HISTORY (Prevent Recent Re-matches) ===
  async recordMatch(userId1: string, userId2: string): Promise<void> {
    if (isRedisConnected()) {
      try {
        // Record that these two users matched
        // Use a sorted set with expiry to prevent re-matching for 1 hour
        
        // Store bidirectional relationship
        const matchKey = `match:${String(Math.min(parseInt(userId1), parseInt(userId2)))}:${String(Math.max(parseInt(userId1), parseInt(userId2)))}`;
        await redisClient.setEx(matchKey, 3600, "1"); // 1 hour expiry
      } catch (error) {
        console.error("[Redis] recordMatch failed:", error);
      }
    }
  },

  async haveRecentlyMatched(userId1: string, userId2: string): Promise<boolean> {
    if (isRedisConnected()) {
      try {
        const matchKey = `match:${String(Math.min(parseInt(userId1), parseInt(userId2)))}:${String(Math.max(parseInt(userId1), parseInt(userId2)))}`;
        const exists = await redisClient.exists(matchKey);
        return exists === 1;
      } catch (error) {
        console.error("[Redis] haveRecentlyMatched failed:", error);
        return false;
      }
    }
    return false;
  },

  async removeFromQueue(userId: string): Promise<void> {
    if (isRedisConnected()) {
      try {
        // Use Lua script for atomic operation - prevents race condition
        const script = `
          local queue_key = KEYS[1]
          local user_id = ARGV[1]
          local users = redis.call('lrange', queue_key, 0, -1)
          local filtered = {}
          for _, user_json in ipairs(users) do
            local user = cjson.decode(user_json)
            if user.id ~= user_id then
              table.insert(filtered, user_json)
            end
          end
          redis.call('del', queue_key)
          if #filtered > 0 then
            redis.call('rpush', queue_key, unpack(filtered))
          end
          return #filtered
        `;
        
        await redisClient.eval(script, {
          keys: ['queue:list'],
          arguments: [userId],
        });
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
    const MAX_EVENTS_PER_USER = 100; // Limit queue size to prevent memory exhaustion
    
    if (isRedisConnected()) {
      try {
        // Check current queue size
        const queueSize = await redisClient.lLen(`events:${userId}`);
        
        if (queueSize >= MAX_EVENTS_PER_USER) {
          console.warn(`[Redis] Event queue full for user ${userId}, dropping oldest event`);
          // Remove oldest event (from left side) to make room
          await redisClient.lPop(`events:${userId}`);
        }
        
        // Use rPush to add to tail for proper FIFO order
        await redisClient.rPush(
          `events:${userId}`,
          JSON.stringify(event)
        );
        // Expire events after 5 minutes (increased from 60s to handle slower polling and network delays)
        // Frontend polls every 500ms, but users might be idle, network might be slow, etc.
        await redisClient.expire(`events:${userId}`, 300);
      } catch (error) {
        console.error("[Redis] pushEvent failed:", error);
        if (!fallbackStorage.userEvents.has(userId)) {
          fallbackStorage.userEvents.set(userId, []);
        }
        const events = fallbackStorage.userEvents.get(userId)!;
        if (events.length >= MAX_EVENTS_PER_USER) {
          events.shift(); // Remove oldest
        }
        events.push(event);
      }
    } else {
      if (!fallbackStorage.userEvents.has(userId)) {
        fallbackStorage.userEvents.set(userId, []);
      }
      const events = fallbackStorage.userEvents.get(userId)!;
      if (events.length >= MAX_EVENTS_PER_USER) {
        events.shift(); // Remove oldest
      }
      events.push(event);
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
        // Expire after 60 seconds (standardized timeout)
        await redisClient.expire(`heartbeat:${userId}`, 60);
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
