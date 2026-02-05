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
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-3 sm:p-4 relative overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-80 h-80 bg-blue-500/5 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-purple-500/5 rounded-full blur-3xl"></div>
      </div>

      <div className="relative max-w-2xl mx-auto h-[calc(100vh-24px)] sm:h-[calc(100vh-32px)] flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-800/90 to-slate-800/70 backdrop-blur-md border border-slate-700/50 rounded-2xl p-3 sm:p-4 mb-3 shadow-lg">
          <div className="flex items-center justify-between gap-2 sm:gap-4">
            {/* User Info */}
            <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
              <div
                className="w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center text-white font-bold text-sm sm:text-base flex-shrink-0 shadow-lg"
                style={{ backgroundColor: matchedUser.color }}
              >
                {matchedUser.name[0].toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-white text-sm sm:text-base truncate">{matchedUser.name}</h3>
                <div className="flex gap-1 flex-wrap">
                  {commonInterests.slice(0, 2).map((interest) => (
                    <span
                      key={interest}
                      className="text-xs px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded-full font-medium border border-blue-500/30"
                    >
                      {interest}
                    </span>
                  ))}
                  {commonInterests.length > 2 && (
                    <span className="text-xs text-slate-400">+{commonInterests.length - 2}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-1 sm:gap-2 flex-shrink-0">
              <button
                onClick={() => onBlock(matchedUser.id)}
                className="p-1.5 sm:p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all duration-200 hover:scale-110 active:scale-95 group"
                title="Block"
              >
                <Ban className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none">Block</span>
              </button>
              <button
                onClick={onSkip}
                className="p-1.5 sm:p-2 text-slate-400 hover:text-yellow-400 hover:bg-yellow-500/10 rounded-lg transition-all duration-200 hover:scale-110 active:scale-95 group"
                title="Skip"
              >
                <SkipForward className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none">Skip</span>
              </button>
              <button
                onClick={onDisconnect}
                className="p-1.5 sm:p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all duration-200 hover:scale-110 active:scale-95 group"
                title="Exit"
              >
                <LogOut className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none">Exit</span>
              </button>
            </div>
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 bg-slate-800/40 backdrop-blur-sm border border-slate-700/50 rounded-2xl overflow-y-auto p-3 sm:p-4 flex flex-col gap-3 mb-3 scroll-smooth">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                  <MessageCircle className="w-6 h-6 text-blue-400" />
                </div>
                <p className="text-slate-300 font-medium text-sm">Start a conversation</p>
                <p className="text-slate-400 text-xs mt-1">Say hello to break the ice!</p>
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
                      className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                      style={{ backgroundColor: matchedUser.color }}
                    >
                      {matchedUser.name[0].toUpperCase()}
                    </div>
                  )}
                  <div
                    className={`max-w-xs lg:max-w-sm px-3 sm:px-4 py-2 sm:py-3 rounded-2xl text-sm sm:text-base leading-relaxed break-words transition-all duration-200 ${
                      isOwnMessage
                        ? "bg-gradient-to-br from-blue-600 to-blue-500 text-white rounded-br-none shadow-lg hover:shadow-blue-500/50"
                        : "bg-slate-700/60 text-slate-100 rounded-bl-none shadow-md hover:bg-slate-700/80"
                    }`}
                  >
                    <p className="break-words">{msg.content}</p>
                    <p className={`text-xs mt-1.5 font-medium opacity-60`}>
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
              <div className="bg-slate-700/60 rounded-2xl rounded-bl-none px-4 py-3 flex gap-1.5">
                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{animationDelay: '0ms'}}></div>
                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{animationDelay: '100ms'}}></div>
                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{animationDelay: '200ms'}}></div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="bg-gradient-to-r from-slate-800/90 to-slate-800/70 backdrop-blur-md border border-slate-700/50 rounded-2xl p-3 sm:p-4 shadow-lg">
          <form onSubmit={handleSendMessage} className="flex gap-2">
            <input
              type="text"
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Your message..."
              className="flex-1 px-3 sm:px-4 py-2 sm:py-2.5 bg-slate-700/50 border border-slate-600/50 rounded-xl text-white placeholder-slate-400 text-sm sm:text-base focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition-all duration-200 hover:border-slate-500"
            />
            <button
              type="submit"
              className="px-3 sm:px-4 py-2 sm:py-2.5 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white font-semibold rounded-xl transition-all duration-200 hover:shadow-lg hover:shadow-blue-500/30 active:scale-95 transform flex items-center justify-center gap-1.5 sm:gap-2"
            >
              <Send className="w-4 h-4 sm:w-5 sm:h-5" />
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
