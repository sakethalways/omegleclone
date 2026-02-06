import { NextRequest } from "next/server";
import type {
  ChatUser,
  ChatRoom,
  ChatMessage,
  MatchFoundPayload,
  UserSession,
} from "@/lib/chat-types";
import {
  generateUserId,
  generateRoomId,
  generateMessageId,
  generateUserColor,
  INTEREST_TAGS,
} from "@/lib/chat-types";
import { matchingEngine } from "@/lib/matching-algorithm";
import { RedisService, initializeRedis } from "@/lib/redis-client";

const QUEUE_CHECK_INTERVAL = 500; // Reduced from 2000ms to match frontend polling

// Initialize Redis on first import
let redisInitialized = false;

async function ensureRedisInitialized() {
  if (!redisInitialized) {
    await initializeRedis();
    redisInitialized = true;
    console.log("[Backend] Redis initialized");
  }
}

// Start periodic matching (will be async)
let matchingIntervalStarted = false;

function startMatchingInterval() {
  if (matchingIntervalStarted) return;
  
  if (typeof global !== "undefined") {
    (global as any).matchingInterval = setInterval(() => {
      const matchPromise = performMatching();
      if (matchPromise && typeof matchPromise.catch === "function") {
        matchPromise.catch((err) => {
          console.error("[Backend] Matching error:", err);
        });
      }
    }, QUEUE_CHECK_INTERVAL);
    
    matchingIntervalStarted = true;
    console.log("[Backend] Matching interval started");
  }
}

async function updateQueuePositions() {
  try {
    const queue = await RedisService.getQueue();
    
    for (let index = 0; index < queue.length; index++) {
      const user = queue[index];
      const event = {
        type: "queue_update",
        payload: {
          position: index + 1,
          totalWaiting: queue.length,
        },
      };
      await RedisService.pushEvent(user.id, event);

      // Also update the session with queue position
      const session = await RedisService.getSession(user.id);
      if (session) {
        session.queuePosition = queue.length;
        await RedisService.setSession(user.id, session);
      }
    }
  } catch (error) {
    console.error("[Backend] updateQueuePositions error:", error);
  }
}

// ============================================
// ROBUST CONNECTION & SESSION MANAGEMENT
// ============================================

/**
 * Check if user connection is healthy (heartbeat within 30 seconds)
 */
async function validateUserConnection(userId: string): Promise<boolean> {
  try {
    const user = await RedisService.getUser(userId);
    if (!user) {
      console.log(`[Backend] validateUserConnection: User not found: ${userId}`);
      return false;
    }

    const timeSinceHeartbeat = Date.now() - user.lastHeartbeat;
    const isHealthy = timeSinceHeartbeat <= 60000; // 60 second timeout (increased from 30s)

    if (!isHealthy) {
      console.log(
        `[Backend] validateUserConnection: User offline (${timeSinceHeartbeat}ms): ${userId}`
      );
    }

    return isHealthy;
  } catch (error) {
    console.error(`[Backend] validateUserConnection error: ${error}`);
    return false;
  }
}

/**
 * Detect and clean up offline users
 */
async function cleanupOfflineUsers() {
  try {
    const queue = await RedisService.getQueue();

    for (const user of queue) {
      const timeSinceHeartbeat = Date.now() - user.lastHeartbeat;

      if (timeSinceHeartbeat > 30000) {
        console.log(`[Backend] Removing offline user from queue: ${user.name}`);
        await RedisService.removeFromQueue(user.id);
      }
    }
  } catch (error) {
    console.error(`[Backend] cleanupOfflineUsers error:`, error);
  }
}

/**
 * Validate user is still in matched room with expected partner
 */
