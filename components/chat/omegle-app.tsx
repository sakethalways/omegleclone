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
  const [isAutoSearching, setIsAutoSearching] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

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
      setIsAutoSearching(false);
      setError(null);

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
      
      // Clear current chat immediately
      setMessages([]);
      setMatchedUser(null);
      setRoomId(null);
      setAppState("waiting"); // Switch to waiting state immediately
      setIsAutoSearching(true); // Show "Finding new match" UI
      
      // Provide user-friendly notification
      let notificationMsg = "";
      if (reason === "skip") {
        notificationMsg = "👋 User skipped the chat - Finding new match...";
      } else if (reason === "disconnect") {
        notificationMsg = "🔌 User disconnected - Finding new match...";
      } else if (reason === "block") {
        notificationMsg = "🚫 You've been blocked - Finding new match...";
      } else {
        notificationMsg = `Chat ended (${reason}) - Finding new match...`;
      }
      
      setError(notificationMsg);
      
      // Auto-rejoin queue immediately (don't wait for response)
      console.log("[v0] Auto-rejoining queue after user left");
      if (session?.interests) {
        joinQueue(session.userName, session.interests)
          .then(() => {
            console.log("[v0] Auto-rejoin successful");
            // Clear auto-searching state after 2 seconds or when match found
            setTimeout(() => {
              setIsAutoSearching(false);
              setError(null);
            }, 2000);
          })
          .catch((err) => {
            console.error("[v0] Auto-rejoin failed:", err);
            setError("Could not find new match - Returning to home");
            setIsAutoSearching(false);
            setTimeout(() => {
              setAppState("interests");
              setError(null);
            }, 2000);
          });
      }
    },

    onPartnerOffline: (message: string) => {
      console.log("[v0] Partner offline:", message);
      setMessages([]);
      setMatchedUser(null);
      setRoomId(null);
      
      setError(`⏱️ ${message}`);
      
      // Auto-reconnect after showing message
      setTimeout(() => {
        setError(null);
        setAppState("waiting");
        if (session?.interests) {
          joinQueue(session.userName, session.interests).catch((err) => {
            console.error("[v0] Auto-join failed:", err);
            setError("Failed to rejoin queue");
          });
        }
      }, 2000);
    },

    onUserSkipped: (message: string) => {
      console.log("[v0] User skipped:", message);
      setMessages([]);
      setMatchedUser(null);
      setRoomId(null);
      
      setError(`👋 ${message}`);
      
      // Auto-reconnect after showing message
      setTimeout(() => {
        setError(null);
        setAppState("waiting");
        if (session?.interests) {
          joinQueue(session.userName, session.interests).catch((err) => {
            console.error("[v0] Auto-join failed:", err);
            setError("Failed to rejoin queue");
          });
        }
      }, 2000);
    },

    onUserBlocked: (message: string) => {
      console.log("[v0] User blocked:", message);
      setMessages([]);
      setMatchedUser(null);
      setRoomId(null);
      
      setError(`🚫 ${message}`);
      
      // Auto-reconnect after showing message
      setTimeout(() => {
        setError(null);
        setAppState("waiting");
        if (session?.interests) {
          joinQueue(session.userName, session.interests).catch((err) => {
            console.error("[v0] Auto-join failed:", err);
            setError("Failed to rejoin queue");
          });
        }
      }, 2000);
    },

    onUserDisconnected: (message: string) => {
      console.log("[v0] User disconnected:", message);
      setMessages([]);
      setMatchedUser(null);
      setRoomId(null);
      
      setError(`🔌 ${message}`);
      
      // Auto-reconnect after showing message
      setTimeout(() => {
        setError(null);
        setAppState("waiting");
        if (session?.interests) {
          joinQueue(session.userName, session.interests).catch((err) => {
            console.error("[v0] Auto-join failed:", err);
            setError("Failed to rejoin queue");
          });
        }
      }, 2000);
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
      setIsLoading(true);
      const userId = await joinQueue(userName, interests);
      console.log("[v0] Joined queue with userId:", userId);
      setIsLoading(false);
      setAppState("waiting");
      setIsAutoSearching(false); // Not an auto-search, regular join
    } catch (err) {
      setIsLoading(false);
      setError(err instanceof Error ? err.message : "Failed to join queue");
      setAppState("error");
    }
  };

  const handleCancel = async () => {
    setIsLoading(true);
    await disconnect();
    setIsLoading(false);
    setAppState("interests");
    setMessages([]);
    setMatchedUser(null);
    setRoomId(null);
    setIsAutoSearching(false);
    setError(null);
  };

  const handleSkip = async () => {
    setIsLoading(true);
    await skipUser();
    setIsLoading(false);
    setMessages([]);
    setMatchedUser(null);
    setRoomId(null);
    setAppState("waiting");
    setIsAutoSearching(true); // Show finding new match UI
  };

  const handleBlock = async (userId: string) => {
    setIsLoading(true);
    await blockUser(userId);
    // Also skip the user to end the conversation and sync backend state
    await skipUser();
    setIsLoading(false);
    setMessages([]);
    setMatchedUser(null);
    setRoomId(null);
    setAppState("waiting");
    setIsAutoSearching(true); // Show finding new match UI
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
    setIsLoading(true);
    await disconnect();
    setIsLoading(false);
    setAppState("interests");
    setMessages([]);
    setMatchedUser(null);
    setRoomId(null);
    setIsAutoSearching(false);
    setError(null);
  };

  // Loading overlay
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
        {/* Animated background */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute top-0 left-0 w-40 h-40 bg-purple-500/5 rounded-full blur-2xl animate-pulse" style={{animationDelay: '0.5s'}}></div>
        </div>

        <div className="relative text-center">
          <div className="mb-6 flex justify-center">
            <div className="relative w-20 h-20">
              {/* Outer ring */}
              <div className="absolute inset-0 rounded-full border-2 border-slate-700/50"></div>
              {/* Animated ring */}
              <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-blue-500 border-r-purple-500 animate-spin"></div>
              {/* Pulsing center */}
              <div className="absolute inset-2 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 animate-pulse"></div>
            </div>
          </div>
          <p className="text-white font-semibold text-lg">Loading...</p>
          <p className="text-slate-400 text-sm mt-2">Please wait</p>
        </div>
      </div>
    );
  }

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
                setIsLoading(true);
                await disconnect();
                setIsLoading(false);
                setMessages([]);
                setMatchedUser(null);
                setRoomId(null);
                setAppState("interests");
                setError(null);
              }}
              disabled={isLoading}
              className="w-full px-4 py-2.5 sm:py-3 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 disabled:from-slate-600 disabled:to-slate-500 text-white font-semibold rounded-lg transition-all duration-200 hover:shadow-lg hover:shadow-blue-500/30 active:scale-95 transform text-sm sm:text-base disabled:opacity-70"
            >
              {isLoading ? "Loading..." : "Try Again"}
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
        isLoading={isLoading}
      />
    );
  }

  // Waiting for match screen
  if (appState === "waiting" && session) {
    const showNoUsers = totalWaiting === 0 || (totalWaiting === 1 && queuePosition === 1);
    
    return (
      <WaitingQueue
        position={queuePosition}
        totalWaiting={totalWaiting || queuePosition}
        interests={session.interests}
        onCancel={handleCancel}
        isAutoSearching={isAutoSearching}
        noUsersOnline={showNoUsers}
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
        isLoading={isLoading}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
      <div className="text-white">Loading...</div>
    </div>
  );
}
