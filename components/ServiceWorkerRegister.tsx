"use client";

import { useEffect } from "react";

/** Registers the offline service worker in production only (avoids stale caches during development). */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* Offline support is optional; the app works without it. */
      });
    }
  }, []);
  return null;
}
