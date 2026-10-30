"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { estimateSeconds, type SpeechDocument } from "@/lib/speech-text";
import {
  clearSpeechResume,
  getPreferences,
  getSpeechResume,
  saveSpeechResume,
  setPreferences,
  type SpeechResume,
} from "@/lib/local-store";

/**
 * Birleşik medya motoru.
 *
 * İki mod tek bir altyapıyı paylaşır:
 *   1. speech — Web Speech API (tarayıcı yerleşik TTS). Ses/metin hiçbir
 *      sunucuya gönderilmez; ağ isteği oluşmaz.
 *   2. audio  — podcast gibi gerçek ses dosyaları (tek <audio>).
 *
 * Aynı anda yalnızca bir okuma aktiftir; biri başlarken diğeri durdurulur.
 * Durum makinesi: idle → playing ⇄ paused → ended
 */

export type MediaKind = "speech" | "audio" | null;
export type MediaStatus = "idle" | "playing" | "paused" | "ended";
export type SleepOption = 0 | 10 | 20 | 30 | 60 | -1;

export type AudioTrack = {
  id: string;
  title: string;
  src: string;
  imageUrl?: string | null;
};

type VoiceOption = { uri: string; name: string; lang: string };

type MediaContextValue = {
  kind: MediaKind;
  status: MediaStatus;

  // ── Sesli okuma ──
  doc: SpeechDocument | null;
  sentences: string[];
  index: number;
  currentSentence: string | null;
  rate: number;
  voices: VoiceOption[];
  voiceURI: string | null;
  supported: boolean;
  error: string | null;
  progress: number;
  elapsed: number;
  remaining: number;

  // ── Audio ──
  audioTrack: AudioTrack | null;
  audioQueue: AudioTrack[];
  audioIndex: number;
  audioDuration: number;
  audioCurrentTime: number;

  // ── Ortak ──
  sleepMinutes: SleepOption;
  sleepRemaining: number | null;
  resumeSuggestion: SpeechResume | null;
  pendingDoc: SpeechDocument | null;

  requestSpeech: (doc: SpeechDocument, startIndex?: number) => void;
  confirmSwitch: () => void;
  cancelSwitch: () => void;
  toggle: () => void;
  stop: () => void;
  next: () => void;
  previous: () => void;
  seekBy: (seconds: number) => void;
  jumpToSentence: (index: number) => void;
  setRate: (rate: number) => void;
  setVoice: (uri: string | null) => void;
  setSleep: (option: SleepOption) => void;
  resumeFromSuggestion: () => void;
  dismissResume: () => void;

  playAudio: (queue: AudioTrack[], startIndex?: number) => void;
  seekAudio: (seconds: number) => void;
  skipAudio: (delta: number) => void;
  moveInAudioQueue: (from: number, to: number) => void;
  removeFromAudioQueue: (index: number) => void;
};

const MediaContext = createContext<MediaContextValue | null>(null);

export const SPEECH_RATES = [0.75, 1, 1.25, 1.5, 2] as const;
const SUPPORTED_RATES = new Set<number>(SPEECH_RATES);

function clampRate(value: number): number {
  if (!Number.isFinite(value)) return 1;
  const nearest = SPEECH_RATES.reduce((best, rate) =>
    Math.abs(rate - value) < Math.abs(best - value) ? rate : best,
  );
  return SUPPORTED_RATES.has(nearest) ? nearest : 1;
}

