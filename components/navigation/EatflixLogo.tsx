"use client";

import React from "react";

interface EatflixLogoProps {
  size?: "sm" | "md" | "lg";
  showTagline?: boolean;
}

/**
 * Custom 3D Netflix-Ribbon "E" Emblem with a subtle Nutrition Fork / Leaf accent.
 * Styled after the iconic folded crimson Netflix "N" mobile app icon.
 */
export function EatflixMark({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        {/* Background glossy dark cinema tile */}
        <linearGradient id="efx-bg" x1="0" y1="0" x2="120" y2="120" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#18181c" />
          <stop offset="55%" stopColor="#0b0b0e" />
          <stop offset="100%" stopColor="#050507" />
        </linearGradient>

        {/* Subtle crimson ambient glow */}
        <radialGradient id="efx-glow" cx="50%" cy="18%" r="70%">
          <stop offset="0%" stopColor="#E50914" stopOpacity="0.32" />
          <stop offset="100%" stopColor="#E50914" stopOpacity="0" />
        </radialGradient>

        {/* Left vertical spine (darker crimson like Netflix N back-leg) */}
        <linearGradient id="efx-spine" x1="28" y1="18" x2="48" y2="104" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#99050d" />
          <stop offset="50%" stopColor="#b80710" />
          <stop offset="100%" stopColor="#7a0309" />
        </linearGradient>

        {/* Bright 3D foreground ribbon (Netflix signature #E50914) */}
        <linearGradient id="efx-ribbon" x1="28" y1="18" x2="96" y2="96" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ff2a36" />
          <stop offset="45%" stopColor="#E50914" />
          <stop offset="100%" stopColor="#b80710" />
        </linearGradient>

        {/* Nutrition Emerald/Gold vitality leaf spark */}
        <linearGradient id="efx-leaf" x1="78" y1="48" x2="98" y2="68" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#46d369" />
          <stop offset="100%" stopColor="#10b981" />
        </linearGradient>

        {/* Drop shadow for ribbon fold */}
        <filter id="efx-shadow" x="-15%" y="-15%" width="135%" height="135%">
          <feDropShadow dx="2" dy="4" stdDeviation="3.5" floodColor="#000000" floodOpacity="0.78" />
        </filter>
      </defs>

      {/* Squircle App Tile */}
      <rect x="2" y="2" width="116" height="116" rx="28" fill="url(#efx-bg)" stroke="rgba(255,255,255,0.12)" strokeWidth="2" />
      <rect x="2" y="2" width="116" height="116" rx="28" fill="url(#efx-glow)" />

      {/* Left Vertical Spine of the "E" */}
      <path
        d="M30 22C30 19.7909 31.7909 18 34 18H48V103C43 101.5 35 101.5 30 103V22Z"
        fill="url(#efx-spine)"
      />

      {/* Cast shadow where ribbons fold over the spine */}
      <path d="M30 18H52L48 42H30V18Z" fill="#000000" fillOpacity="0.45" />
      <path d="M30 50H52L48 70H30V50Z" fill="#000000" fillOpacity="0.45" />
      <path d="M30 80H52L48 103H30V80Z" fill="#000000" fillOpacity="0.45" />

      {/* Top Folded Ribbon of the "E" (angled upward with cinema perspective) */}
      <path
        d="M30 18H90C92.2091 18 94 19.7909 94 22V33C94 35.2091 92.2091 37 90 37H30V18Z"
        fill="url(#efx-ribbon)"
        filter="url(#efx-shadow)"
      />

      {/* Middle Ribbon of the "E" — stylized as a sleek Fork / Macro Bar */}
      <path
        d="M30 51H78C80.2091 51 82 52.7909 82 55V65C82 67.2091 80.2091 69 78 69H30V51Z"
        fill="url(#efx-ribbon)"
        filter="url(#efx-shadow)"
      />
      {/* Subtle Fork Tine Cutouts on Middle Bar for Nutri-Tracker Identity */}
      <rect x="66" y="54" width="11" height="2.4" rx="1.2" fill="#0b0b0e" />
      <rect x="66" y="58.8" width="11" height="2.4" rx="1.2" fill="#0b0b0e" />
      <rect x="66" y="63.6" width="11" height="2.4" rx="1.2" fill="#0b0b0e" />

      {/* Bottom Folded Ribbon of the "E" with Netflix Cinema Arc Curve */}
      <path
        d="M30 83H90C92.2091 83 94 84.7909 94 87V99C94 101.209 91.8 102.8 89.6 102.3C70 98.5 50 98.5 30 103V83Z"
        fill="url(#efx-ribbon)"
        filter="url(#efx-shadow)"
      />

      {/* Signature Vitality Leaf / Macro Spark Badge at right of middle bar */}
      <path
        d="M86 59C86 52.5 92.5 48 98 48C98 54.5 93.5 61 86 59Z"
        fill="url(#efx-leaf)"
      />
      <circle cx="88.5" cy="63.5" r="2.2" fill="#46d369" />
    </svg>
  );
}

/**
 * Full EATflix Brand Lockup: 3D Ribbon "E" Mark + Cinema Wordmark.
 */
export function EatflixLogo({ size = "md", showTagline = false }: EatflixLogoProps) {
  const iconCls =
    size === "sm" ? "w-8 h-8" : size === "lg" ? "w-11 h-11" : "w-9 h-9";
  const textCls =
    size === "sm"
      ? "text-lg tracking-[0.14em]"
      : size === "lg"
      ? "text-2xl tracking-[0.16em]"
      : "text-xl tracking-[0.15em]";

  return (
    <div className="flex items-center gap-2.5 select-none group">
      <div className="relative flex-shrink-0 transition-transform duration-200 group-hover:scale-105">
        <EatflixMark className={`${iconCls} drop-shadow-[0_2px_10px_rgba(229,9,20,0.45)]`} />
      </div>
      <div className="flex flex-col leading-none">
        <div className="flex items-baseline">
          <span
            className={`font-black uppercase text-[#E50914] ${textCls}`}
            style={{ textShadow: "0 2px 12px rgba(229, 9, 20, 0.45)" }}
          >
            EAT
          </span>
          <span className={`font-black uppercase text-white ${textCls}`}>
            FLIX
          </span>
          <span className="ml-1 w-1.5 h-1.5 rounded-full bg-[#46d369] shadow-[0_0_6px_#46d369]" />
        </div>
        {showTagline && (
          <span className="text-[8px] font-bold uppercase tracking-[0.26em] text-zinc-400 mt-0.5">
            NUTRITION STREAMING
          </span>
        )}
      </div>
    </div>
  );
}
