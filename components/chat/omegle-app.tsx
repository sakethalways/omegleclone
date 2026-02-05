"use client";

import { useEffect, useState } from "react";
import type { ChatMessage, MatchFoundPayload } from "@/lib/chat-types";
import { useChat } from "@/hooks/use-chat"; // Corrected import
import { InterestSelector } from "./interest-selector";
import { WaitingQueue } from "./waiting-queue";
import { ChatWindow } from "./chat-window";
import { AlertCircle } from "lucide-react";

type AppState = "interests" | "waiting" | "chatting" | "error";

export function OmegleApp() {
  const [appState, setAppState] = useState<AppState>("interests");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isRemoteTyping, setIsRemoteTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matchedUser, setMatchedUser] = useState<any>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [commonInterests, setCommonInterests] = useState<string[]>([]);

  // Log messages state changes
  useEffect(() => {
    console.log("[v0] Messages state updated:", messages.length, "messages:", messages);
  }, [messages]);

  // Log app state changes
  useEffect(() => {
    console.log("[v0] App state changed to:", appState);
  }, [appState]);

  const {
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
    updateSession,
  } = useChat({
    onMatchFound: (match: MatchFoundPayload) => {
      console.log("[v0] Match found:", match);
      setMatchedUser(match.matchedUser);
      setRoomId(match.roomId);
      setCommonInterests(match.commonInterests);
      setAppState("chatting");
      setMessages([]);

      // Load room info and messages
      getRoomInfo().then((info) => {
        if (info) {
          console.log("[v0] Room info loaded:", info);
        }
      });

      getMessages().then((msgs) => {
        setMessages(msgs);
      });
    },

    onQueueUpdate: (position: number, total: number) => {
      console.log("[v0] Queue update:", position, "of", total);
    },

    onMessageReceived: (message: ChatMessage) => {
      console.log("[v0] onMessageReceived callback fired:", message);
      setMessages((prev) => {
        const updated = [...prev, message];
        console.log("[v0] setMessages called, new count:", updated.length, "new messages:", updated);
        return updated;
      });
    },

    onTypingUpdate: (isTyping: boolean) => {
      setIsRemoteTyping(isTyping);
    },

    onUserLeft: (reason: string, userLeftId: string) => {
      console.log("[v0] User left:", reason, userLeftId);
      
      // Clear current chat
      setMessages([]);
      setMatchedUser(null);
      setRoomId(null);
      
      // Provide user-friendly notification
      let notificationMsg = "";
      if (reason === "skip") {
        notificationMsg = "👋 User skipped the chat";
      } else if (reason === "disconnect") {
        notificationMsg = "🔌 User disconnected";
      } else if (reason === "block") {
        notificationMsg = "🚫 User blocked the chat";
      } else {
        notificationMsg = `Chat ended (${reason})`;
      }
      
      setError(notificationMsg);
      
      // Auto-rejoin queue if there are users waiting
      // Otherwise go back to interests
      if (totalWaiting > 0) {
        console.log("[v0] Auto-rejoin: other users waiting (", totalWaiting, ")");
        // Show error message briefly, then transition
        setTimeout(() => {
          setError(null);
          setAppState("waiting");
          // Re-join the queue with current interests
          if (session?.interests) {
            joinQueue(session.userName, session.interests).catch((err) => {
              console.error("[v0] Auto-rejoin failed:", err);
              setError("Failed to rejoin queue - " + err.message);
            });
          }
        }, 1500); // Show notification for 1.5 seconds
      } else {
        console.log("[v0] No users waiting, going back to interests");
        setTimeout(() => {
          setAppState("interests");
        }, 1500);
      }
    },

    onError: (errorMsg: string) => {
      console.error("[v0] Error:", errorMsg);
      setError(errorMsg);
      setAppState("error");
    },
  });

  const handleSelectInterests = async (
    interests: string[],
    userName: string
  ) => {
    try {
      setError(null);
      const userId = await joinQueue(userName, interests);
      console.log("[v0] Joined queue with userId:", userId);
      setAppState("waiting");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join queue");
      setAppState("error");
    }
  };

  const handleCancel = async () => {
    await disconnect();
    setAppState("interests");
    setMessages([]);
    setMatchedUser(null);
    setRoomId(null);
  };

  const handleSkip = async () => {
    await skipUser();
    setMessages([]);
    setMatchedUser(null);
    setRoomId(null);
    setAppState("waiting");
  };

  const handleBlock = async (userId: string) => {
    await blockUser(userId);
    // Also skip the user to end the conversation and sync backend state
    await skipUser();
    setMessages([]);
    setMatchedUser(null);
    setRoomId(null);
    setAppState("waiting");
  };

  const handleSendMessage = (content: string) => {
    if (!session?.userId) {
      console.error("[v0] handleSendMessage: No session or userId");
      return;
    }

    console.log("[v0] handleSendMessage called:", { content, userId: session.userId });

    // Optimistic update
    const optimisticMessage: ChatMessage = {
      id: `temp_${Date.now()}`,
      senderId: session.userId,
      senderName: session.userName,
      content,
      timestamp: Date.now(),
      delivered: false,
    };

    console.log("[v0] Adding optimistic message:", optimisticMessage);
    
    setMessages((prev) => {
      const updated = [...prev, optimisticMessage];
      console.log("[v0] Optimistic update: messages now", updated.length);
      return updated;
    });
    
    sendMessage(content);
  };

  const handleDisconnect = async () => {
    await disconnect();
    setAppState("interests");
    setMessages([]);
    setMatchedUser(null);
    setRoomId(null);
  };

  // Error screen
  if (appState === "error") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
        {/* Animated background */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 right-0 w-96 h-96 bg-red-500/5 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-orange-500/5 rounded-full blur-3xl"></div>
        </div>

        <div className="relative w-full max-w-sm bg-slate-800/80 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-6 sm:p-8 shadow-2xl">
          <div className="text-center">
            <div className="w-14 h-14 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-red-400" />
            </div>
            <h3 className="font-semibold text-white text-lg sm:text-xl mb-2">
              {error?.includes("skipped") || error?.includes("disconnected") || error?.includes("blocked") ? "Chat Ended" : "Oops!"}
            </h3>
            <p className="text-slate-300 text-sm sm:text-base mb-6 leading-relaxed">
              {error}
            </p>
            <button
              onClick={async () => {
                await disconnect();
                setMessages([]);
                setMatchedUser(null);
                setRoomId(null);
                setAppState("interests");
                setError(null);
              }}
              className="w-full px-4 py-2.5 sm:py-3 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white font-semibold rounded-lg transition-all duration-200 hover:shadow-lg hover:shadow-blue-500/30 active:scale-95 transform text-sm sm:text-base"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Interest selection screen
  if (appState === "interests") {
    return (
      <InterestSelector
        onSelectInterests={handleSelectInterests}
        isLoading={false}
      />
    );
  }

  // Waiting for match screen
  if (appState === "waiting" && session) {
    return (
      <WaitingQueue
        position={queuePosition}
        totalWaiting={totalWaiting || queuePosition}
        interests={session.interests}
        onCancel={handleCancel}
      />
    );
  }

  // Chat screen
  if (
    appState === "chatting" &&
    session &&
    matchedUser &&
    roomId &&
    session.userId
  ) {
    return (
      <ChatWindow
        messages={messages}
        currentUserId={session.userId}
        currentUserName={session.userName}
        currentUserColor={
          session.userId === matchedUser.id ? matchedUser.color : "#4ECDC4"
        }
        matchedUser={matchedUser}
        commonInterests={commonInterests}
        onSendMessage={handleSendMessage}
        onSendTyping={sendTyping}
        onSkip={handleSkip}
        onBlock={handleBlock}
        onDisconnect={handleDisconnect}
        isRemoteTyping={isRemoteTyping}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
      <div className="text-white">Loading...</div>
    </div>
  );
}
