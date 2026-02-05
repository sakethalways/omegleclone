"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { UserSession, ChatMessage, MatchFoundPayload } from "@/lib/chat-types";

interface UseChatOptions {
  onMatchFound?: (match: MatchFoundPayload) => void;
  onQueueUpdate?: (position: number, total: number) => void;
  onMessageReceived?: (message: ChatMessage) => void;
  onTypingUpdate?: (isTyping: boolean) => void;
  onUserLeft?: (reason: string, userLeftId: string) => void;
  onError?: (error: string) => void;
}

export function useChat(options: UseChatOptions = {}) {
  const [session, setSession] = useState<UserSession | null>(null);
  const [queuePosition, setQueuePosition] = useState<number>(0);
  const [totalWaiting, setTotalWaiting] = useState<number>(0);
  const [isConnected, setIsConnected] = useState(false);
  
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);

  const joinQueue = useCallback(
    async (userName: string, interests: string[]) => {
      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "join_queue",
            userName,
            interests,
          }),
        });

        if (!response.ok) {
          throw new Error(`Failed to join queue: ${response.statusText}`);
        }

        const data = await response.json();

        const newSession: UserSession = {
          userId: data.userId,
          userName,
          interests,
          sessionToken: data.sessionToken,
          roomId: null,
          queuePosition: data.queuePosition,
          matchedUserId: null,
          blockedUsers: [],
          recentMatches: [],
        };

        setSession(newSession);
        setQueuePosition(data.queuePosition || 0);
        setTotalWaiting(data.totalWaiting || data.queuePosition || 0);
        setIsConnected(true);

        startPolling(data.userId);
        startHeartbeat(data.userId);

        return data.userId;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        console.error("[v0] Join queue failed:", message);
        options.onError?.(message);
        throw error;
      }
    },
    [options]
  );

  const startPolling = useCallback((userId: string) => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }

    let pollCount = 0;

    const poll = async () => {
      try {
        pollCount++;
        const url = `/api/chat?action=poll&userId=${encodeURIComponent(userId)}&t=${Date.now()}`;
        
        const response = await fetch(url, {
          cache: "no-store",
          headers: {
            "Cache-Control": "no-cache, no-store, must-revalidate",
            Pragma: "no-cache",
            Expires: "0",
          },
        });
        
        if (!response.ok) {
          console.error(`[v0] Poll ${pollCount}: Failed with status ${response.status}`);
          return;
        }

        const data = await response.json();
        const events = data.events || [];

        if (events.length > 0) {
          console.log(`[v0] Poll ${pollCount}: Received ${events.length} events:`, events.map(e => e.type));
        }

        for (const event of events) {
          switch (event.type) {
            case "connected":
              console.log("[v0] Connected event received");
              setIsConnected(true);
              break;
            case "match_found":
              console.log("[v0] Match found event:", event.payload);
              // Update session with roomId, matchedUserId, and add to recentMatches
              setSession((prev) => {
                if (!prev) return null;
                const recentMatches = [...prev.recentMatches];
                if (!recentMatches.includes(event.payload.matchedUser.id)) {
                  recentMatches.push(event.payload.matchedUser.id);
                  // Keep only last 5 recent matches
                  if (recentMatches.length > 5) {
                    recentMatches.shift();
                  }
                }
                const updated = {
                  ...prev,
                  roomId: event.payload.roomId,
                  matchedUserId: event.payload.matchedUser.id,
                  recentMatches,
                };
                console.log("[v0] Session updated with roomId:", updated.roomId, "recentMatches:", updated.recentMatches);
                return updated;
              });
              options.onMatchFound?.(event.payload);
              break;
            case "queue_update":
              console.log("[v0] Queue update:", event.payload);
              setQueuePosition(event.payload.position);
              setTotalWaiting(event.payload.totalWaiting);
              options.onQueueUpdate?.(
                event.payload.position,
                event.payload.totalWaiting
              );
              break;
            case "message_received":
              console.log("[v0] Message received event:", event.payload);
              options.onMessageReceived?.(event.payload);
              break;
            case "typing_update":
              console.log("[v0] Typing update:", event.payload);
              options.onTypingUpdate?.(event.payload.isTyping);
              break;
            case "user_left":
              console.log("[v0] User left event:", event.payload);
              options.onUserLeft?.(event.payload.reason, event.payload.userLeftId);
              break;
            default:
              console.log("[v0] Unknown event type:", event.type);
          }
        }
      } catch (error) {
        console.error("[v0] Poll error:", error);
      }
    };

    poll();
    pollIntervalRef.current = setInterval(poll, 500);
  }, [options]);

  const startHeartbeat = useCallback((userId: string) => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
    }

    heartbeatRef.current = setInterval(() => {
      fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "heartbeat",
          userId,
        }),
      }).catch(() => {});
    }, 30000);
  }, []);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!session?.roomId || !session?.userId) {
        const errorMsg = "Cannot send message: Chat ended or not properly connected";
        console.error("[v0] Send message: Missing roomId or userId", { 
          roomId: session?.roomId, 
          userId: session?.userId,
          sessionExists: !!session 
        });
        options.onError?.(errorMsg);
        return;
      }

      console.log("[v0] Sending message:", { 
        userId: session.userId, 
        roomId: session.roomId, 
        content,
        timestamp: new Date().toISOString()
      });

      try {
        const body = JSON.stringify({
          action: "send_message",
          userId: session.userId,
          roomId: session.roomId,
          content,
        });

        console.log("[v0] Message body:", body);

        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });

        if (!response.ok) {
          const errorText = await response.text();
          const errorMsg = `Failed to send message (${response.status})`;
          console.error("[v0] Send message failed:", response.status, errorText);
          options.onError?.(errorMsg);
          return;
        }

        const data = await response.json();
        console.log("[v0] Send message success:", data);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Failed to send message";
        console.error("[v0] Send message error:", error);
        options.onError?.(errorMsg);
      }
    },
    [session, options]
  );

  const sendTyping = useCallback(
    async (isTyping: boolean) => {
      if (!session?.roomId || !session?.userId) return;

      await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "typing",
          userId: session.userId,
          roomId: session.roomId,
          isTyping,
        }),
      }).catch(() => {});
    },
    [session]
  );

  const skipUser = useCallback(async () => {
    if (!session?.roomId || !session?.userId) return;

    await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "skip_user",
        userId: session.userId,
        roomId: session.roomId,
      }),
    }).catch((error) => console.error("[v0] Skip error:", error));

    setSession((prev) =>
      prev ? { ...prev, roomId: null, matchedUserId: null } : null
    );
  }, [session]);

  const blockUser = useCallback(
    async (blockedUserId: string) => {
      if (!session?.userId) return;

      await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "block_user",
          userId: session.userId,
          blockedUserId,
        }),
      }).catch(() => {});

      setSession((prev) =>
        prev
          ? {
              ...prev,
              blockedUsers: [...prev.blockedUsers, blockedUserId],
            }
          : null
      );
    },
    [session]
  );

  const disconnect = useCallback(async () => {
    if (!session?.userId) return;

    await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "disconnect",
        userId: session.userId,
      }),
    }).catch(() => {});

    setSession(null);
    setIsConnected(false);

    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  }, [session?.userId]);

  const getMessages = useCallback(async () => {
    if (!session?.roomId) return [];

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "get_messages",
          roomId: session.roomId,
        }),
      });

      if (!response.ok) return [];
      const data = await response.json();
      return data.messages || [];
    } catch {
      return [];
    }
  }, [session?.roomId]);

  const getRoomInfo = useCallback(async () => {
    if (!session?.roomId) return null;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "get_room_info",
          roomId: session.roomId,
        }),
      });

      if (!response.ok) return null;
      const data = await response.json();
      return data.room;
    } catch {
      return null;
    }
  }, [session?.roomId]);

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, []);

  return {
    session,
    isConnected,
    queuePosition,
    totalWaiting,
    joinQueue,
    sendMessage,
    sendTyping,
    skipUser,
    blockUser,
    disconnect,
    getMessages,
    getRoomInfo,
    updateSession: setSession,
  };
}
