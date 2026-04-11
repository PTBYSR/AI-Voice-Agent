"use client";

import React, { useEffect, useState } from "react";

interface SideDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

export function SideDrawer({ isOpen, onClose, title, subtitle, children }: SideDrawerProps) {
  const [animState, setAnimState] = useState<"hidden" | "entering" | "visible" | "exiting">("hidden");

  useEffect(() => {
    if (isOpen) {
      if (animState === "hidden" || animState === "exiting") {
        setAnimState("entering");
        requestAnimationFrame(() => {
          requestAnimationFrame(() => setAnimState("visible"));
        });
      }
    } else {
      if (animState === "visible" || animState === "entering") {
        setAnimState("exiting");
      }
    }
  }, [isOpen]);

  useEffect(() => {
    if (animState === "exiting") {
      const timer = setTimeout(() => {
        setAnimState("hidden");
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [animState]);

  if (animState === "hidden") return null;

  const showBg = animState === "visible" ? "bg-black/30 backdrop-blur-sm" : "bg-transparent";
  const translate = animState === "visible" ? "translate-x-0" : "translate-x-full";

  return (
    <div className={`fixed inset-0 z-50 transition-all duration-300 ${showBg}`} onClick={onClose}>
      <div 
        className={`absolute right-0 top-0 bottom-0 w-full max-w-lg bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-out ${translate}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E5EA]">
          <div>
            <h2 className="text-lg font-semibold text-[#0A2540]">{title}</h2>
            {subtitle && <p className="text-xs text-[#4F5B66]">{subtitle}</p>}
          </div>
          <button 
            onClick={onClose}
            className="text-[#94a3b8] hover:text-[#0A2540] transition-colors p-2 rounded-full hover:bg-gray-100"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-[#F7F8FA]">
          {children}
        </div>
      </div>
    </div>
  );
}
