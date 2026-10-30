"use client";

import { useEffect, useRef } from "react";
import {
  consumePortraitView,
  getPreferences,
  hasViewedPortrait,
  markRead,
} from "@/lib/local-store";

type Props = {
  contentKey: string;
  id: string;
};

/**
 * Münazara dosyası davranışları: 10 sn sonra okundu işareti (cihazda) ve
 * oturumda bir kez toplu okunma sayacı. Kullanıcı verisi gönderilmez.
 */
export function DebateBehaviors({ contentKey, id }: Props) {
  const sentRef = useRef(false);

  useEffect(() => {
    if (!getPreferences().readMarks) return;

    const timer = window.setTimeout(() => {
      if (getPreferences().readMarks) markRead(contentKey);
    }, 10_000);

    return () => window.clearTimeout(timer);
  }, [contentKey]);

  useEffect(() => {
    if (sentRef.current) return;
    if (hasViewedPortrait(contentKey)) return;

    sentRef.current = true;
    consumePortraitView(contentKey);

    void fetch(`/api/debates/${id}/view`, {
      method: "POST",
      keepalive: true,
    }).catch(() => {
      // Sayaç kritik değil.
    });
  }, [contentKey, id]);

  return null;
}
