"use client";

import { useEffect } from "react";
import { getSupabaseClient } from "@/lib/sync/supabase-client";
import { syncNow } from "@/lib/sync/sync-engine";
import { AuthWelcomeModal } from "./AuthWelcomeModal";

export function SyncProvider() {
  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const trySyncQuietly = async () => {
      try {
        const supabase = getSupabaseClient();
        if (!supabase) return;
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session?.user) {
          await syncNow();
        }
      } catch {
        // Offline or unconfigured: fail quietly and retry next trigger
      }
    };

    // Initial sync when app opens
    trySyncQuietly();

    const supabase = getSupabaseClient();
    const { data: authSub } = supabase
      ? supabase.auth.onAuthStateChange(async (event, session) => {
          if (
            (event === "SIGNED_IN" ||
              event === "INITIAL_SESSION" ||
              event === "USER_UPDATED" ||
              event === "TOKEN_REFRESHED") &&
            session?.user
          ) {
            await trySyncQuietly();
          }
        })
      : { data: { subscription: null } };

    const onLocalChange = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        trySyncQuietly();
      }, 3000);
    };

    const onVisibilityOrFocus = () => {
      if (document.visibilityState === "visible") {
        trySyncQuietly();
      }
    };

    window.addEventListener("nutritrack:local-change", onLocalChange);
    window.addEventListener("focus", onVisibilityOrFocus);
    document.addEventListener("visibilitychange", onVisibilityOrFocus);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      authSub?.subscription?.unsubscribe();
      window.removeEventListener("nutritrack:local-change", onLocalChange);
      window.removeEventListener("focus", onVisibilityOrFocus);
      document.removeEventListener("visibilitychange", onVisibilityOrFocus);
    };
  }, []);

  return <AuthWelcomeModal />;
}