async function validateRoomMembership(
  userId: string,
  roomId: string
): Promise<{ valid: boolean; room?: ChatRoom; otherUserId?: string }> {
  try {
    const room = await RedisService.getRoom(roomId);

    if (!room) {
      console.log(`[Backend] validateRoomMembership: Room not found: ${roomId}`);
      return { valid: false };
    }

    const isUser1 = room.user1Id === userId;
    const isUser2 = room.user2Id === userId;

    if (!isUser1 && !isUser2) {
      console.error(
        `[Backend] validateRoomMembership: User ${userId} not in room ${roomId}`
      );
      return { valid: false };
    }

    const otherUserId = isUser1 ? room.user2Id : room.user1Id;
    return { valid: true, room, otherUserId };
  } catch (error) {
    console.error(`[Backend] validateRoomMembership error:`, error);
    return { valid: false };
  }
}

/**
 * Recover from stale room reference
 */
async function handleStaleRoom(
  userId: string,
  roomId: string
): Promise<{ recovered: boolean; message: string }> {
  try {
    const session = await RedisService.getSession(userId);

    if (!session) {
      return { recovered: false, message: "Session expired" };
    }

    if (session.roomId !== roomId) {
      // Session has different room - might be newly matched
      return {
        recovered: false,
        message: "Chat room changed - you have a new match!",
      };
    }

    // Room legitimately doesn't exist
    const user = await RedisService.getUser(userId);
    if (user) {
      // Put user back in queue
      user.status = "waiting";
      await RedisService.setUser(userId, user);
      await RedisService.pushToQueue(user);
      return {
        recovered: true,
        message: "Chat ended, returning to queue for new match",
      };
    }

    return { recovered: false, message: "User session invalidated" };
  } catch (error) {
    console.error(`[Backend] handleStaleRoom error:`, error);
    return { recovered: false, message: "System error" };
  }
}

/**
 * Send message with retry logic for transient failures
 */
async function sendMessageWithRetry(
  userId: string,
  roomId: string,
  content: string,
  maxRetries: number = 2
): Promise<{
  success: boolean;
  messageId?: string;
  error?: string;
}> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(
        `[Backend] sendMessageWithRetry: Attempt ${attempt}/${maxRetries}`
      );

      // 1. Validate connection health
      const isConnected = await validateUserConnection(userId);
      if (!isConnected) {
        await RedisService.deleteUser(userId);
        await RedisService.deleteSession(userId);
        return { success: false, error: "Connection lost" };
      }

      // 2. Get and validate room
      const room = await RedisService.getRoom(roomId);
      if (!room) {
        if (attempt === maxRetries) {
          const recovery = await handleStaleRoom(userId, roomId);
          return {
            success: false,
            error: recovery.message,
          };
        }
        // Retry on transient failure
        await new Promise((r) => setTimeout(r, 100 * attempt));
        continue;
      }

      // 3. Validate user is in room
      const membership = await validateRoomMembership(userId, roomId);
      if (!membership.valid) {
        return { success: false, error: "You are not part of this chat" };
      }

      // 4. Create message
      const message: ChatMessage = {
        id: generateMessageId(),
        senderId: userId,
        senderName: (await RedisService.getUser(userId))?.name || "Unknown",
        content,
        timestamp: Date.now(),
        delivered: false,
      };

      const otherUserId = membership.otherUserId!;

      // 5. Queue event first (highest priority)
      await RedisService.pushEvent(otherUserId, {
        type: "message_received",
        payload: message,
      });
      console.log(`[Backend] sendMessageWithRetry: Event queued for ${otherUserId}`);

      // 6. Update room
      room.messages.push(message);
      room.lastActivity = Date.now();
      await RedisService.setRoom(roomId, room);
      console.log(`[Backend] sendMessageWithRetry: Room updated`);

      return { success: true, messageId: message.id };
    } catch (error) {
      console.error(
        `[Backend] sendMessageWithRetry attempt ${attempt} failed:`,
        error
      );

      if (attempt === maxRetries) {
        return {
          success: false,
          error:
            error instanceof Error ? error.message : "Failed to send message",
        };
      }

      // Exponential backoff
      await new Promise((r) => setTimeout(r, 100 * attempt));
    }
  }

  return { success: false, error: "Max retries exceeded" };
}

