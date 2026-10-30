"use client";

import { useCallback, useEffect, useState } from "react";
import type { Dictionary } from "@/lib/i18n";

type Props = {
  labels: Dictionary["pwa"];
};

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "pwa-install-dismissed";

/**
 * Kurulum promptu: `beforeinstallprompt` yakalandığında mobilde alt bant,
 * sm ve üstünde sağ altta köşe kartı olarak gösterilir. iOS'ta bu event
 * hiç gelmez — Safari için "Paylaş → Ana Ekrana Ekle" ipucu gösterilir.
 */
export function InstallPrompt({ labels }: Props) {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(true);
  const [isIOS, setIsIOS] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // İlk render'da SSR ile eşleşsin diye durumları mount'tan sonra oku.
    setIsIOS(/iphone|ipad/i.test(window.navigator.userAgent));
    setDismissed(window.localStorage.getItem(DISMISS_KEY) !== null);
    setReady(true);

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const onAppInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  const dismiss = useCallback(() => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // localStorage kapalı olabilir — sessizce geç.
    }
  }, []);

  async function install() {
    if (!deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
    } catch {
      // prompt başarısız — kartı kapat.
    }
    setDeferredPrompt(null);
  }

  if (!ready || installed || dismissed) return null;

  // iOS: beforeinstallprompt hiç gelmez — manuel ipucu göster.
  if (isIOS && !deferredPrompt) {
    return (
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-[#080808] p-space-3 sm:inset-x-auto sm:bottom-4 sm:right-4 sm:max-w-sm sm:rounded-2xl sm:border">
        <div className="flex items-start gap-space-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icons/icon-192.png"
            alt=""
            className="h-10 w-10 shrink-0 rounded-xl"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-zinc-100">
              {labels.installTitle}
            </p>
            <p className="mt-space-1 text-xs leading-relaxed text-zinc-500">
              {labels.iosHint}
            </p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label={labels.later}
            className="shrink-0 rounded-full p-space-2 text-zinc-500 transition-colors hover:bg-[#22252a] hover:text-zinc-200"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="h-4 w-4"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  if (!deferredPrompt) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-[#080808] p-space-3 sm:inset-x-auto sm:bottom-4 sm:right-4 sm:max-w-sm sm:rounded-2xl sm:border">
      <div className="flex items-start gap-space-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icons/icon-192.png"
          alt=""
          className="h-10 w-10 shrink-0 rounded-xl"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-zinc-100">
            {labels.installTitle}
          </p>
          <p className="mt-space-1 text-xs leading-relaxed text-zinc-500">
            {labels.installBody}
          </p>
          <button
            type="button"
            onClick={() => void install()}
            className="btn-primary mt-space-3 w-full sm:w-auto"
          >
            {labels.install}
          </button>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label={labels.later}
          className="shrink-0 rounded-full p-space-2 text-zinc-500 transition-colors hover:bg-[#22252a] hover:text-zinc-200"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="h-4 w-4"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
