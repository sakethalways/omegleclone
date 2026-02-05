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

// In-memory data structures
const users = new Map<string, ChatUser>();
const rooms = new Map<string, ChatRoom>();
const queue: ChatUser[] = [];
const sessions = new Map<string, UserSession>();

// Event queue per user for polling
const userEvents = new Map<string, Array<{ type: string; payload: unknown }>>();

const QUEUE_CHECK_INTERVAL = 2000;

// Start periodic matching
if (typeof global !== "undefined") {
  (global as any).matchingInterval = setInterval(() => {
    performMatching();
  }, QUEUE_CHECK_INTERVAL);
}

function performMatching() {
  if (queue.length < 2) return;

  const pairs = matchingEngine.findMatches(queue);

  for (const [user1, user2] of pairs) {
    const idx1 = queue.indexOf(user1);
    const idx2 = queue.indexOf(user2);
    if (idx1 > -1) queue.splice(idx1, 1);
    if (idx2 > -1) queue.splice(idx2, 1);

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

    rooms.set(roomId, room);

    user1.status = "matched";
    user1.lastHeartbeat = Date.now();
    user2.status = "matched";
    user2.lastHeartbeat = Date.now();

    const session1 = sessions.get(user1.id);
    const session2 = sessions.get(user2.id);
    if (session1) {
      session1.roomId = roomId;
      session1.matchedUserId = user2.id;
    }
    if (session2) {
      session2.roomId = roomId;
      session2.matchedUserId = user1.id;
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

    queueEvent(user1.id, {
      type: "match_found",
      payload,
    });

    queueEvent(user2.id, {
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
  }

  updateQueuePositions();
}

function updateQueuePositions() {
  queue.forEach((user, index) => {
    const event = {
      type: "queue_update",
      payload: {
        position: index + 1,
        totalWaiting: queue.length,
      },
    };
    queueEvent(user.id, event);
    
    // Also update the session with queue position
    const session = sessions.get(user.id);
    if (session) {
      session.queuePosition = queue.length;
    }
  });
}

function queueEvent(userId: string, event: { type: string; payload: unknown }) {
  if (!userEvents.has(userId)) {
    userEvents.set(userId, []);
  }
  userEvents.get(userId)!.push(event);
}

function getAndClearEvents(userId: string) {
  const events = userEvents.get(userId) || [];
  userEvents.set(userId, []);
  return events;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");

  if (action === "poll") {
    const userId = searchParams.get("userId");
    if (!userId) {
      return Response.json({ error: "Missing userId" }, { status: 400 });
    }

    const user = users.get(userId);
    if (!user) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    // Return pending events
    const events = getAndClearEvents(userId);
    
    // Always return connected status on first poll
    if (events.length === 0) {
      events.push({
        type: "connected",
        payload: { userId, userName: user.name },
      });

      // Add queue position if waiting
      const queuePos = queue.indexOf(user) + 1;
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
      console.log(`[Backend] Poll from ${user.name}: Returning ${events.length} events:`, events.map(e => e.type));
    }

    return Response.json({ events });
  }

  if (action === "interests") {
    return Response.json({ interests: INTEREST_TAGS });
  }

  return Response.json({ error: "Invalid action" }, { status: 400 });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action, userId, roomId, userName, interests, content } = body;

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

      users.set(newUserId, user);
      queue.push(user);
      userEvents.set(newUserId, []);

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

      sessions.set(newUserId, session);

      updateQueuePositions();

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

      const room = rooms.get(roomId);
      if (!room) {
        console.error(`[Backend] send_message: Room not found: ${roomId}`);
        return Response.json({ error: "Room not found" }, { status: 404 });
      }

      const user = users.get(userId);
      if (!user) {
        console.error(`[Backend] send_message: User not found: ${userId}`);
        return Response.json({ error: "User not found" }, { status: 404 });
      }

      const message: ChatMessage = {
        id: generateMessageId(),
        senderId: userId,
        senderName: user.name,
        content,
        timestamp: Date.now(),
        delivered: true,
      };

      room.messages.push(message);
      room.lastActivity = Date.now();

      const otherUserId =
        room.user1Id === userId ? room.user2Id : room.user1Id;

      console.log(`[Backend] send_message: From ${user.name} to ${otherUserId}, content: "${content}"`);

      // Only send to the other user, not back to sender (sender already knows via optimistic update)
      queueEvent(otherUserId, {
        type: "message_received",
        payload: message,
      });

      console.log(`[Backend] send_message: Queued for ${otherUserId}`);

      return Response.json({ success: true, messageId: message.id });
    }

    case "typing": {
      if (!userId || !roomId) {
        return Response.json(
          { error: "Missing required fields" },
          { status: 400 }
        );
      }

      const room = rooms.get(roomId);
      if (!room) {
        return Response.json({ error: "Room not found" }, { status: 404 });
      }

      const otherUserId =
        room.user1Id === userId ? room.user2Id : room.user1Id;

      queueEvent(otherUserId, {
        type: "typing_update",
        payload: {
          isTyping: body.isTyping ?? true,
        },
      });

      return Response.json({ success: true });
    }

    case "skip_user": {
      if (!userId || !roomId) {
        return Response.json(
          { error: "Missing required fields" },
          { status: 400 }
        );
      }

      const room = rooms.get(roomId);
      if (!room) {
        return Response.json({ error: "Room not found" }, { status: 404 });
      }

      const otherUserId =
        room.user1Id === userId ? room.user2Id : room.user1Id;
      const otherUser = users.get(otherUserId);

      // Notify the other user they were skipped
      queueEvent(otherUserId, {
        type: "user_left",
        payload: {
          reason: "skip",
          userLeftId: userId,
        },
      });

      if (otherUser) {
        otherUser.status = "waiting";
        queue.push(otherUser);
        const session = sessions.get(otherUserId);
        if (session) {
          session.roomId = null;
          session.matchedUserId = null;
        }
      }

      const user = users.get(userId);
      if (user) {
        user.status = "waiting";
        queue.push(user);
        const session = sessions.get(userId);
        if (session) {
          session.roomId = null;
          session.matchedUserId = null;
        }
      }

      // Delete room and update queue positions for all users
      rooms.delete(roomId);
      updateQueuePositions();

      return Response.json({ success: true });
    }

    case "block_user": {
      if (!userId || !body.blockedUserId) {
        return Response.json(
          { error: "Missing required fields" },
          { status: 400 }
        );
      }

      const user = users.get(userId);
      if (user) {
        if (!user.blockedUsers.includes(body.blockedUserId)) {
          user.blockedUsers.push(body.blockedUserId);
        }
      }

      const session = sessions.get(userId);
      if (session && !session.blockedUsers.includes(body.blockedUserId)) {
        session.blockedUsers.push(body.blockedUserId);
      }

      return Response.json({ success: true });
    }

    case "disconnect": {
      if (!userId) {
        return Response.json(
          { error: "Missing userId" },
          { status: 400 }
        );
      }

      console.log(`[Backend] Disconnect user: ${userId}`);

      const user = users.get(userId);
      if (user) {
        const roomEntry = Array.from(rooms.values()).find(
          (r) => r.user1Id === userId || r.user2Id === userId
        );

        if (roomEntry) {
          console.log(`[Backend] User was in room, notifying other user`);
          const otherUserId =
            roomEntry.user1Id === userId
              ? roomEntry.user2Id
              : roomEntry.user1Id;

          // Notify the other user they disconnected
          queueEvent(otherUserId, {
            type: "user_left",
            payload: {
              reason: "disconnect",
              userLeftId: userId,
            },
          });

          const otherUser = users.get(otherUserId);
          if (otherUser) {
            otherUser.status = "waiting";
            queue.push(otherUser);
            const session = sessions.get(otherUserId);
            if (session) {
              session.roomId = null;
              session.matchedUserId = null;
            }
          }

          rooms.delete(roomEntry.id);
        } else {
          console.log(`[Backend] User was in queue, removing from queue`);
        }

        // Remove user from queue if they're in it
        const queueIdx = queue.indexOf(user);
        if (queueIdx > -1) {
          queue.splice(queueIdx, 1);
        }

        // Clean up user data
        users.delete(userId);
        sessions.delete(userId);
        userEvents.delete(userId);
        
        console.log(`[Backend] Queue after disconnect: ${queue.length} users`);
        // Update queue positions for remaining users
        updateQueuePositions();
      }

      return Response.json({ success: true });
    }

    case "heartbeat": {
      if (!userId) {
        return Response.json(
          { error: "Missing userId" },
          { status: 400 }
        );
      }

      const user = users.get(userId);
      if (user) {
        user.lastHeartbeat = Date.now();
      }

      return Response.json({ success: true });
    }

    case "get_messages": {
      if (!roomId) {
        return Response.json(
          { error: "Missing roomId" },
          { status: 400 }
        );
      }

      const room = rooms.get(roomId);
      if (!room) {
        return Response.json({ error: "Room not found" }, { status: 404 });
      }

      return Response.json({
        messages: room.messages,
      });
    }

    case "get_room_info": {
      if (!roomId) {
        return Response.json(
          { error: "Missing roomId" },
          { status: 400 }
        );
      }

      const room = rooms.get(roomId);
      if (!room) {
        return Response.json({ error: "Room not found" }, { status: 404 });
      }

      const user1 = users.get(room.user1Id);
      const user2 = users.get(room.user2Id);

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
}
