"use client";

import { useEffect } from "react";

type Props = {
  /** Çevrimdışı saklanacak haberin göreli yolu. */
  url: string;
};

/**
 * Son okunan 20 haberi çevrimdışı okunabilir kılar. Sayfa açıldığında
 * service worker'a tek seferlik bir mesaj gönderir; SW sayfayı kendi
 * cache'ine alır ve en fazla 20 kayıt tutar.
 *
 * KVKK: hiçbir veri sunucuya gönderilmez; cache cihazda kalır.
 */
export function OfflineSaver({ url }: Props) {
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;

    const save = async () => {
      try {
        const registration = await navigator.serviceWorker.ready;
        if (cancelled) return;

        registration.active?.postMessage({ type: "cache-news", url });
      } catch {
        // SW yoksa sessizce geç.
      }
    };

    // Ağ boşta kaldığında kaydet — sayfa açılışını yavaşlatmaz.
    const timer = window.setTimeout(save, 4000);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [url]);

  return null;
}
