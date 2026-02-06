"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock } from "lucide-react";

interface WaitingQueueProps {
  position: number;
  totalWaiting: number;
  interests: string[];
  onCancel: () => void;
  isAutoSearching?: boolean;
  noUsersOnline?: boolean;
}

export function WaitingQueue({
  position,
  totalWaiting,
  interests,
  onCancel,
  isAutoSearching = false,
  noUsersOnline = false,
}: WaitingQueueProps) {
  const [animatedPosition, setAnimatedPosition] = useState(position);
  const [dots, setDots] = useState(".");

  useEffect(() => {
    setAnimatedPosition(position);
  }, [position]);

  useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => (prev.length < 3 ? prev + "." : "."));
    }, 500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-yellow-50 to-white flex items-center justify-center p-4 relative overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-orange-200/30 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute top-0 left-0 w-40 h-40 bg-yellow-200/30 rounded-full blur-2xl animate-pulse" style={{animationDelay: '0.5s'}}></div>
      </div>

      <Card className="relative w-full max-w-sm bg-white backdrop-blur-xl border border-orange-200 shadow-xl rounded-2xl overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-orange-100/20 via-transparent to-yellow-100/20 pointer-events-none"></div>
        
        <div className="relative p-6 sm:p-8 text-center">
          {/* Animated spinner */}
          {!noUsersOnline && (
            <div className="mb-6 flex justify-center">
              <div className="relative w-20 h-20">
                {/* Outer ring */}
                <div className="absolute inset-0 rounded-full border-2 border-orange-200"></div>
                {/* Animated ring */}
                <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-orange-500 border-r-yellow-500 animate-spin"></div>
                {/* Pulsing center */}
                <div className="absolute inset-2 rounded-full bg-gradient-to-br from-orange-300/20 to-yellow-300/20 animate-pulse"></div>
                {/* Center icon */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <Clock className="w-8 h-8 text-orange-500" />
                </div>
              </div>
            </div>
          )}

          {/* Title */}
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">
            {noUsersOnline ? "No Users Online" : isAutoSearching ? "Finding New Match" : "Finding Match"}
          </h2>
          <p className="text-gray-600 text-sm mb-6">
            {noUsersOnline 
              ? "Come back later to meet someone new" 
              : isAutoSearching ? "Searching for your next partner" : `Connecting you${dots}`}
          </p>

          {/* Queue Position */}
          {!isAutoSearching && (
            <div className="mb-6 p-5 bg-gradient-to-br from-orange-50 to-yellow-50 rounded-xl border border-orange-200 hover:border-orange-300 transition-colors">
              <p className="text-gray-600 text-xs uppercase tracking-wider font-semibold mb-2">Your Position</p>
              <div className="flex items-baseline justify-center gap-1.5">
                <span className="text-4xl sm:text-5xl font-bold text-transparent bg-gradient-to-r from-orange-500 to-yellow-500 bg-clip-text">
                  {animatedPosition}
                </span>
                <span className="text-gray-600 text-sm">of {totalWaiting}</span>
              </div>
              {/* Progress bar */}
              <div className="mt-4 h-1.5 bg-orange-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-orange-500 to-yellow-500 transition-all duration-500 ease-out"
                  style={{width: `${(animatedPosition / Math.max(totalWaiting, 1)) * 100}%`}}
                ></div>
              </div>
            </div>
          )}

          {/* Interests */}
          <div className="mb-6">
            <p className="text-gray-600 text-xs uppercase tracking-wider font-semibold mb-3">Interests</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {interests.map((interest, idx) => (
                <span
                  key={interest}
                  className="px-3 py-1.5 bg-gradient-to-r from-orange-200 to-yellow-200 text-orange-800 rounded-full text-xs font-semibold border border-orange-300 hover:border-orange-400 transition-colors animate-pulse"
                  style={{animationDelay: `${idx * 100}ms`}}
                >
                  {interest}
                </span>
              ))}
            </div>
          </div>

          <p className="text-gray-500 text-xs mb-6">
            {isAutoSearching 
              ? "Just a moment while we find your next match..." 
              : "Chat will start when a match is found"}
          </p>

          <button
            onClick={onCancel}
            className="w-full px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-medium rounded-lg transition-all duration-200 text-sm border border-orange-600 active:scale-95 transform"
          >
            {noUsersOnline ? "Go Back" : "Cancel"}
          </button>
        </div>
      </Card>
    </div>
  );
}
