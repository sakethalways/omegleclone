"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { UserSession, ChatMessage, MatchFoundPayload } from "@/lib/chat-types";

interface UseChatSessionOptions {
  onMatchFound?: (match: MatchFoundPayload) => void;
  onQueueUpdate?: (position: number, total: number) => void;
  onMessageReceived?: (message: ChatMessage) => void;
  onTypingUpdate?: (isTyping: boolean) => void;
  onUserLeft?: (reason: string, userLeftId: string) => void;
  onError?: (error: string) => void;
}

export function useChatSession(options: UseChatSessionOptions = {}) {
  const [session, setSession] = useState<UserSession | null>(null);
  const [queuePosition, setQueuePosition] = useState<number>(0);
  const [isConnected, setIsConnected] = useState(false);
  
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);

  // Join queue
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

        if (!response.ok) throw new Error("Failed to join queue");

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
        };

        setSession(newSession);
        setIsConnected(true);

        // Start polling for events
        startPolling(data.userId);

        // Start heartbeat
        startHeartbeat(data.userId);

        console.log("[v0] Joined queue successfully");
        return data.userId;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        console.error("[v0] Failed to join queue:", message);
        options.onError?.(message);
        throw error;
      }
    },
    [options]
  );

  // Polling mechanism
  const startPolling = useCallback((userId: string) => {
    console.log("[v0] Starting polling for userId:", userId);
    
    // Stop existing poll
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }

    let pollCount = 0;

    const poll = async () => {
      pollCount++;
      try {
        // Add cache buster to prevent old responses
        const timestamp = Date.now();
        const response = await fetch(
          `/api/chat?action=poll&userId=${userId}&t=${timestamp}`,
          {
            headers: {
              "Cache-Control": "no-cache",
              Pragma: "no-cache",
            },
          }
        );
        
        if (!response.ok) {
          console.error("[v0] Poll failed with status:", response.status, "count:", pollCount);
          return;
        }

        const data = await response.json();
        const events = data.events || [];

        console.log("[v0] Poll #" + pollCount + " received", events.length, "events");

        for (const event of events) {
          try {
            switch (event.type) {
              case "connected":
                console.log("[v0] Connected via polling");
                setIsConnected(true);
                break;
              case "match_found":
                console.log("[v0] Match found:", event.payload);
                options.onMatchFound?.(event.payload);
                break;
              case "queue_update":
                console.log("[v0] Queue position:", event.payload.position);
                setQueuePosition(event.payload.position);
                options.onQueueUpdate?.(
                  event.payload.position,
                  event.payload.totalWaiting
                );
                break;
              case "message_received":
                console.log("[v0] Message received from user");
                options.onMessageReceived?.(event.payload);
                break;
              case "typing_update":
                console.log("[v0] Typing update:", event.payload.isTyping);
                options.onTypingUpdate?.(event.payload.isTyping);
                break;
              case "user_left":
                console.log("[v0] User left:", event.payload);
                options.onUserLeft?.(event.payload.reason, event.payload.userLeftId);
                break;
            }
          } catch (error) {
            console.error("[v0] Failed to handle event:", error, event);
          }
        }
      } catch (error) {
        console.error("[v0] Poll error:", error);
        setIsConnected(false);
      }
    };

    console.log("[v0] Initial poll starting");
    // Initial poll
    poll();

    console.log("[v0] Setting up polling interval - 500ms");
    // Poll every 500ms for near real-time updates
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
      }).catch((error) => console.error("[v0] Heartbeat failed:", error));
    }, 30000);
  }, []);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!session?.roomId || !session?.userId) return;

      try {
        await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "send_message",
            userId: session.userId,
            roomId: session.roomId,
            content,
          }),
        });
      } catch (error) {
        console.error("[v0] Failed to send message:", error);
        options.onError?.(
          error instanceof Error ? error.message : "Failed to send message"
        );
      }
    },
    [session, options]
  );

  const sendTyping = useCallback(
    async (isTyping: boolean) => {
      if (!session?.roomId || !session?.userId) return;

      try {
        await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "typing",
            userId: session.userId,
            roomId: session.roomId,
            isTyping,
          }),
        });
      } catch (error) {
        console.error("[v0] Failed to send typing status:", error);
      }
    },
    [session]
  );

  const skipUser = useCallback(async () => {
    if (!session?.roomId || !session?.userId) return;

    try {
      await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "skip_user",
          userId: session.userId,
          roomId: session.roomId,
        }),
      });

      setSession((prev) =>
        prev
          ? {
              ...prev,
              roomId: null,
              matchedUserId: null,
            }
          : null
      );
    } catch (error) {
      console.error("[v0] Failed to skip user:", error);
      options.onError?.(
        error instanceof Error ? error.message : "Failed to skip user"
      );
    }
  }, [session, options]);

  const blockUser = useCallback(
    async (blockedUserId: string) => {
      if (!session?.userId) return;

      try {
        await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "block_user",
            userId: session.userId,
            blockedUserId,
          }),
        });

        setSession((prev) =>
          prev
            ? {
                ...prev,
                blockedUsers: [...prev.blockedUsers, blockedUserId],
              }
            : null
        );
      } catch (error) {
        console.error("[v0] Failed to block user:", error);
        options.onError?.(
          error instanceof Error ? error.message : "Failed to block user"
        );
      }
    },
    [session, options]
  );

  const disconnect = useCallback(async () => {
    if (!session?.userId) return;

    try {
      await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "disconnect",
          userId: session.userId,
        }),
      });
    } catch (error) {
      console.error("[v0] Failed to disconnect:", error);
    }

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

      if (!response.ok) throw new Error("Failed to fetch messages");

      const data = await response.json();
      return data.messages || [];
    } catch (error) {
      console.error("[v0] Failed to get messages:", error);
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

      if (!response.ok) throw new Error("Failed to fetch room info");

      const data = await response.json();
      return data.room;
    } catch (error) {
      console.error("[v0] Failed to get room info:", error);
      return null;
    }
  }, [session?.roomId]);

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
      }
    };
  }, []);

  return {
    session,
    isConnected,
    queuePosition,
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