// Helper function to perform a direct match between two users
async function performDirectMatch(user1: ChatUser, user2: ChatUser) {
  try {
    const roomId = generateRoomId();
    const commonInterests = matchingEngine.getCommonInterests(user1, user2);

    const room: ChatRoom = {
      id: roomId,
      user1Id: user1.id,
      user2Id: user2.id,
      user1Name: user1.name,
      user2Name: user2.name,
      commonInterests,
      messages: [],
      createdAt: Date.now(),
      lastActivity: Date.now(),
    };

    // Store room in Redis
    await RedisService.setRoom(roomId, room);

    // Update user statuses
    user1.status = "matched";
    user1.lastHeartbeat = Date.now();
    user2.status = "matched";
    user2.lastHeartbeat = Date.now();

    await RedisService.setUser(user1.id, user1);
    await RedisService.setUser(user2.id, user2);

    // Update sessions
    const session1 = await RedisService.getSession(user1.id);
    const session2 = await RedisService.getSession(user2.id);
    
    if (session1) {
      session1.roomId = roomId;
      session1.matchedUserId = user2.id;
      await RedisService.setSession(user1.id, session1);
    }
    if (session2) {
      session2.roomId = roomId;
      session2.matchedUserId = user1.id;
      await RedisService.setSession(user2.id, session2);
    }

    const payload: MatchFoundPayload = {
      matchedUser: {
        id: user2.id,
        name: user2.name,
        interests: user2.interests,
        color: user2.color,
      },
      roomId,
      commonInterests,
    };

    // Queue match events for both users
    await RedisService.pushEvent(user1.id, {
      type: "match_found",
      payload,
    });

    await RedisService.pushEvent(user2.id, {
      type: "match_found",
      payload: {
        matchedUser: {
          id: user1.id,
          name: user1.name,
          interests: user1.interests,
          color: user1.color,
        },
        roomId,
        commonInterests,
      },
    });

    // Remove matched users from queue
    await RedisService.removeFromQueue(user1.id);
    await RedisService.removeFromQueue(user2.id);

    console.log(`[Backend] Matched ${user1.name} with ${user2.name}`);
  } catch (error) {
    console.error("[Backend] performDirectMatch error:", error);
  }
}

async function performMatchingAsync() {
  try {
    // STEP 1: Clean up offline users from queue (those with no heartbeat for 30s)
    await cleanupOfflineUsers();

    const queue = await RedisService.getQueue();
    if (queue.length < 2) return;

    const pairs = matchingEngine.findMatches(queue);

    for (const [user1, user2] of pairs) {
      const roomId = generateRoomId();
      const commonInterests = matchingEngine.getCommonInterests(user1, user2);

      const room: ChatRoom = {
        id: roomId,
        user1Id: user1.id,
        user2Id: user2.id,
        user1Name: user1.name,
        user2Name: user2.name,
        commonInterests,
        messages: [],
        createdAt: Date.now(),
        lastActivity: Date.now(),
      };

      // Store room in Redis
      await RedisService.setRoom(roomId, room);

      // Update user statuses
      user1.status = "matched";
      user1.lastHeartbeat = Date.now();
      user2.status = "matched";
      user2.lastHeartbeat = Date.now();

      await RedisService.setUser(user1.id, user1);
      await RedisService.setUser(user2.id, user2);

      // Update sessions
      const session1 = await RedisService.getSession(user1.id);
      const session2 = await RedisService.getSession(user2.id);
      
      if (session1) {
        session1.roomId = roomId;
        session1.matchedUserId = user2.id;
        await RedisService.setSession(user1.id, session1);
      }
      if (session2) {
        session2.roomId = roomId;
        session2.matchedUserId = user1.id;
        await RedisService.setSession(user2.id, session2);
      }

      const payload: MatchFoundPayload = {
        matchedUser: {
          id: user2.id,
          name: user2.name,
          interests: user2.interests,
          color: user2.color,
        },
        roomId,
        commonInterests,
      };

      // Queue match events for both users
      await RedisService.pushEvent(user1.id, {
        type: "match_found",
        payload,
      });

      await RedisService.pushEvent(user2.id, {
        type: "match_found",
        payload: {
          matchedUser: {
            id: user1.id,
            name: user1.name,
            interests: user1.interests,
            color: user1.color,
          },
          roomId,
          commonInterests,
        },
      });

      // Remove matched users from queue
      await RedisService.removeFromQueue(user1.id);
      await RedisService.removeFromQueue(user2.id);
    }

    // Update queue positions for remaining users
    await updateQueuePositions();
  } catch (error) {
    console.error("[Backend] performMatchingAsync error:", error);
  }
}

