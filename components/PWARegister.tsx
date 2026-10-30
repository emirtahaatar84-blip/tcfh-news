"use client";

import { useEffect } from "react";

/**
 * Service worker kaydı — yalnızca güvenli bağlamlarda (https / localhost).
 * Hatalar sessizce yutulur: SW kaydı akışı bozmamalı.
 */
export function PWARegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const isSecure =
      window.location.protocol === "https:" ||
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";

    if (!isSecure) return;

    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/sw.js")
      .catch(() => {
        // Kayıt başarısız — sessizce geç.
      });
  }, []);

  return null;
}