export function MediaProvider({ children }: { children: React.ReactNode }) {
  const [kind, setKind] = useState<MediaKind>(null);
  const [status, setStatus] = useState<MediaStatus>("idle");

  // Sesli okuma
  const [doc, setDoc] = useState<SpeechDocument | null>(null);
  const [index, setIndex] = useState(0);
  const [rate, setRateState] = useState(1);
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [voiceURI, setVoiceURIState] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  // Audio
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioQueue, setAudioQueue] = useState<AudioTrack[]>([]);
  const [audioIndex, setAudioIndex] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);

  // Ortak
  const [sleepMinutes, setSleepMinutesState] = useState<SleepOption>(0);
  const [sleepEndsAt, setSleepEndsAt] = useState<number | null>(null);
  const [sleepRemaining, setSleepRemaining] = useState<number | null>(null);
  const [resumeSuggestion, setResumeSuggestion] = useState<SpeechResume | null>(
    null,
  );
  const [pendingDoc, setPendingDoc] = useState<SpeechDocument | null>(null);
  const pendingStartRef = useRef(0);

  // ── Ref'ler (stale closure önlemi) ────────────────────────────────────────
  const docRef = useRef<SpeechDocument | null>(null);
  const indexRef = useRef(0);
  const statusRef = useRef<MediaStatus>("idle");
  const rateRef = useRef(1);
  const voiceRef = useRef<string | null>(null);
  const tokenRef = useRef(0);
  const sleepOptionRef = useRef<SleepOption>(0);
  const partialCharsRef = useRef(0);
  const audioQueueRef = useRef<AudioTrack[]>([]);
  const audioIndexRef = useRef(0);

  docRef.current = doc;
  indexRef.current = index;
  statusRef.current = status;
  rateRef.current = rate;
  voiceRef.current = voiceURI;
  sleepOptionRef.current = sleepMinutes;
  audioQueueRef.current = audioQueue;
  audioIndexRef.current = audioIndex;

  const sentences = doc?.sentences ?? [];

  // ── Tercihleri yükle (hız + ses) ─────────────────────────────────────────
  useEffect(() => {
    const prefs = getPreferences();
    setRateState(clampRate(prefs.speechRate));
    setVoiceURIState(prefs.speechVoice);

    const saved = getSpeechResume();
    if (saved && saved.sentenceIndex > 0) setResumeSuggestion(saved);
  }, []);

  // ── Ses desteği ve tr-TR ses listesi ─────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;

    const hasSpeech =
      "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

    if (!hasSpeech) {
      setSupported(false);
      return;
    }

    const load = () => {
      const all = window.speechSynthesis.getVoices();

      const turkish = all
        .filter((voice) => voice.lang.toLowerCase().startsWith("tr"))
        .map((voice) => ({
          uri: voice.voiceURI,
          name: voice.name,
          lang: voice.lang,
        }));

      setVoices(turkish);

      // Kayıtlı ses artık yoksa ilk Türkçe sesi seç.
      if (voiceRef.current && !turkish.some((v) => v.uri === voiceRef.current)) {
        setVoiceURIState(turkish[0]?.uri ?? null);
      }
    };

    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);

    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", load);
    };
  }, []);

  // ── Yardımcılar ──────────────────────────────────────────────────────────
  const totalChars = useMemo(
    () => sentences.reduce((sum, sentence) => sum + sentence.length, 0),
    [sentences],
  );

  const completedChars = useMemo(
    () =>
      sentences
        .slice(0, index)
        .reduce((sum, sentence) => sum + sentence.length, 0),
    [index, sentences],
  );

  const elapsed = useMemo(() => {
    if (!doc) return 0;
    const before = sentences
      .slice(0, index)
      .reduce((sum, sentence) => sum + estimateSeconds(sentence, rate), 0);
    const partial = estimateSeconds(
      (sentences[index] ?? "").slice(0, partialCharsRef.current),
      rate,
    );
    return before + partial;
  }, [doc, index, rate, sentences]);

  const remaining = useMemo(() => {
    if (!doc) return 0;
    return Math.max(0, Math.round(doc.estimatedSeconds / Math.max(rate, 0.5)) - elapsed);
  }, [doc, elapsed, rate]);

  const persistResume = useCallback((nextIndex: number, mode: "summary" | "full") => {
    const current = docRef.current;
    if (!current) return;

    saveSpeechResume({
      contentId: current.contentId,
      title: current.title,
      url: current.url,
      mode: current.mode ?? mode,
      sentenceIndex: nextIndex,
      rate: rateRef.current,
    });
  }, []);

  const synthStop = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    tokenRef.current += 1;
    window.speechSynthesis.cancel();
  }, []);

  const pauseAudio = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  /** Tek bir cümleyi okur; bitince sıradakine geçer. */
  const speakSentence = useCallback(
    (sentenceIndex: number, mode: "summary" | "full") => {
      const current = docRef.current;
      if (!current) return;

      const sentence = current.sentences[sentenceIndex];
      if (!sentence) {
        // Doküman bitti.
        setStatus("ended");
        setKind("speech");
        clearSpeechResume();
        setResumeSuggestion(null);

        if (sleepOptionRef.current === -1) {
          sleepOptionRef.current = 0;
          setSleepMinutesState(0);
          setSleepEndsAt(null);
        }
        return;
      }

      // Ses çakışması yok: önceki okuma iptal edilir.
      synthStop();
      pauseAudio();

      const token = tokenRef.current;
      partialCharsRef.current = 0;

      const utterance = new SpeechSynthesisUtterance(sentence);
      utterance.lang = "tr-TR";
      utterance.rate = rateRef.current;

      const selected = voiceRef.current;
      if (selected) {
        const voice = window.speechSynthesis
          .getVoices()
          .find((item) => item.voiceURI === selected);
        if (voice) utterance.voice = voice;
      }

      utterance.onstart = () => {
        if (token !== tokenRef.current) return;
        setStatus("playing");
        setKind("speech");
        setError(null);
        setIndex(sentenceIndex);
        persistResume(sentenceIndex, mode);
        setProgress(
          totalChars > 0
            ? Math.round(
                ((sentences
                  .slice(0, sentenceIndex)
                  .reduce((sum, item) => sum + item.length, 0) +
                  0) /
                  totalChars) *
                  100,
              )
            : 0,
        );
      };

      utterance.onboundary = (event) => {
        if (token !== tokenRef.current) return;

        if (typeof event.charIndex === "number") {
          partialCharsRef.current = event.charIndex;

          const completed = current.sentences
            .slice(0, sentenceIndex)
            .reduce((sum, item) => sum + item.length, 0);

          if (totalChars > 0) {
            setProgress(
              Math.min(
                100,
                Math.round(((completed + event.charIndex) / totalChars) * 100),
              ),
            );
          }
        }
      };

      utterance.onend = () => {
        if (token !== tokenRef.current) return;
        if (statusRef.current === "paused") return;

        const nextIndex = sentenceIndex + 1;

        if (nextIndex >= current.sentences.length) {
          setStatus("ended");
          setProgress(100);
          clearSpeechResume();
          setResumeSuggestion(null);

          if (sleepOptionRef.current === -1) {
            sleepOptionRef.current = 0;
            setSleepMinutesState(0);
            setSleepEndsAt(null);
          }
          return;
        }

        speakSentence(nextIndex, mode);
      };

      utterance.onerror = (event) => {
        if (token !== tokenRef.current) return;
        // "interrupted"/"canceled" bizim iptalimizdir — hata değil.
        if (event.error === "interrupted" || event.error === "canceled") return;

        setStatus("paused");
        setError(
          event.error === "not-allowed"
            ? "Tarayıcı sesli okumaya izin vermedi. Oynat düğmesine dokunun."
            : "Sesli okuma sırasında bir hata oluştu.",
        );
      };

      window.speechSynthesis.speak(utterance);
    },
    [pauseAudio, persistResume, sentences, synthStop, totalChars],
  );

  // ── Dışa açık eylemler: sesli okuma ──────────────────────────────────────
  const startSpeech = useCallback(
    (nextDoc: SpeechDocument, startIndex = 0) => {
      if (!supported) {
        setError("Tarayıcınız sesli okumayı desteklemiyor.");
        return;
      }

      pauseAudio();
      setKind("speech");
      setDoc(nextDoc);
      docRef.current = nextDoc;
      setIndex(startIndex);
      setProgress(0);
      setError(null);
      setStatus("paused"); // onstart ile "playing" olur

      // Kullanıcı etkileşimiyle çağrıldığı için otomatik oynatma engeli yok.
      speakSentence(startIndex, nextDoc.mode);
    },
    [pauseAudio, speakSentence, supported],
  );

  const requestSpeech = useCallback(
    (nextDoc: SpeechDocument, startIndex = 0) => {
      const active = docRef.current;

      if (
        active &&
        active.contentId !== nextDoc.contentId &&
        statusRef.current === "playing"
      ) {
        pendingStartRef.current = startIndex;
        setPendingDoc(nextDoc);
        return;
      }

      startSpeech(nextDoc, startIndex);
    },
    [startSpeech],
  );

  const confirmSwitch = useCallback(() => {
    if (!pendingDoc) return;
    const next = pendingDoc;
    const startIndex = pendingStartRef.current;
    setPendingDoc(null);
    startSpeech(next, startIndex);
  }, [pendingDoc, startSpeech]);

  const cancelSwitch = useCallback(() => setPendingDoc(null), []);

  const toggle = useCallback(() => {
    if (typeof window === "undefined") return;

    if (kind === "audio") {
      const audio = audioRef.current;
      if (!audio) return;
      if (audio.paused) void audio.play().catch(() => setStatus("paused"));
      else audio.pause();
      return;
    }

    if (!docRef.current) return;

    const synth = window.speechSynthesis;

    if (statusRef.current === "playing") {
      synth.pause();
      setStatus("paused");
      persistResume(indexRef.current, docRef.current.mode);
      return;
    }

    if (statusRef.current === "paused") {
      // Tarayıcı pause'u desteklemiyorsa cümle başından devam et.
      if (synth.paused) {
        synth.resume();
        setStatus("playing");
      } else {
        speakSentence(indexRef.current, docRef.current.mode);
      }
      return;
    }

    // idle / ended → baştan (veya kaldığı yerden) oku.
    speakSentence(Math.min(indexRef.current, docRef.current.sentences.length - 1), docRef.current.mode);
  }, [kind, persistResume, speakSentence]);

  const stop = useCallback(() => {
    synthStop();
    pauseAudio();

    if (audioRef.current) {
      audioRef.current.removeAttribute("src");
      audioRef.current.load();
    }

    setKind(null);
    setStatus("idle");
    setDoc(null);
    docRef.current = null;
    setIndex(0);
    setProgress(0);
    setError(null);
    setAudioQueue([]);
    setAudioIndex(0);
    setSleepMinutesState(0);
    setSleepEndsAt(null);
    setPendingDoc(null);
  }, [pauseAudio, synthStop]);

  const jumpToSentence = useCallback(
    (target: number) => {
      const current = docRef.current;
      if (!current) return;

      const bounded = Math.max(0, Math.min(target, current.sentences.length - 1));
      setKind("speech");
      setIndex(bounded);
      speakSentence(bounded, current.mode);
    },
    [speakSentence],
  );

  /** 15 sn geri / 30 sn ileri — cümle bazlı atlama. */
  const seekBy = useCallback(
    (seconds: number) => {
      if (kind === "audio") {
        const audio = audioRef.current;
        if (!audio) return;
        audio.currentTime = Math.max(
          0,
          Math.min(audio.duration || 0, audio.currentTime + seconds),
        );
        return;
      }

      const current = docRef.current;
      if (!current) return;

      const step = estimateSeconds("x", rateRef.current); // ≈1 sn
      const targetTime = Math.max(
        0,
        elapsed + seconds,
      );

      let accumulated = 0;
      let targetIndex = 0;

      for (let i = 0; i < current.sentences.length; i += 1) {
        const duration = estimateSeconds(current.sentences[i], rateRef.current);
        if (accumulated + duration >= targetTime) {
          targetIndex = i;
          break;
        }
        accumulated += duration;
        targetIndex = Math.min(i + 1, current.sentences.length - 1);
      }

      void step;
      jumpToSentence(targetIndex);
    },
    [elapsed, jumpToSentence, kind],
  );

  const next = useCallback(() => {
    if (kind === "audio") {
      const queue = audioQueueRef.current;
      const nextIndex = audioIndexRef.current + 1;
      if (nextIndex < queue.length) {
        setAudioIndex(nextIndex);
        audioIndexRef.current = nextIndex;

        const track = queue[nextIndex];
        const audio = audioRef.current;
        if (audio && track) {
          audio.src = track.src;
          void audio.play().catch(() => setStatus("paused"));
        }
      }
      return;
    }

    jumpToSentence(indexRef.current + 1);
  }, [jumpToSentence, kind]);

  const previous = useCallback(() => {
    if (kind === "audio") {
      const audio = audioRef.current;
      if (audio && audio.currentTime > 4) {
        audio.currentTime = 0;
        return;
      }

      const prevIndex = Math.max(0, audioIndexRef.current - 1);
      setAudioIndex(prevIndex);
      audioIndexRef.current = prevIndex;

      const track = audioQueueRef.current[prevIndex];
      if (audio && track) {
        audio.src = track.src;
        void audio.play().catch(() => setStatus("paused"));
      }
      return;
    }

    jumpToSentence(Math.max(0, indexRef.current - 1));
  }, [jumpToSentence, kind]);

  const setRate = useCallback((value: number) => {
    const nextRate = clampRate(value);
    setRateState(nextRate);
    rateRef.current = nextRate;
    setPreferences({ speechRate: nextRate });

    // Değişiklik anında uygulanır (bazı tarayıcılar rate'i canlı okur).
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      const current = docRef.current;
      if (current && statusRef.current === "playing") {
        // Utterance yeniden oluşturulduğunda yeni hız geçerli olur.
        setStatus("playing");
      }
    }
  }, []);

  const setVoice = useCallback((uri: string | null) => {
    setVoiceURIState(uri);
    voiceRef.current = uri;
    setPreferences({ speechVoice: uri });
  }, []);

  const setSleep = useCallback((option: SleepOption) => {
    sleepOptionRef.current = option;
    setSleepMinutesState(option);

    if (option === 0 || option === -1) {
      setSleepEndsAt(null);
      return;
    }

    setSleepEndsAt(Date.now() + option * 60 * 1000);
  }, []);

  // ── Uyku zamanlayıcı sayacı ──────────────────────────────────────────────
  useEffect(() => {
    if (!sleepEndsAt) {
      setSleepRemaining(null);
      return;
    }

    const tick = () => {
      const left = Math.max(0, Math.ceil(((sleepEndsAt ?? 0) - Date.now()) / 1000));
      setSleepRemaining(left);

      if (left <= 0) {
        if (kind === "audio") audioRef.current?.pause();
        else if (typeof window !== "undefined" && "speechSynthesis" in window) {
          window.speechSynthesis.pause();
          setStatus("paused");
        }

        sleepOptionRef.current = 0;
        setSleepMinutesState(0);
        setSleepEndsAt(null);
      }
    };

    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [kind, sleepEndsAt]);

  // ── Audio: kuyruk yönetimi ───────────────────────────────────────────────
  const loadAudioTrack = useCallback((track: AudioTrack) => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.src = track.src;
    setStatus("playing");
    setKind("audio");
    void audio.play().catch(() => {
      setStatus("paused");
      setError("Oynatmayı başlatmak için oynat düğmesine dokunun.");
    });
  }, []);

  const playAudio = useCallback(
    (queue: AudioTrack[], startIndex = 0) => {
      if (queue.length === 0) return;

      const bounded = Math.max(0, Math.min(startIndex, queue.length - 1));

      synthStop();
      setDoc(null);
      docRef.current = null;
      setIndex(0);
      setProgress(0);
      setError(null);

      setAudioQueue(queue);
      audioQueueRef.current = queue;
      setAudioIndex(bounded);
      audioIndexRef.current = bounded;

      loadAudioTrack(queue[bounded]);
    },
    [loadAudioTrack, synthStop],
  );

  const seekAudio = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(seconds)) return;
    audio.currentTime = seconds;
    setAudioCurrentTime(seconds);
  }, []);

  const skipAudio = useCallback((delta: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const target = Math.max(
      0,
      Math.min(audio.duration || 0, audio.currentTime + delta),
    );
    audio.currentTime = target;
    setAudioCurrentTime(target);
  }, []);

  const moveInAudioQueue = useCallback((from: number, to: number) => {
    const queue = audioQueueRef.current;
    if (from < 0 || to < 0 || from >= queue.length || to >= queue.length) return;
    if (from === to) return;

    const nextQueue = [...queue];
    const [moved] = nextQueue.splice(from, 1);
    nextQueue.splice(to, 0, moved);

    let nextIndex = audioIndexRef.current;
    if (audioIndexRef.current === from) nextIndex = to;
    else if (from < audioIndexRef.current && to >= audioIndexRef.current) nextIndex -= 1;
    else if (from > audioIndexRef.current && to <= audioIndexRef.current) nextIndex += 1;

    setAudioQueue(nextQueue);
    audioQueueRef.current = nextQueue;
    setAudioIndex(nextIndex);
    audioIndexRef.current = nextIndex;
  }, []);

  const removeFromAudioQueue = useCallback((removeIndex: number) => {
    const queue = audioQueueRef.current;
    if (removeIndex < 0 || removeIndex >= queue.length) return;

    const nextQueue = queue.filter((_, i) => i !== removeIndex);

    if (nextQueue.length === 0) {
      audioRef.current?.pause();
      setAudioQueue([]);
      setAudioIndex(0);
      setStatus("idle");
      setKind(null);
      return;
    }

    if (removeIndex === audioIndexRef.current) {
      const nextIndex = Math.min(removeIndex, nextQueue.length - 1);
      setAudioQueue(nextQueue);
      audioQueueRef.current = nextQueue;
      setAudioIndex(nextIndex);
      audioIndexRef.current = nextIndex;
      loadAudioTrack(nextQueue[nextIndex]);
      return;
    }

    setAudioQueue(nextQueue);
    audioQueueRef.current = nextQueue;

    if (removeIndex < audioIndexRef.current) {
      setAudioIndex((value) => Math.max(0, value - 1));
    }
  }, [loadAudioTrack]);

  // ── Audio olayları ───────────────────────────────────────────────────────
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onPlay = () => {
      setStatus("playing");
      setKind("audio");
    };
    const onPause = () => {
      if (audio.ended) return;
      setStatus("paused");
    };
    const onTime = () => setAudioCurrentTime(audio.currentTime);
    const onMeta = () =>
      setAudioDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const onEnded = () => {
      const queue = audioQueueRef.current;
      const nextIndex = audioIndexRef.current + 1;

      if (nextIndex < queue.length) {
        setAudioIndex(nextIndex);
        audioIndexRef.current = nextIndex;
        loadAudioTrack(queue[nextIndex]);
      } else {
        setStatus("ended");
      }
    };
    const onError = () => {
      setStatus("paused");
      setError("Ses yüklenemedi. Bağlantınızı kontrol edin.");
    };

    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);

    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
    };
  }, [loadAudioTrack]);

  // ── Media Session ────────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const session = navigator.mediaSession;

    const speechTrack = doc
      ? {
          title: doc.title,
          artwork: doc.coverImageUrl ?? "/icons/icon-512.png",
        }
      : null;

    const audioTrack = audioQueue[audioIndex] ?? null;

    const activeTitle = kind === "audio" ? audioTrack?.title : speechTrack?.title;
    const activeArtwork =
      kind === "audio"
        ? audioTrack?.imageUrl ?? "/icons/icon-512.png"
        : speechTrack?.artwork ?? "/icons/icon-512.png";

    if (!activeTitle) {
      session.metadata = null;
      session.playbackState = "none";
      return;
    }

    session.metadata = new MediaMetadata({
      title: activeTitle,
      artist: "TCFH News",
      album: kind === "audio" ? "Podcast" : "Sesli okuma",
      artwork: [{ src: activeArtwork, sizes: "512x512" }],
    });

    session.playbackState =
      status === "playing" ? "playing" : status === "paused" ? "paused" : "none";

    try {
      session.setActionHandler("play", () => {
        if (status !== "playing") toggle();
      });
      session.setActionHandler("pause", () => {
        if (status === "playing") toggle();
      });
      session.setActionHandler("previoustrack", () => previous());
      session.setActionHandler("nexttrack", () => next());
      session.setActionHandler("seekbackward", () => seekBy(-15));
      session.setActionHandler("seekforward", () => seekBy(30));
    } catch {
      // Bazı tarayıcılar tüm eylemleri desteklemez.
    }
  }, [audioIndex, audioQueue, doc, kind, next, previous, seekBy, status, toggle]);

  // ── Klavye kısayolları (metin alanına odak yokken) ───────────────────────
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.tagName === "BUTTON" ||
        target?.tagName === "A" ||
        target?.isContentEditable;

      if (typing) return;
      if (!docRef.current && kind !== "audio") return;

      if (event.code === "Space") {
        event.preventDefault();
        toggle();
      } else if (event.code === "ArrowLeft") {
        event.preventDefault();
        seekBy(-15);
      } else if (event.code === "ArrowRight") {
        event.preventDefault();
        seekBy(30);
      } else if (event.key.toLowerCase() === "m") {
        const audio = audioRef.current;
        if (audio && kind === "audio") audio.muted = !audio.muted;
        else if ("speechSynthesis" in window) {
          // Web Speech için sessize alma yok: okumayı duraklatır.
          toggle();
        }
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [kind, seekBy, toggle]);

  // ── Öneriyi kapat / devam et ─────────────────────────────────────────────
  const resumeFromSuggestion = useCallback(() => {
    const saved = resumeSuggestion;
    if (!saved) return;

    setResumeSuggestion(null);

    const emptyDoc: SpeechDocument = {
      contentId: saved.contentId,
      title: saved.title,
      url: saved.url,
      coverImageUrl: null,
      mode: saved.mode,
      sentences: [],
      estimatedSeconds: 0,
    };

    // Cümleler sayfa tarafından gelmeli; bu yüzden yalnızca yönlendirme
    // gerekiyorsa URL'e gidilir, aynı sayfada ise ListenButtons devralır.
    if (typeof window !== "undefined" && saved.url) {
      window.location.assign(saved.url);
    } else {
      startSpeech(emptyDoc, 0);
    }
  }, [resumeSuggestion, startSpeech]);

  const dismissResume = useCallback(() => {
    setResumeSuggestion(null);
    clearSpeechResume();
  }, []);

  const value = useMemo<MediaContextValue>(
    () => ({
      kind,
      status,
      doc,
      sentences,
      index,
      currentSentence: sentences[index] ?? null,
      rate,
      voices,
      voiceURI,
      supported,
      error,
      progress,
      elapsed,
      remaining,
      audioTrack: audioQueue[audioIndex] ?? null,
      audioQueue,
      audioIndex,
      audioDuration,
      audioCurrentTime,
      sleepMinutes,
      sleepRemaining,
      resumeSuggestion,
      pendingDoc,
      requestSpeech,
      confirmSwitch,
      cancelSwitch,
      toggle,
      stop,
      next,
      previous,
      seekBy,
      jumpToSentence,
      setRate,
      setVoice,
      setSleep,
      resumeFromSuggestion,
      dismissResume,
      playAudio,
      seekAudio,
      skipAudio,
      moveInAudioQueue,
      removeFromAudioQueue,
    }),
    [
      audioCurrentTime,
      audioDuration,
      audioIndex,
      audioQueue,
      cancelSwitch,
      confirmSwitch,
      dismissResume,
      doc,
      elapsed,
      error,
      index,
      jumpToSentence,
      kind,
      moveInAudioQueue,
      next,
      pendingDoc,
      playAudio,
      previous,
      progress,
      rate,
      remaining,
      removeFromAudioQueue,
      requestSpeech,
      resumeFromSuggestion,
      resumeSuggestion,
      seekAudio,
      seekBy,
      sentences,
      setRate,
      setSleep,
      setVoice,
      skipAudio,
      sleepMinutes,
      sleepRemaining,
      status,
      stop,
      supported,
      toggle,
      voiceURI,
      voices,
    ],
  );

  return (
    <MediaContext.Provider value={value}>
      {children}
      <audio ref={audioRef} preload="metadata" className="hidden" />
    </MediaContext.Provider>
  );
}

export function useMedia(): MediaContextValue {
  const context = useContext(MediaContext);

  if (!context) {
    throw new Error("useMedia, MediaProvider içinde kullanılmalıdır.");
  }

  return context;
}