// Wrapper to call async function from sync interval
function performMatching() {
  try {
    if (typeof global !== "undefined") {
      const globalAny = global as any;
      if (!globalAny.matchingPromiseInFlight) {
        const promise = performMatchingAsync();
        if (promise && typeof promise.finally === "function") {
          globalAny.matchingPromiseInFlight = promise;
          promise.finally(() => {
            globalAny.matchingPromiseInFlight = null;
          });
          return promise;
        }
      }
    }
  } catch (error) {
    console.error("[Backend] performMatching error:", error);
  }
}

export async function GET(request: NextRequest) {
  await ensureRedisInitialized();
  startMatchingInterval();

  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");

  if (action === "poll") {
    const userId = searchParams.get("userId");
    if (!userId) {
      return Response.json({ error: "Missing userId" }, { status: 400 });
    }

    try {
      const user = await RedisService.getUser(userId);
      if (!user) {
        return Response.json({ error: "User not found" }, { status: 404 });
      }

      // Return pending events
      const events = await RedisService.getEvents(userId);

      // Always return connected status on first poll
      if (events.length === 0) {
        events.push({
          type: "connected",
          payload: { userId, userName: user.name },
        });

        // Add queue position if waiting
        const queue = await RedisService.getQueue();
        const queuePos = queue.findIndex((u) => u.id === userId) + 1;
        if (queuePos > 0 && user.status === "waiting") {
          events.push({
            type: "queue_update",
            payload: {
              position: queuePos,
              totalWaiting: queue.length,
            },
          });
        }
      }

      if (events.length > 0) {
        console.log(
          `[Backend] Poll from ${user.name}: Returning ${events.length} events:`,
          events.map((e) => e.type)
        );
      }

      return Response.json({ events });
    } catch (error) {
      console.error("[Backend] Poll error:", error);
      return Response.json({ error: "Internal error" }, { status: 500 });
    }
  }

  if (action === "interests") {
    return Response.json({ interests: INTEREST_TAGS });
  }

  if (action === "status") {
    const status = await RedisService.getStatus();
    return Response.json(status);
  }

  return Response.json({ error: "Invalid action" }, { status: 400 });
}

