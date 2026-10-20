"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, UtensilsCrossed, BookOpen, Compass, TrendingUp, Plus, User, LogIn } from "lucide-react";
import { EatflixLogo } from "./EatflixLogo";
import { getSupabaseClient } from "@/lib/sync/supabase-client";

interface NavbarProps {
  onOpenAddModal: () => void;
}

export function Navbar({ onOpenAddModal }: NavbarProps) {
  const pathname = usePathname();
  const [isSignedIn, setIsSignedIn] = useState(true);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setIsSignedIn(Boolean(data.session?.user));
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setIsSignedIn(Boolean(session?.user));
    });
    return () => {
      sub?.subscription?.unsubscribe();
    };
  }, []);

  const openSignInPopup = () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("eatflix:open-auth-modal"));
    }
  };

  const navItems = [
    { href: "/", label: "Home", icon: Home },
    { href: "/food-log", label: "Episodes", icon: UtensilsCrossed },
    { href: "/discover", label: "Top Picks", icon: Compass },
    { href: "/my-foods", label: "My List", icon: BookOpen },
    { href: "/progress", label: "Stats", icon: TrendingUp },
  ];

  const isProfileActive = pathname === "/profile";

  return (
    <>
      {/* Mobile Top Brand Bar (Netflix iOS/Android App Style) */}
      <header className="md:hidden sticky top-0 z-40 bg-gradient-to-b from-black/95 via-black/90 to-black/75 backdrop-blur-xl border-b border-white/[0.08] px-4 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center">
          <EatflixLogo size="sm" showTagline />
        </Link>

        <div className="flex items-center gap-2">
          <button
            onClick={onOpenAddModal}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-[#E50914] hover:bg-[#f40612] text-white font-extrabold text-xs shadow-md shadow-[#E50914]/30 active:scale-95 transition-transform"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.75]" />
            <span>Log</span>
          </button>

          {!isSignedIn && (
            <button
              type="button"
              onClick={openSignInPopup}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white font-bold text-[11px] transition"
            >
              <LogIn className="w-3 h-3 text-[#E50914]" />
              <span>Sign In</span>
            </button>
          )}

          <Link
            href="/profile"
            aria-label="Profile & Settings"
            className={`w-8 h-8 rounded-md bg-gradient-to-br from-[#E50914] via-rose-600 to-amber-600 flex items-center justify-center text-white shadow-md transition-all ${
              isProfileActive ? "ring-2 ring-white scale-105" : "border border-white/20"
            }`}
          >
            <User className="w-4 h-4" />
          </Link>
        </div>
      </header>

      {/* Desktop Header Navigation */}
      <header className="hidden md:block sticky top-0 z-40 bg-gradient-to-b from-black/95 via-black/85 to-black/70 backdrop-blur-md border-b border-zinc-800/80">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center group">
              <EatflixLogo size="md" showTagline />
            </Link>

            <nav className="flex items-center gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`relative flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm transition-all ${
                      isActive
                        ? "text-white font-bold"
                        : "text-zinc-400 hover:text-zinc-100 font-medium"
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? "text-[#E50914]" : ""}`} />
                    {item.label}
                    {isActive && (
                      <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-[#E50914] rounded-full shadow-[0_0_8px_#E50914]" />
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onOpenAddModal}
              className="flex items-center gap-2 bg-[#E50914] hover:bg-[#f40612] text-white font-bold text-xs uppercase tracking-wider px-4 py-2.5 rounded-lg shadow-lg shadow-[#E50914]/30 transition-all transform active:scale-95"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Log Food</span>
            </button>

            {!isSignedIn && (
              <button
                type="button"
                onClick={openSignInPopup}
                className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white font-bold text-xs px-3.5 py-2.5 rounded-lg transition-all"
              >
                <LogIn className="w-3.5 h-3.5 text-[#E50914]" />
                <span>Sign In</span>
              </button>
            )}

            <Link
              href="/profile"
              className={`w-9 h-9 rounded-lg bg-gradient-to-br from-[#E50914] to-amber-600 flex items-center justify-center text-white shadow-md hover:ring-2 hover:ring-white/40 transition-all ${
                isProfileActive ? "ring-2 ring-white" : ""
              }`}
              title="Profile & Settings"
            >
              <User className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Mobile Sticky Bottom Navigation (Symmetrical 5-Tab Netflix App Dock) */}
      <nav
        aria-label="Mobile navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0c0c0e]/95 backdrop-blur-2xl border-t border-white/[0.08] pb-[max(0.35rem,env(safe-area-inset-bottom))]"
      >
        <div className="grid grid-cols-5 items-center max-w-md mx-auto px-1 pt-1.5 pb-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative flex flex-col items-center justify-center gap-1 py-1 rounded-xl transition-all active:scale-95 ${
                  isActive ? "text-white" : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {isActive && (
                  <span className="absolute -top-1.5 w-6 h-0.5 rounded-full bg-[#E50914] shadow-[0_0_8px_#E50914]" />
                )}
                <div
                  className={`p-1 rounded-lg transition-colors ${
                    isActive ? "bg-[#E50914]/15 text-[#E50914]" : ""
                  }`}
                >
                  <Icon className={`w-5 h-5 ${isActive ? "stroke-[2.4]" : "stroke-[1.8]"}`} />
                </div>
                <span
                  className={`text-[10px] leading-none whitespace-nowrap tracking-tight ${
                    isActive ? "font-extrabold text-white" : "font-medium text-zinc-400"
                  }`}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
