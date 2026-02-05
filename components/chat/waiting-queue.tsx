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
}

export function WaitingQueue({
  position,
  totalWaiting,
  interests,
  onCancel,
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
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute top-0 left-0 w-40 h-40 bg-purple-500/5 rounded-full blur-2xl animate-pulse" style={{animationDelay: '0.5s'}}></div>
      </div>

      <Card className="relative w-full max-w-sm bg-slate-800/80 backdrop-blur-xl border border-slate-700/50 shadow-2xl rounded-2xl overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-transparent to-purple-500/10 pointer-events-none"></div>
        
        <div className="relative p-6 sm:p-8 text-center">
          {/* Animated spinner */}
          <div className="mb-6 flex justify-center">
            <div className="relative w-20 h-20">
              {/* Outer ring */}
              <div className="absolute inset-0 rounded-full border-2 border-slate-700/50"></div>
              {/* Animated ring */}
              <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-blue-500 border-r-purple-500 animate-spin"></div>
              {/* Pulsing center */}
              <div className="absolute inset-2 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 animate-pulse"></div>
              {/* Center icon */}
              <div className="absolute inset-0 flex items-center justify-center">
                <Clock className="w-8 h-8 text-blue-400" />
              </div>
            </div>
          </div>

          {/* Title */}
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">
            Finding Match
          </h2>
          <p className="text-slate-400 text-sm mb-6">
            Connecting you{dots}
          </p>

          {/* Queue Position */}
          <div className="mb-6 p-5 bg-gradient-to-br from-slate-700/50 to-slate-800/50 rounded-xl border border-slate-700/50 hover:border-slate-600/50 transition-colors">
            <p className="text-slate-400 text-xs uppercase tracking-wider font-semibold mb-2">Your Position</p>
            <div className="flex items-baseline justify-center gap-1.5">
              <span className="text-4xl sm:text-5xl font-bold text-transparent bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text">
                {animatedPosition}
              </span>
              <span className="text-slate-400 text-sm">of {totalWaiting}</span>
            </div>
            {/* Progress bar */}
            <div className="mt-4 h-1.5 bg-slate-700/50 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-500 ease-out"
                style={{width: `${(animatedPosition / Math.max(totalWaiting, 1)) * 100}%`}}
              ></div>
            </div>
          </div>

          {/* Interests */}
          <div className="mb-6">
            <p className="text-slate-400 text-xs uppercase tracking-wider font-semibold mb-3">Interests</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {interests.map((interest, idx) => (
                <span
                  key={interest}
                  className="px-3 py-1.5 bg-gradient-to-r from-blue-500/20 to-purple-500/20 text-blue-300 rounded-full text-xs font-semibold border border-blue-500/30 hover:border-blue-500/60 transition-colors animate-pulse"
                  style={{animationDelay: `${idx * 100}ms`}}
                >
                  {interest}
                </span>
              ))}
            </div>
          </div>

          <p className="text-slate-400 text-xs mb-6">
            We're finding someone who shares your interests
          </p>

          <button
            onClick={onCancel}
            className="w-full px-4 py-2.5 bg-slate-700/50 hover:bg-slate-700 text-slate-200 font-medium rounded-lg transition-all duration-200 text-sm border border-slate-600/50 active:scale-95 transform"
          >
            Cancel
          </button>
        </div>
      </Card>
    </div>
  );
}
