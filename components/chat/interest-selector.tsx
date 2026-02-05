"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { INTEREST_TAGS } from "@/lib/chat-types";
import { Sparkles, X, Search } from "lucide-react";

interface InterestSelectorProps {
  onSelectInterests: (interests: string[], userName: string) => void;
  isLoading?: boolean;
}

export function InterestSelector({
  onSelectInterests,
  isLoading = false,
}: InterestSelectorProps) {
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [userName, setUserName] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Filter interests based on search (case-insensitive)
  const filteredInterests = searchInput.trim()
    ? INTEREST_TAGS.filter((tag) =>
        tag.toLowerCase().includes(searchInput.toLowerCase())
      )
    : [];

  // Sort: already selected items at top for visibility
  const sortedSuggestions = filteredInterests.sort((a, b) => {
    const aSelected = selectedInterests.includes(a);
    const bSelected = selectedInterests.includes(b);
    if (aSelected && !bSelected) return -1;
    if (!aSelected && bSelected) return 1;
    return 0;
  });

  const handleAddInterest = (interest: string) => {
    if (!selectedInterests.includes(interest)) {
      setSelectedInterests((prev) => [...prev, interest]);
    }
    setSearchInput("");
    setShowSuggestions(false);
  };

  const handleRemoveInterest = (interest: string) => {
    setSelectedInterests((prev) => prev.filter((i) => i !== interest));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && sortedSuggestions.length > 0) {
      handleAddInterest(sortedSuggestions[0]);
    }
  };

  const handleStart = () => {
    if (selectedInterests.length === 0) {
      alert("Please select at least one interest");
      return;
    }
    onSelectInterests(selectedInterests, userName || "Anonymous");
  };

  return (
    <div className="h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-3 sm:p-4 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse" style={{animationDelay: '0.7s'}}></div>
      </div>

      <Card className="relative w-full max-w-md bg-slate-800/80 backdrop-blur-xl border border-slate-700/50 shadow-2xl hover:shadow-2xl transition-shadow duration-500 rounded-2xl overflow-visible">
        {/* Gradient border effect */}
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-transparent to-purple-500/10 pointer-events-none"></div>
        
        <div className="relative p-4 sm:p-6 overflow-visible">
          {/* Header */}
          <div className="text-center mb-4 sm:mb-5">
            <div className="flex items-center justify-center gap-2 mb-2">
              <div className="p-1.5 bg-gradient-to-br from-blue-500 to-purple-500 rounded-lg">
                <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                Connect
              </h1>
            </div>
            <p className="text-slate-300 text-xs sm:text-sm">
              Share interests, meet amazing people
            </p>
          </div>

          {/* Name Input */}
          <div className="mb-4">
            <label className="block text-xs font-semibold text-slate-200 mb-1.5">
              Your Name
            </label>
            <input
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="Anonymous"
              className="w-full px-3 py-1.5 sm:py-2 bg-slate-700/50 border border-slate-600/50 rounded-lg text-white placeholder-slate-400 text-xs sm:text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition-all duration-200 hover:border-slate-500"
            />
          </div>

          {/* Interests Dropdown */}
          <div className="mb-4 relative z-20">
            <label className="block text-xs font-semibold text-slate-200 mb-2">
              Pick Interests <span className="text-blue-400">({selectedInterests.length})</span>
            </label>

            {/* Search Input */}
            <div className="relative mb-2">
              <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 pointer-events-none">
                <Search className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={searchInput}
                onChange={(e) => {
                  setSearchInput(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                onKeyDown={handleKeyDown}
                placeholder="Search interests..."
                className="w-full pl-9 pr-3 py-2 bg-slate-700/50 border border-slate-600/50 rounded-lg text-white placeholder-slate-400 text-xs focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition-all duration-200"
              />
              {searchInput && (
                <button
                  onClick={() => {
                    setSearchInput("");
                    setShowSuggestions(false);
                  }}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-300 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}

              {/* Suggestions Dropdown - Positioned relative to input */}
              {showSuggestions && searchInput.trim() && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-slate-700/95 backdrop-blur border border-slate-600/50 rounded-lg shadow-xl z-50 max-h-48 overflow-y-auto w-full">
                  {sortedSuggestions.length > 0 ? (
                    <ul className="divide-y divide-slate-600/30">
                      {sortedSuggestions.map((tag) => {
                        const isSelected = selectedInterests.includes(tag);
                        return (
                          <li key={tag}>
                            <button
                              onClick={() => handleAddInterest(tag)}
                              className={`w-full text-left px-3 py-2 text-xs transition-all duration-200 ${
                                isSelected
                                  ? "bg-blue-600/40 text-blue-200 cursor-not-allowed opacity-70"
                                  : "text-slate-200 hover:bg-slate-600/50 active:bg-slate-500/50"
                              }`}
                              disabled={isSelected}
                            >
                              <div className="flex items-center gap-2">
                                {isSelected ? (
                                  <span className="text-xs text-blue-400">✓</span>
                                ) : null}
                                <span>{tag}</span>
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <div className="px-3 py-2 text-xs text-slate-400">
                      No matching interests found
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Selected Interest Tags */}
            {selectedInterests.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3 p-2 bg-slate-700/30 rounded-lg">
                {selectedInterests.map((tag) => (
                  <div
                    key={tag}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-full text-xs font-medium shadow-lg shadow-blue-500/30 animate-slideUp"
                  >
                    <span>{tag}</span>
                    <button
                      onClick={() => handleRemoveInterest(tag)}
                      className="text-blue-100 hover:text-white transition-colors active:scale-90"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Start Button */}
          <button
            onClick={handleStart}
            disabled={isLoading || selectedInterests.length === 0}
            className="w-full py-2 sm:py-2.5 bg-gradient-to-r from-blue-600 via-blue-500 to-purple-600 hover:from-blue-700 hover:via-blue-600 hover:to-purple-700 text-white font-semibold text-xs sm:text-sm rounded-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl hover:shadow-blue-500/30 active:scale-95 transform"
          >
            {isLoading ? "Connecting..." : selectedInterests.length > 0 ? "Find Match" : "Select Interests"}
          </button>

          <p className="text-center text-slate-400 text-xs mt-3">
            Matched based on shared interests
          </p>
        </div>
      </Card>
    </div>
  );
}
