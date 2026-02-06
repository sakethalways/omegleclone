"use client";

import Image from "next/image";
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
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);

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
    if (!showSuggestions || sortedSuggestions.length === 0) {
      if (e.key === "Enter" && searchInput.trim()) {
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < sortedSuggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case "Enter":
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < sortedSuggestions.length) {
          handleAddInterest(sortedSuggestions[highlightedIndex]);
          setHighlightedIndex(-1);
        }
        break;
      case "Escape":
        e.preventDefault();
        setShowSuggestions(false);
        setHighlightedIndex(-1);
        break;
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
    <div className="h-screen bg-gradient-to-br from-orange-50 via-yellow-50 to-white flex items-center justify-center p-3 sm:p-4 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-orange-200/30 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-yellow-200/30 rounded-full blur-3xl animate-pulse" style={{animationDelay: '0.7s'}}></div>
      </div>

      <Card className="relative w-full max-w-md bg-white border border-orange-200 shadow-xl hover:shadow-2xl transition-shadow duration-500 rounded-2xl overflow-visible">
        {/* Gradient border effect */}
        <div className="absolute inset-0 bg-gradient-to-r from-orange-100/20 via-transparent to-yellow-100/20 pointer-events-none"></div>
        
        <div className="relative px-4 sm:px-6 pt-0 pb-4 sm:pb-6 overflow-visible">
          {/* Header */}
          <div className="text-center mb-4 sm:mb-5">
            {/* Logo Image - Responsive */}
            <div className="mb-2 flex justify-center">
              <Image
                src="/1770376155517.png"
                alt="YouMingle Logo"
                width={96}
                height={96}
                className="w-20 h-20 sm:w-28 sm:h-28 object-contain"
              />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-orange-500 to-yellow-500 bg-clip-text text-transparent mb-2">
              YouMingle
            </h1>
            <p className="text-gray-600 text-xs sm:text-sm">
              Share interests, meet amazing people
            </p>
          </div>

          {/* Name Input */}
          <div className="mb-4">
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              Your Name
            </label>
            <input
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="Anonymous"
              className="w-full px-3 py-1.5 sm:py-2 bg-white border border-orange-200 rounded-lg text-gray-800 placeholder-gray-400 text-xs sm:text-sm focus:outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400 transition-all duration-200 hover:border-orange-300"
            />
          </div>

          {/* Interests Dropdown */}
          <div className="mb-4 relative z-20">
            <label className="block text-xs font-semibold text-gray-700 mb-2">
              Pick Interests <span className="text-orange-500">({selectedInterests.length})</span>
            </label>

            {/* Search Input */}
            <div className="relative mb-2">
              <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-orange-400 pointer-events-none">
                <Search className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={searchInput}
                onChange={(e) => {
                  setSearchInput(e.target.value);
                  setShowSuggestions(true);
                  setHighlightedIndex(-1);
                }}
                onFocus={() => setShowSuggestions(true)}
                onKeyDown={handleKeyDown}
                placeholder="Search interests..."
                className="w-full pl-9 pr-3 py-2 bg-white border border-orange-200 rounded-lg text-gray-800 placeholder-gray-400 text-xs focus:outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400 transition-all duration-200"
              />
              {searchInput && (
                <button
                  onClick={() => {
                    setSearchInput("");
                    setShowSuggestions(false);
                  }}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}

              {/* Suggestions Dropdown - Positioned relative to input */}
              {showSuggestions && searchInput.trim() && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white backdrop-blur border border-orange-200 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto w-full">
                  {sortedSuggestions.length > 0 ? (
                    <ul className="divide-y divide-orange-100">
                      {sortedSuggestions.map((tag, index) => {
                        const isSelected = selectedInterests.includes(tag);
                        const isHighlighted = highlightedIndex === index;
                        return (
                          <li key={tag}>
                            <button
                              onClick={() => handleAddInterest(tag)}
                              className={`w-full text-left px-3 py-2 text-xs transition-all duration-200 ${
                                isHighlighted
                                  ? "bg-orange-200 text-orange-900"
                                  : isSelected
                                  ? "bg-yellow-100 text-yellow-800 cursor-not-allowed opacity-70"
                                  : "text-gray-700 hover:bg-orange-50 active:bg-orange-100"
                              }`}
                              disabled={isSelected}
                              onMouseEnter={() => setHighlightedIndex(index)}
                              onMouseLeave={() => setHighlightedIndex(-1)}
                            >
                              <div className="flex items-center gap-2">
                                {isSelected ? (
                                  <span className="text-xs text-orange-600">✓</span>
                                ) : null}
                                <span>{tag}</span>
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <div className="px-3 py-2 text-xs text-gray-500">
                      No matching interests found
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Selected Interest Tags */}
            {selectedInterests.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3 p-2 bg-orange-50 rounded-lg">
                {selectedInterests.map((tag) => (
                  <div
                    key={tag}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gradient-to-r from-orange-500 to-yellow-500 text-white rounded-full text-xs font-medium shadow-lg shadow-orange-500/30 animate-slideUp"
                  >
                    <span>{tag}</span>
                    <button
                      onClick={() => handleRemoveInterest(tag)}
                      className="text-white hover:text-orange-100 transition-colors active:scale-90"
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
            className="w-full py-2 sm:py-2.5 bg-gradient-to-r from-orange-500 via-orange-400 to-yellow-500 hover:from-orange-600 hover:via-orange-500 hover:to-yellow-600 text-white font-semibold text-xs sm:text-sm rounded-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl hover:shadow-orange-500/30 active:scale-95 transform"
          >
            {isLoading ? "Connecting..." : selectedInterests.length > 0 ? "Find Match" : "Select Interests"}
          </button>

          <p className="text-center text-gray-500 text-xs mt-3">
            Matched based on shared interests
          </p>
        </div>
      </Card>
    </div>
  );
}
