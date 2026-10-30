"use client";

import { useEffect, useRef } from "react";
import {
  consumePortraitView,
  hasViewedPortrait,
  markRead,
  getPreferences,
} from "@/lib/local-store";

type Props = {
  /** İçerik kimliği: "portre:<id>" veya "haber:<id>" */
  contentKey: string;
  /** Sunucu tarafındaki toplu sayaç uç noktası. */
  kind: "portre" | "haber";
  /** Sunucu kaydındaki kimlik (sayaç güncellemesi için). */
  id: string;
};

/**
 * Toplu (anonim) okunma sayacı + 10 saniye sonra "okundu" işareti.
 *
 * KVKK: kullanıcı kimliği gönderilmez, IP okunmaz. Aynı içerik oturumda
 * yalnızca bir kez sayılır (sessionStorage). Okundu işareti cihazda tutulur
 * ve kullanıcı ayarlardan kapatabilir.
 */
export function ContentBehaviors({ contentKey, kind, id }: Props) {
  const sentRef = useRef(false);

  // Okundu işareti: 10 saniye sonra, yalnızca tercih açıksa.
  useEffect(() => {
    if (!getPreferences().readMarks) return;

    const timer = window.setTimeout(() => {
      if (getPreferences().readMarks) markRead(contentKey);
    }, 10_000);

    return () => window.clearTimeout(timer);
  }, [contentKey]);

  // Toplu okunma sayacı: sayfa görüntülendiğinde bir kez.
  useEffect(() => {
    if (hasViewedPortrait(contentKey)) return;
    if (sentRef.current) return;

    sentRef.current = true;
    consumePortraitView(contentKey);

    const url =
      kind === "portre"
        ? `/api/portraits/${id}/view`
        : `/api/news/view`;

    const body = kind === "portre" ? undefined : JSON.stringify({ id });

    void fetch(url, {
      method: "POST",
      ...(body ? { headers: { "Content-Type": "application/json" }, body } : {}),
      keepalive: true,
    }).catch(() => {
      // Sayaç isteğe bağlıdır; hata kullanıcıya gösterilmez.
    });
  }, [contentKey, id, kind]);

  return null;
}
