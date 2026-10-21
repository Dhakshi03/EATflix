"use client";

import { useEffect, useState } from "react";
import {
  getSupabaseClient,
  getSupabaseConfig,
  saveSupabaseConfigToLocal,
  SUPABASE_SETUP_SQL,
} from "@/lib/sync/supabase-client";
import { getLastSyncTime, signOutAndClearLocalData, syncNow } from "@/lib/sync/sync-engine";
import { getUserProfile } from "@/lib/storage/indexed-db";
import { Cloud, RefreshCw, LogOut, Copy, Check, Settings, KeyRound, Mail } from "lucide-react";

interface CloudSyncCardProps {
  onDataUpdated?: () => void;
}

export function CloudSyncCard({ onDataUpdated }: CloudSyncCardProps) {
  const [configSource, setConfigSource] = useState<"env" | "local" | "none">("none");
  const [urlInput, setUrlInput] = useState("");
  const [anonKeyInput, setAnonKeyInput] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showSql, setShowSql] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<"password" | "otp">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");

  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const refreshState = async () => {
    const cfg = getSupabaseConfig();
    setConfigSource(cfg.source);
    setUrlInput(cfg.url);
    setAnonKeyInput(cfg.anonKey);

    const last = await getLastSyncTime();
    setLastSync(last);

    const supabase = getSupabaseClient();
    if (!supabase) {
      setUserEmail(null);
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();
    setUserEmail(session?.user?.email ?? null);
  };

  useEffect(() => {
    refreshState();

    const supabase = getSupabaseClient();
    const { data: authSub } = supabase
      ? supabase.auth.onAuthStateChange((event, session) => {
          setUserEmail(session?.user?.email ?? null);
          if (event === "SIGNED_IN" && session?.user) {
            triggerSync();
          }
        })
      : { data: { subscription: null } };

    const onSyncComplete = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.syncedAt) setLastSync(detail.syncedAt);
      if (detail?.downloaded > 0 && onDataUpdated) {
        onDataUpdated();
      }
    };

    window.addEventListener("nutritrack:sync-complete", onSyncComplete);
    return () => {
      authSub?.subscription?.unsubscribe();
      window.removeEventListener("nutritrack:sync-complete", onSyncComplete);
    };
  }, []);

  const handleSaveConfig = async () => {
    if (!urlInput.trim().startsWith("https://") || !anonKeyInput.trim()) {
      setStatusMsg({
        type: "err",
        text: "Please enter both your Supabase Project URL (https://xxxx.supabase.co) and anon public key.",
      });
      return;
    }
    saveSupabaseConfigToLocal(urlInput, anonKeyInput);
    setShowSettings(false);
    setStatusMsg({ type: "ok", text: "Supabase connection saved on this device." });
    await refreshState();
  };

  const handleClearConfig = async () => {
    saveSupabaseConfigToLocal("", "");
    setUrlInput("");
    setAnonKeyInput("");
    setUserEmail(null);
    setConfigSource("none");
    setStatusMsg({ type: "ok", text: "Cleared custom Supabase settings from this device." });
  };

  const triggerSync = async () => {
    setSyncing(true);
    setStatusMsg(null);
    try {
      const res = await syncNow();
      setLastSync(res.syncedAt);
      setStatusMsg({
        type: "ok",
        text: `Synced successfully! (${res.uploaded} uploaded, ${res.downloaded} downloaded).`,
      });
      if (onDataUpdated) {
        onDataUpdated();
      }
    } catch (err: any) {
      setStatusMsg({ type: "err", text: err?.message || "Sync failed." });
    } finally {
      setSyncing(false);
    }
  };

  const handlePasswordAuth = async (isSignUp: boolean) => {
    setStatusMsg(null);
    const supabase = getSupabaseClient();
    if (!supabase) return;

    if (!email.trim() || password.length < 6) {
      setStatusMsg({ type: "err", text: "Enter your email and a password of at least 6 characters." });
      return;
    }

    setSyncing(true);
    try {
      if (isSignUp) {
        const redirectTo =
          typeof window !== "undefined" ? `${window.location.origin}/profile` : undefined;
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: redirectTo },
        });
        if (error) throw error;
        if (data.session?.user) {
          setUserEmail(data.session.user.email ?? email.trim());
          await triggerSync();
        } else {
          try {
            const p = await getUserProfile();
            if (p?.displayName) {
              window.localStorage.setItem("eatflix_pending_profile_sync", JSON.stringify(p));
            }
          } catch {}
          setStatusMsg({
            type: "ok",
            text: "Account created! Check your email inbox to confirm, then sign in with your email to sync your profile.",
          });
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        if (data.user) {
          setUserEmail(data.user.email ?? email.trim());
          await triggerSync();
          if (onDataUpdated) {
            onDataUpdated();
          }
        }
      }
    } catch (err: any) {
      setStatusMsg({ type: "err", text: err?.message || "Authentication failed." });
    } finally {
      setSyncing(false);
    }
  };

  const handleSendOtp = async () => {
    setStatusMsg(null);
    const supabase = getSupabaseClient();
    if (!supabase) return;
    if (!email.trim()) {
      setStatusMsg({ type: "err", text: "Please enter your email address." });
      return;
    }
    setSyncing(true);
    try {
      try {
        const p = await getUserProfile();
        if (p?.displayName) {
          window.localStorage.setItem("eatflix_pending_profile_sync", JSON.stringify(p));
        }
      } catch {}
      const redirectTo =
        typeof window !== "undefined" ? `${window.location.origin}/profile` : undefined;
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          shouldCreateUser: true,
          emailRedirectTo: redirectTo,
        },
      });
      if (error) throw error;
      setOtpSent(true);
      setStatusMsg({
        type: "ok",
        text: "Email sent! Click the Sign-In Link in your email (or enter the 6-digit code if configured in Supabase).",
      });
    } catch (err: any) {
      setStatusMsg({ type: "err", text: err?.message || "Could not send email." });
    } finally {
      setSyncing(false);
    }
  };

  const handleVerifyOtp = async () => {
    setStatusMsg(null);
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const raw = otpCode.trim();
    if (!raw) {
      setStatusMsg({ type: "err", text: "Paste the 6-digit code or the Sign-In Link URL from your email." });
      return;
    }
    setSyncing(true);
    try {
      let data: any = null;
      let error: any = null;

      // Support pasting the full Supabase Magic Link URL directly (great for installed phone PWAs!)
      if (raw.startsWith("http://") || raw.startsWith("https://")) {
        const parsedUrl = new URL(raw);
        const tokenHash = parsedUrl.searchParams.get("token_hash") || parsedUrl.searchParams.get("token");
        const linkType = (parsedUrl.searchParams.get("type") || "magiclink") as
          | "magiclink"
          | "signup"
          | "email";
        if (tokenHash) {
          const res = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: linkType,
          });
          data = res.data;
          error = res.error;
        } else {
          window.location.href = raw;
          return;
        }
      } else {
        const res = await supabase.auth.verifyOtp({
          email: email.trim(),
          token: raw,
          type: "email",
        });
        data = res.data;
        error = res.error;
      }

      if (error) throw error;
      if (data?.user) {
        setUserEmail(data.user.email ?? email.trim());
        setOtpSent(false);
        setOtpCode("");
        await triggerSync();
      }
    } catch (err: any) {
      setStatusMsg({ type: "err", text: err?.message || "Invalid or expired code/link." });
    } finally {
      setSyncing(false);
    }
  };

  const [googleSetupNeeded, setGoogleSetupNeeded] = useState(false);
  const [copiedCallback, setCopiedCallback] = useState(false);

  const handleGoogleSignIn = async () => {
    setStatusMsg(null);
    const supabase = getSupabaseClient();
    const cfg = getSupabaseConfig();
    if (!supabase || !cfg.url || !cfg.anonKey) return;
    setSyncing(true);
    try {
      // Check if Google provider is enabled in Supabase before redirecting away
      const settingsRes = await fetch(`${cfg.url}/auth/v1/settings`, {
        headers: { apikey: cfg.anonKey },
      });
      if (settingsRes.ok) {
        const settings = await settingsRes.json();
        if (!settings?.external?.google) {
          setGoogleSetupNeeded(true);
          setStatusMsg({
            type: "err",
            text: "Google Sign-In is still turned OFF in your Supabase dashboard. Follow the 3 quick steps below to enable it, or use Email & Password below right now.",
          });
          setSyncing(false);
          return;
        }
      }

      if (typeof window !== "undefined") {
        window.localStorage.setItem("eatflix_oauth_pending", "true");
        window.localStorage.setItem("eatflix_profile_step", "2");
        try {
          const p = await getUserProfile();
          if (p?.displayName) {
            window.localStorage.setItem("eatflix_pending_profile_sync", JSON.stringify(p));
          }
        } catch {}
      }
      const redirectTo =
        typeof window !== "undefined" ? `${window.location.origin}/profile?step=2` : undefined;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          queryParams: {
            prompt: "select_account",
            access_type: "offline",
          },
        },
      });
      if (error) throw error;
    } catch (err: any) {
      setStatusMsg({ type: "err", text: err?.message || "Google sign-in failed." });
      setSyncing(false);
    }
  };

  const handleSignOut = async () => {
    await signOutAndClearLocalData();
    setUserEmail(null);
    setStatusMsg({
      type: "ok",
      text: "Signed out and cleared personal profile from this screen. Sign back in anytime to restore your data.",
    });
    if (onDataUpdated) {
      onDataUpdated();
    }
  };

  const copySql = async () => {
    await navigator.clipboard.writeText(SUPABASE_SETUP_SQL);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  const inputCls =
    "w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-brand-500";

  return (
    <section className="space-y-3 p-4 rounded-2xl glass-card border border-gray-800">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cloud className="w-4 h-4 text-brand-400" />
          <h2 className="text-sm font-bold text-white">Cloud Sync (iPhone &amp; Laptop)</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowSql((v) => !v)}
            className="text-[11px] text-gray-400 hover:text-white underline"
          >
            {showSql ? "Hide SQL" : "SQL Setup"}
          </button>
          {configSource !== "none" && (
            <button
              type="button"
              onClick={() => setShowSettings((v) => !v)}
              className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-white"
            >
              <Settings className="w-3.5 h-3.5" />
              Project keys
            </button>
          )}
        </div>
      </div>

      <p className="text-xs text-gray-400">
        Keep your foods, combinations, daily logs, and goals in sync across your iPhone and laptop. The app continues
        to work offline first.
      </p>

      {showSql && (
        <div className="p-3 rounded-xl bg-gray-900/90 border border-gray-700 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-gray-300 font-medium">
              Run once in Supabase Dashboard → SQL Editor:
            </span>
            <button
              type="button"
              onClick={copySql}
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-[11px] text-brand-400"
            >
              {copiedSql ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedSql ? "Copied" : "Copy SQL"}
            </button>
          </div>
          <pre className="text-[10px] text-gray-300 overflow-x-auto p-2 rounded-lg bg-black/50 leading-relaxed">
            {SUPABASE_SETUP_SQL}
          </pre>
        </div>
      )}

      {(configSource === "none" || showSettings) && (
        <div className="space-y-3 p-3 rounded-xl bg-gray-900/60 border border-gray-800">
          <p className="text-xs text-gray-300 font-medium">
            Connect your free Supabase project (Project Settings → API):
          </p>
          <div className="space-y-2 text-xs text-gray-400">
            <label className="block">
              Project URL
              <input
                className={`${inputCls} mt-1`}
                placeholder="https://xxxx.supabase.co"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
              />
            </label>
            <label className="block">
              Anon public key
              <input
                className={`${inputCls} mt-1`}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                value={anonKeyInput}
                onChange={(e) => setAnonKeyInput(e.target.value)}
              />
            </label>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSaveConfig}
              className="px-3 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold"
            >
              Save Supabase keys
            </button>
            {configSource === "local" && (
              <button
                type="button"
                onClick={handleClearConfig}
                className="px-3 py-2 rounded-xl bg-gray-800 border border-gray-700 text-gray-300 text-xs"
              >
                Clear keys
              </button>
            )}
          </div>
        </div>
      )}

      {configSource !== "none" && userEmail && (
        <div className="space-y-3 pt-1">
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <div className="text-xs">
              <div className="text-emerald-300 font-semibold">Signed in as {userEmail}</div>
              <div className="text-gray-400 text-[11px] mt-0.5">
                {lastSync ? `Last synced: ${new Date(lastSync).toLocaleString()}` : "Not synced yet on this device"}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={syncing}
                onClick={triggerSync}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-xs font-semibold"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
                {syncing ? "Syncing…" : "Sync now"}
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                className="flex items-center gap-1 px-2.5 py-2 rounded-xl bg-gray-800 border border-gray-700 text-gray-300 hover:text-white text-xs"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      {configSource !== "none" && !userEmail && (
        <div className="space-y-3 pt-1">
          <button
            type="button"
            disabled={syncing}
            onClick={handleGoogleSignIn}
            className="w-full flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-xl bg-white hover:bg-gray-100 disabled:opacity-50 text-gray-900 font-semibold text-xs shadow-sm transition"
          >
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
            Continue with Google
          </button>

          {googleSetupNeeded && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-100 space-y-2">
              <div className="font-semibold text-amber-300">
                One-time setup to enable Google Sign-In in your Supabase project:
              </div>
              <ol className="list-decimal list-inside space-y-1.5 text-[11px] text-gray-200">
                <li>
                  Open{" "}
                  <a
                    href="https://console.cloud.google.com/apis/credentials"
                    target="_blank"
                    rel="noreferrer"
                    className="text-brand-400 underline font-medium"
                  >
                    Google Cloud Console → Credentials
                  </a>{" "}
                  → <b>+ Create Credentials → OAuth client ID</b> (Web application).
                </li>
                <li>
                  Paste this <b>Authorized redirect URI</b> into Google Cloud:
                  <div className="mt-1 flex items-center gap-2 bg-black/50 px-2.5 py-1.5 rounded-lg border border-gray-700">
                    <code className="text-[10px] text-emerald-300 break-all flex-1">
                      {(urlInput || "https://gtzflyuqidygrgjbgmat.supabase.co").replace(/\/+$/, "")}/auth/v1/callback
                    </code>
                    <button
                      type="button"
                      onClick={async () => {
                        const cb = `${(urlInput || "https://gtzflyuqidygrgjbgmat.supabase.co").replace(/\/+$/, "")}/auth/v1/callback`;
                        await navigator.clipboard.writeText(cb);
                        setCopiedCallback(true);
                        setTimeout(() => setCopiedCallback(false), 2000);
                      }}
                      className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-[10px] text-brand-400 flex items-center gap-1"
                    >
                      {copiedCallback ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {copiedCallback ? "Copied" : "Copy"}
                    </button>
                  </div>
                </li>
                <li>
                  Copy the resulting <b>Client ID</b> &amp; <b>Client Secret</b>, open{" "}
                  <a
                    href="https://supabase.com/dashboard/project/gtzflyuqidygrgjbgmat/auth/providers?provider=Google"
                    target="_blank"
                    rel="noreferrer"
                    className="text-brand-400 underline font-medium"
                  >
                    Supabase → Auth → Providers → Google
                  </a>
                  , toggle <b>Enable Sign in with Google</b> ON, paste them, and click <b>Save</b>.
                </li>
              </ol>
            </div>
          )}

          <div className="flex items-center gap-2 text-[11px] text-gray-500">
            <div className="flex-1 h-px bg-gray-800" />
            <span>or sign in with email</span>
            <div className="flex-1 h-px bg-gray-800" />
          </div>

          <div className="flex gap-2 text-xs">
            <button
              type="button"
              onClick={() => setAuthMode("password")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border ${
                authMode === "password"
                  ? "bg-brand-500/20 border-brand-500 text-brand-300 font-semibold"
                  : "bg-gray-800 border-gray-700 text-gray-400"
              }`}
            >
              <KeyRound className="w-3.5 h-3.5" /> Email &amp; Password
            </button>
            <button
              type="button"
              onClick={() => setAuthMode("otp")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border ${
                authMode === "otp"
                  ? "bg-brand-500/20 border-brand-500 text-brand-300 font-semibold"
                  : "bg-gray-800 border-gray-700 text-gray-400"
              }`}
            >
              <Mail className="w-3.5 h-3.5" /> Email Magic Link / OTP Code
            </button>
          </div>

          {authMode === "password" ? (
            <div className="space-y-2 text-xs text-gray-400">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label>
                  Email
                  <input
                    type="email"
                    className={`${inputCls} mt-1`}
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>
                <label>
                  Password
                  <input
                    type="password"
                    className={`${inputCls} mt-1`}
                    placeholder="At least 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  disabled={syncing}
                  onClick={() => handlePasswordAuth(false)}
                  className="px-3.5 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-xs font-semibold"
                >
                  {syncing ? "Signing in…" : "Sign in & Sync"}
                </button>
                <button
                  type="button"
                  disabled={syncing}
                  onClick={() => handlePasswordAuth(true)}
                  className="px-3.5 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white text-xs font-medium"
                >
                  Create account
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2 text-xs text-gray-400">
              <label className="block">
                Email
                <input
                  type="email"
                  className={`${inputCls} mt-1`}
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              {!otpSent ? (
                <button
                  type="button"
                  disabled={syncing}
                  onClick={handleSendOtp}
                  className="px-3.5 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-xs font-semibold"
                >
                  {syncing ? "Sending…" : "Send Sign-In Link / Code"}
                </button>
              ) : (
                <div className="space-y-2.5">
                  <div className="p-3 rounded-xl bg-brand-500/10 border border-brand-500/30 text-[11px] text-gray-200 space-y-1.5">
                    <p className="font-semibold text-white">
                      Option A: Click the &ldquo;Log In&rdquo; link in the email, OR copy &amp; paste that link below!
                    </p>
                    <p className="text-gray-400">
                      Option B (To get a 6-digit code in the email): Open{" "}
                      <a
                        href="https://supabase.com/dashboard/project/gtzflyuqidygrgjbgmat/auth/templates"
                        target="_blank"
                        rel="noreferrer"
                        className="text-brand-400 underline font-medium"
                      >
                        Supabase → Auth → Email Templates → Magic Link
                      </a>{" "}
                      and add <code className="text-emerald-300 bg-black/50 px-1 py-0.5 rounded">{"{{ .Token }}"}</code> to the message body.
                    </p>
                  </div>
                  <label className="block">
                    Paste 6-digit code OR copy-paste the Sign-In Link URL from your email
                    <input
                      type="text"
                      className={`${inputCls} mt-1`}
                      placeholder="123456 or https://.../auth/v1/verify?token=..."
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value)}
                    />
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={syncing}
                      onClick={handleVerifyOtp}
                      className="px-3.5 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-xs font-semibold"
                    >
                      {syncing ? "Verifying…" : "Verify 6-digit code"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setOtpSent(false)}
                      className="px-3 py-2 rounded-xl bg-gray-800 border border-gray-700 text-gray-300 text-xs"
                    >
                      Resend email
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {statusMsg && (
        <p
          role={statusMsg.type === "err" ? "alert" : "status"}
          className={`text-xs ${statusMsg.type === "ok" ? "text-emerald-400" : "text-rose-400"}`}
        >
          {statusMsg.text}
        </p>
      )}
    </section>
  );
}
