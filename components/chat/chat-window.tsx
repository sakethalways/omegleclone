"use client";

import React from "react"

import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/chat-types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Send, LogOut, SkipForward, Ban, MessageCircle } from "lucide-react";

interface ChatWindowProps {
  messages: ChatMessage[];
  currentUserId: string;
  currentUserName: string;
  currentUserColor: string;
  matchedUser: {
    id: string;
    name: string;
    interests: string[];
    color: string;
  };
  commonInterests: string[];
  onSendMessage: (content: string) => void;
  onSendTyping: (isTyping: boolean) => void;
  onSkip: () => void;
  onBlock: (userId: string) => void;
  onDisconnect: () => void;
  isRemoteTyping: boolean;
  isLoading?: boolean;
}

export function ChatWindow({
  messages,
  currentUserId,
  currentUserName,
  currentUserColor,
  matchedUser,
  commonInterests,
  onSendMessage,
  onSendTyping,
  onSkip,
  onBlock,
  onDisconnect,
  isRemoteTyping,
  isLoading = false,
}: ChatWindowProps) {
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    console.log("[v0] ChatWindow received messages prop:", messages.length, "messages:", messages);
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);

    if (!isTyping) {
      setIsTyping(true);
      onSendTyping(true);
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      onSendTyping(false);
    }, 2000);
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    onSendMessage(inputValue);
    setInputValue("");
    setIsTyping(false);
    onSendTyping(false);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(e as any);
    }
  };

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-yellow-50 to-white p-3 sm:p-4 relative overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-80 h-80 bg-orange-200/30 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-yellow-200/30 rounded-full blur-3xl"></div>
      </div>

      <div className="relative max-w-3xl mx-auto h-[calc(100vh-24px)] sm:h-[calc(100vh-32px)] flex flex-col">
        {/* Header - Compact */}
        <div className="bg-gradient-to-r from-white to-orange-50 backdrop-blur-md border border-orange-200 rounded-xl p-2.5 sm:p-3 mb-2 shadow-lg">
          <div className="flex items-center justify-between gap-2">
            {/* User Info - Compact */}
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-white font-bold text-xs sm:text-sm flex-shrink-0 shadow-lg"
                style={{ backgroundColor: matchedUser.color }}
              >
                {matchedUser.name[0].toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-gray-800 text-xs sm:text-sm truncate">{matchedUser.name}</h3>
                <div className="flex gap-0.5 flex-wrap">
                  {commonInterests.slice(0, 1).map((interest) => (
                    <span
                      key={interest}
                      className="text-xs px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded-full font-medium border border-orange-300 truncate"
                    >
                      {interest}
                    </span>
                  ))}
                  {commonInterests.length > 1 && (
                    <span className="text-xs text-gray-600 px-1">+{commonInterests.length - 1}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Action Buttons - Compact */}
            <div className="flex gap-0.5 sm:gap-1 flex-shrink-0">
            <button
                onClick={() => onBlock(matchedUser.id)}
                disabled={isLoading}
                className="p-1 sm:p-1.5 text-orange-600 hover:text-red-600 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-all duration-200 hover:scale-110 active:scale-95 group relative"
                title="Block"
              >
                <Ban className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none">Block</span>
              </button>
              <button
                onClick={onSkip}
                disabled={isLoading}
                className="p-1 sm:p-1.5 text-orange-600 hover:text-yellow-700 hover:bg-yellow-100 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-all duration-200 hover:scale-110 active:scale-95"
                title="Skip"
              >
                <SkipForward className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none">Skip</span>
              </button>
              <button
                onClick={onDisconnect}
                disabled={isLoading}
                className="p-1 sm:p-1.5 text-orange-600 hover:text-orange-700 hover:bg-orange-100 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-all duration-200 hover:scale-110 active:scale-95 group relative"
                title="Exit"
              >
                <LogOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-xs px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none">Exit</span>
              </button>
            </div>
          </div>
        </div>

        {/* Messages Area - Compact */}
        <div className="flex-1 bg-white/70 backdrop-blur-sm border border-orange-200 rounded-xl overflow-y-auto p-2.5 sm:p-3 flex flex-col gap-2 mb-2 scroll-smooth">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="w-10 h-10 bg-gradient-to-br from-orange-500/20 to-yellow-500/20 rounded-full flex items-center justify-center mx-auto mb-2">
                  <MessageCircle className="w-5 h-5 text-orange-600" />
                </div>
                <p className="text-gray-700 font-medium text-xs sm:text-sm">Start a conversation</p>
                <p className="text-gray-500 text-xs mt-0.5">Say hello!</p>
              </div>
            </div>
          ) : (
            messages.map((msg, idx) => {
              const isOwnMessage = msg.senderId === currentUserId;
              return (
                <div
                  key={msg.id}
                  className={`flex gap-2 animate-[slideIn_0.3s_ease-out] ${isOwnMessage ? "justify-end" : "justify-start"}`}
                  style={{animationDelay: `${idx * 50}ms`}}
                >
                  {!isOwnMessage && (
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                      style={{ backgroundColor: matchedUser.color }}
                    >
                      {matchedUser.name[0].toUpperCase()}
                    </div>
                  )}
                  <div
                    className={`max-w-xs lg:max-w-md px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm leading-relaxed break-words transition-all duration-200 ${
                      isOwnMessage
                        ? "bg-gradient-to-br from-orange-500 to-yellow-500 text-white rounded-br-none shadow-lg hover:shadow-orange-500/50"
                        : "bg-gray-100 text-gray-800 rounded-bl-none shadow-md hover:bg-gray-200"
                    }`}
                  >
                    <p className="break-words">{msg.content}</p>
                    <p className={`text-xs mt-1 font-medium opacity-60`}>
                      {new Date(msg.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              );
            })
          )}

          {isRemoteTyping && (
            <div className="flex justify-start gap-2">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                style={{ backgroundColor: matchedUser.color }}
              >
                {matchedUser.name[0].toUpperCase()}
              </div>
              <div className="bg-gray-100 rounded-lg rounded-bl-none px-2.5 py-1.5 sm:px-3 sm:py-2 flex gap-1">
                <div className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce" style={{animationDelay: '0ms'}}></div>
                <div className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce" style={{animationDelay: '100ms'}}></div>
                <div className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce" style={{animationDelay: '200ms'}}></div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Area - Compact */}
        <div className="bg-gradient-to-r from-white to-orange-50 backdrop-blur-md border border-orange-200 rounded-xl p-2 sm:p-3 shadow-lg">
          <form onSubmit={handleSendMessage} className="flex gap-1.5 sm:gap-2">
            <input
              type="text"
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              placeholder="Say something..."
              className="flex-1 px-2.5 sm:px-3 py-1.5 sm:py-2 bg-white border border-orange-200 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-gray-800 placeholder-gray-400 text-xs sm:text-sm focus:outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400 transition-all duration-200 hover:border-orange-300"
            />
            <button
              type="submit"
              disabled={isLoading}
              className="px-2.5 sm:px-3 py-1.5 sm:py-2 bg-gradient-to-r from-orange-500 to-yellow-500 hover:from-orange-600 hover:to-yellow-600 disabled:from-gray-400 disabled:to-gray-300 text-white font-semibold rounded-lg transition-all duration-200 hover:shadow-lg hover:shadow-orange-500/30 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transform flex items-center justify-center gap-1"
            >
              <Send className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Send</span>
            </button>
          </form>
        </div>
      </div>

      {/* CSS for slideIn animation */}
      <style>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
