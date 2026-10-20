"use client";

import { useEffect, useState } from "react";
import { X, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { getSupabaseClient, getSupabaseConfig } from "@/lib/sync/supabase-client";
import { syncNow } from "@/lib/sync/sync-engine";
import { EatflixLogo } from "@/components/navigation/EatflixLogo";

export function AuthWelcomeModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    let mounted = true;

    const checkSession = async () => {
      if (typeof window === "undefined") return;

      // Do not show popup while returning from an OAuth redirect
      if (
        window.location.hash.includes("access_token") ||
        window.location.search.includes("code=") ||
        window.localStorage.getItem("eatflix_oauth_pending") === "true"
      ) {
        return;
      }

      const dismissed = window.sessionStorage.getItem("eatflix_auth_prompt_dismissed") === "1";
      const supabase = getSupabaseClient();
      if (!supabase) return;

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) return;
      if (!session?.user && !dismissed) {
        setIsOpen(true);
      }
    };

    const timer = setTimeout(checkSession, 300);

    const supabase = getSupabaseClient();
    const { data: authSub } = supabase
      ? supabase.auth.onAuthStateChange((event, session) => {
          if (session?.user) {
            setIsOpen(false);
          }
        })
      : { data: { subscription: null } };

    const onOpenModalEvent = () => {
      setStatusMsg(null);
      setIsOpen(true);
    };
    window.addEventListener("eatflix:open-auth-modal", onOpenModalEvent);

    return () => {
      mounted = false;
      clearTimeout(timer);
      authSub?.subscription?.unsubscribe();
      window.removeEventListener("eatflix:open-auth-modal", onOpenModalEvent);
    };
  }, []);

  const handleDismiss = () => {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("eatflix_auth_prompt_dismissed", "1");
    }
    setIsOpen(false);
  };

  const handleGoogleSignIn = async () => {
    setStatusMsg(null);
    const supabase = getSupabaseClient();
    const cfg = getSupabaseConfig();
    if (!supabase || !cfg.url || !cfg.anonKey) return;

    setLoading(true);
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem("eatflix_oauth_pending", "true");
      }
      const redirectTo =
        typeof window !== "undefined" ? `${window.location.origin}${window.location.pathname}` : undefined;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });
      if (error) throw error;
    } catch (err: any) {
      setStatusMsg({ type: "err", text: err?.message || "Google sign-in failed." });
      setLoading(false);
    }
  };

  const handleEmailAuth = async (isSignUp: boolean) => {
    setStatusMsg(null);
    const supabase = getSupabaseClient();
    if (!supabase) return;

    if (!email.trim() || password.length < 6) {
      setStatusMsg({ type: "err", text: "Enter your email and a password of at least 6 characters." });
      return;
    }

    setLoading(true);
    try {
      if (isSignUp) {
        const redirectTo =
          typeof window !== "undefined" ? `${window.location.origin}${window.location.pathname}` : undefined;
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: redirectTo },
        });
        if (error) throw error;
        if (data.session?.user) {
          await syncNow().catch(() => {});
          setIsOpen(false);
          window.location.href = "/profile";
        } else {
          setStatusMsg({
            type: "ok",
            text: "Account created! Check your email inbox to confirm, or sign in with Google above.",
          });
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        if (data.user) {
          await syncNow().catch(() => {});
          setIsOpen(false);
          window.location.reload();
        }
      }
    } catch (err: any) {
      setStatusMsg({ type: "err", text: err?.message || "Sign-in failed." });
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Sign in to EATflix"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md animate-fadeIn"
    >
      <div className="relative w-full max-w-md bg-[#141417] border-t sm:border border-zinc-800 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden p-6 space-y-5">
        {/* Top Crimson Glow Bar */}
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-[#E50914] via-rose-500 to-[#E50914]" />

        <div className="flex items-start justify-between gap-3">
          <div>
            <EatflixLogo size="md" showTagline />
            <h2 className="text-xl font-black text-white mt-3 tracking-tight">
              Sign In to Your Account
            </h2>
            <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
              Sign in to sync your profile, custom foods, combos, and daily nutrition episodes across your phone and laptop.
            </p>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Close sign in popup"
            className="p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Google Sign-In Button */}
        <button
          type="button"
          disabled={loading}
          onClick={handleGoogleSignIn}
          className="w-full flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl bg-white hover:bg-zinc-100 disabled:opacity-50 text-black font-extrabold text-xs sm:text-sm shadow-lg transition active:scale-95"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin text-black" />
          ) : (
            <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
          )}
          <span>Continue with Google</span>
        </button>

        <div className="flex items-center gap-2 text-[11px] text-zinc-500">
          <div className="flex-1 h-px bg-zinc-800" />
          <span>or use email &amp; password</span>
          <div className="flex-1 h-px bg-zinc-800" />
        </div>

        {/* Email & Password Form */}
        <div className="space-y-2.5 text-xs">
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-white text-xs focus:outline-none focus:border-[#E50914]"
          />
          <input
            type="password"
            placeholder="Password (min 6 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-white text-xs focus:outline-none focus:border-[#E50914]"
          />

          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              disabled={loading}
              onClick={() => handleEmailAuth(false)}
              className="py-2.5 px-3 rounded-xl bg-[#E50914] hover:bg-[#f40612] disabled:opacity-50 text-white font-extrabold text-xs shadow-md shadow-[#E50914]/25 transition active:scale-95"
            >
              Sign In
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => handleEmailAuth(true)}
              className="py-2.5 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 disabled:opacity-50 text-white font-semibold text-xs transition active:scale-95"
            >
              Create Account
            </button>
          </div>
        </div>

        {statusMsg && (
          <div
            role={statusMsg.type === "err" ? "alert" : "status"}
            className={`px-3 py-2 rounded-xl border text-xs ${
              statusMsg.type === "ok"
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                : "bg-rose-500/10 border-rose-500/30 text-rose-300"
            }`}
          >
            {statusMsg.text}
          </div>
        )}

        {/* New User Guided Onboarding + Guest Option */}
        <div className="pt-2 border-t border-zinc-800/80 space-y-2">
          <button
            type="button"
            onClick={() => {
              handleDismiss();
              if (typeof window !== "undefined") {
                window.location.href = "/profile";
              }
            }}
            className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-[#E50914]/20 to-amber-500/15 hover:from-[#E50914]/30 border border-[#E50914]/40 text-xs font-extrabold text-white flex items-center justify-center gap-1.5 transition"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#E50914]" />
            <span>New here? Start Guided Goal &amp; Profile Setup →</span>
          </button>

          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-zinc-500 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-[#46d369]" />
              Works offline on your device
            </span>
            <button
              type="button"
              onClick={handleDismiss}
              className="text-xs font-semibold text-zinc-300 hover:text-white underline"
            >
              Continue as Guest →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