export async function POST(request: NextRequest) {
  await ensureRedisInitialized();
  startMatchingInterval();

  const body = await request.json();
  const { action, userId, roomId, userName, interests, content } = body;

  try {
    switch (action) {
      case "join_queue": {
        const newUserId = userId || generateUserId();
        const sessionToken = generateUserId();
        const userColor = generateUserColor();

        const user: ChatUser = {
          id: newUserId,
          name: userName || `User${Math.floor(Math.random() * 10000)}`,
          interests: interests || [],
          status: "waiting",
          connectedAt: Date.now(),
          lastHeartbeat: Date.now(),
          blockedUsers: [],
          color: userColor,
        };

        // Store user and session in Redis
        await RedisService.setUser(newUserId, user);
        
        await RedisService.pushToQueue(user);
        await RedisService.pushEvent(newUserId, {
          type: "connected",
          payload: { userId: newUserId, userName: user.name },
        });

        const queue = await RedisService.getQueue();
        const queueLength = queue.length;

        const session: UserSession = {
          userId: newUserId,
          userName: user.name,
          interests: user.interests,
          sessionToken,
          roomId: null,
          queuePosition: queueLength,
          matchedUserId: null,
          blockedUsers: [],
        };

        await RedisService.setSession(newUserId, session);

        // Update queue positions
        await updateQueuePositions();

        // IMMEDIATE MATCHING: Try to match this user with existing queue users
        if (queue.length >= 2) {
          const currentQueue = await RedisService.getQueue();
          const pairs = matchingEngine.findMatches(currentQueue);
          
          if (pairs.length > 0) {
            console.log(`[Backend] Immediate match found for new user! Pairs: ${pairs.length}`);
            for (const [user1, user2] of pairs) {
              await performDirectMatch(user1, user2);
            }
            // Update queue positions again after matching
            await updateQueuePositions();
          }
        }

        return Response.json({
          success: true,
          userId: newUserId,
          sessionToken,
          queuePosition: queueLength,
          totalWaiting: queueLength,
        });
      }

      case "send_message": {
        if (!userId || !roomId || !content) {
          return Response.json(
            { error: "Missing required fields" },
            { status: 400 }
          );
        }

        // Use robust retry logic
        const result = await sendMessageWithRetry(userId, roomId, content);

        if (!result.success) {
          // Determine appropriate HTTP status
          const status =
            result.error === "Room not found" ? 404 : 400;
          return Response.json({ error: result.error }, { status });
        }

        return Response.json({ success: true, messageId: result.messageId });
      }

      case "skip_user": {
        // User wants to skip current partner and find someone else
        if (!userId || !roomId) {
          return Response.json(
            { error: "Missing userId or roomId" },
            { status: 400 }
          );
        }

        const room = await RedisService.getRoom(roomId);
        if (!room) {
          return Response.json({ error: "Room not found" }, { status: 404 });
        }

        const user = await RedisService.getUser(userId);
        if (!user) {
          return Response.json({ error: "User not found" }, { status: 404 });
        }

        const otherUserId = room.user1Id === userId ? room.user2Id : room.user1Id;

        console.log(`[Backend] User ${user.name} skipped partner`);

        // Send user_skipped event to other user
        await RedisService.pushEvent(otherUserId, {
          type: "user_skipped",
          payload: { reason: "Your chat partner left to find someone else" },
        });

        // Put both users back in queue IMMEDIATELY
        user.status = "waiting";
        await RedisService.setUser(userId, user);
        await RedisService.pushToQueue(user);

        const otherUser = await RedisService.getUser(otherUserId);
        if (otherUser) {
          otherUser.status = "waiting";
          await RedisService.setUser(otherUserId, otherUser);
          await RedisService.pushToQueue(otherUser);
        }

        // Clear sessions
        const session = await RedisService.getSession(userId);
        if (session) {
          session.roomId = null;
          session.matchedUserId = null;
          await RedisService.setSession(userId, session);
        }

        const otherSession = await RedisService.getSession(otherUserId);
        if (otherSession) {
          otherSession.roomId = null;
          otherSession.matchedUserId = null;
          await RedisService.setSession(otherUserId, otherSession);
        }

        // Delete room
        await RedisService.deleteRoom(roomId);
        await updateQueuePositions();

        return Response.json({ success: true });
      }

      case "block_user": {
        // User wants to block current partner
        if (!userId || !roomId) {
          return Response.json(
            { error: "Missing userId or roomId" },
            { status: 400 }
          );
        }

        const room = await RedisService.getRoom(roomId);
        if (!room) {
          return Response.json({ error: "Room not found" }, { status: 404 });
        }

        const user = await RedisService.getUser(userId);
        if (!user) {
          return Response.json({ error: "User not found" }, { status: 404 });
        }

        const otherUserId = room.user1Id === userId ? room.user2Id : room.user1Id;

        console.log(`[Backend] User ${user.name} blocked ${otherUserId}`);

        // Add to blocker's blocklist
        user.blockedUsers = user.blockedUsers || [];
        if (!user.blockedUsers.includes(otherUserId)) {
          user.blockedUsers.push(otherUserId);
          await RedisService.setUser(userId, user);
        }

        // Notify blocked user
        await RedisService.pushEvent(otherUserId, {
          type: "user_blocked",
          payload: { reason: "You've been blocked by this user" },
        });

        // Put blocker back in queue
        user.status = "waiting";
        await RedisService.pushToQueue(user);

        // Put blocked user back in queue
        const blockedUser = await RedisService.getUser(otherUserId);
        if (blockedUser) {
          blockedUser.status = "waiting";
          await RedisService.setUser(otherUserId, blockedUser);
          await RedisService.pushToQueue(blockedUser);
        }

        // Clear sessions
        const session = await RedisService.getSession(userId);
        if (session) {
          session.roomId = null;
          session.matchedUserId = null;
          await RedisService.setSession(userId, session);
        }

        const otherSession = await RedisService.getSession(otherUserId);
        if (otherSession) {
          otherSession.roomId = null;
          otherSession.matchedUserId = null;
          await RedisService.setSession(otherUserId, otherSession);
        }

        // Delete room
        await RedisService.deleteRoom(roomId);
        await updateQueuePositions();

        return Response.json({ success: true });
      }

      case "typing": {
        if (!userId || !roomId) {
          return Response.json(
            { error: "Missing required fields" },
            { status: 400 }
          );
        }

        try {
          // Validate connection before sending
          const isConnected = await validateUserConnection(userId);
          if (!isConnected) {
            return Response.json(
              { error: "Connection lost" },
              { status: 401 }
            );
          }

          // Validate room membership
          const membership = await validateRoomMembership(userId, roomId);
          if (!membership.valid) {
            return Response.json(
              { error: "Invalid room or membership" },
              { status: 404 }
            );
          }

          const otherUserId = membership.otherUserId!;

          await RedisService.pushEvent(otherUserId, {
            type: "typing_update",
            payload: {
              isTyping: body.isTyping ?? true,
            },
          });

          return Response.json({ success: true });
        } catch (error) {
          console.error("[Backend] Typing error:", error);
          return Response.json({ error: "Failed to send typing status" }, { status: 500 });
        }
      }

      case "disconnect": {
        if (!userId) {
          return Response.json({ error: "Missing userId" }, { status: 400 });
        }

        console.log(`[Backend] Disconnect user: ${userId}`);

        const user = await RedisService.getUser(userId);
        if (user) {
          const session = await RedisService.getSession(userId);
          
          // CHECK IF USER IS IN A MATCHED CHAT
          if (session && session.roomId) {
            const room = await RedisService.getRoom(session.roomId);
            if (room) {
              const otherUserId = room.user1Id === userId ? room.user2Id : room.user1Id;
              console.log(`[Backend] Disconnecting matched user. Notifying partner: ${otherUserId}`);
              
              // NOTIFY PARTNER: THEY HAVE BEEN LEFT
              await RedisService.pushEvent(otherUserId, {
                type: "user_left",
                payload: { 
                  reason: "Your chat partner disconnected",
                  userLeftId: userId
                },
              });
              
              // AUTO-RECONNECT PARTNER: Put them back in queue immediately
              const partnerUser = await RedisService.getUser(otherUserId);
              if (partnerUser) {
                partnerUser.status = "waiting";
                await RedisService.setUser(otherUserId, partnerUser);
                await RedisService.pushToQueue(partnerUser);
                console.log(`[Backend] Auto-reconnecting partner ${partnerUser.name} to queue`);
              }
              
              // Update partner session
              const partnerSession = await RedisService.getSession(otherUserId);
              if (partnerSession) {
                partnerSession.roomId = null;
                partnerSession.matchedUserId = null;
                await RedisService.setSession(otherUserId, partnerSession);
              }
              
              // Delete the room
              await RedisService.deleteRoom(session.roomId);
            }
          } else {
            // User was just waiting in queue, remove them
            await RedisService.removeFromQueue(userId);
          }

          // Clean up user data
          await RedisService.deleteUser(userId);
          await RedisService.deleteSession(userId);
          await RedisService.deleteHeartbeat(userId);

          console.log("[Backend] User cleanup complete");

          // Update queue positions for remaining users
          await updateQueuePositions();
        }

        return Response.json({ success: true });
      }

      case "heartbeat": {
        if (!userId) {
          return Response.json({ error: "Missing userId" }, { status: 400 });
        }

        try {
          const user = await RedisService.getUser(userId);
          if (!user) {
            return Response.json({ error: "User session expired" }, { status: 401 });
          }

          // Update heartbeat
          user.lastHeartbeat = Date.now();
          await RedisService.setUser(userId, user);
          await RedisService.setHeartbeat(userId, Date.now());

          // Check if user is in a matched chat
          const session = await RedisService.getSession(userId);
          if (session?.roomId) {
            const room = await RedisService.getRoom(session.roomId);
            if (room) {
              const otherUserId =
                room.user1Id === userId ? room.user2Id : room.user1Id;
              const otherUser = await RedisService.getUser(otherUserId);

              // Check partner's health
              if (otherUser) {
                const partnerHeartbeatAge = Date.now() - otherUser.lastHeartbeat;

                if (partnerHeartbeatAge > 30000) {
                  // Partner is offline
                  console.log(
                    `[Backend] Heartbeat: Partner ${otherUser.name} offline (${partnerHeartbeatAge}ms)`
                  );

                  // Notify current user
                  await RedisService.pushEvent(userId, {
                    type: "partner_offline",
                    payload: {
                      message: "Your chat partner is no longer responding",
                    },
                  });

                  // Clean up
                  await RedisService.deleteRoom(session.roomId);
                  await RedisService.deleteUser(otherUserId);
                  await RedisService.deleteSession(otherUserId);

                  // Return current user to queue
                  user.status = "waiting";
                  await RedisService.setUser(userId, user);
                  await RedisService.pushToQueue(user);

                  session.roomId = null;
                  session.matchedUserId = null;
                  await RedisService.setSession(userId, session);

                  return Response.json({
                    success: true,
                    partnerOffline: true,
                    message: "Chat partner went offline, returning to queue",
                  });
                }
              }
            }
          }

          return Response.json({ success: true });
        } catch (error) {
          console.error("[Backend] Heartbeat error:", error);
          return Response.json({ error: "Heartbeat failed" }, { status: 500 });
        }
      }

      case "get_messages": {
        if (!roomId) {
          return Response.json({ error: "Missing roomId" }, { status: 400 });
        }

        const room = await RedisService.getRoom(roomId);
        if (!room) {
          return Response.json({ error: "Room not found" }, { status: 404 });
        }

        return Response.json({
          messages: room.messages,
        });
      }

      case "get_room_info": {
        if (!roomId) {
          return Response.json({ error: "Missing roomId" }, { status: 400 });
        }

        const room = await RedisService.getRoom(roomId);
        if (!room) {
          return Response.json({ error: "Room not found" }, { status: 404 });
        }

        const user1 = await RedisService.getUser(room.user1Id);
        const user2 = await RedisService.getUser(room.user2Id);

        return Response.json({
          room: {
            id: room.id,
            user1: {
              id: user1?.id,
              name: user1?.name,
              interests: user1?.interests,
              color: user1?.color,
            },
            user2: {
              id: user2?.id,
              name: user2?.name,
              interests: user2?.interests,
              color: user2?.color,
            },
            commonInterests: room.commonInterests,
          },
        });
      }

      default:
        return Response.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    console.error("[Backend] POST error:", error);
    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
