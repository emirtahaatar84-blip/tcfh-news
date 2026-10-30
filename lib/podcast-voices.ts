/**
 * Potkes (YZ Podcast Stüdyosu) sabit ses profilleri.
 *
 * SES SAĞLAYICI: LLM sağlayıcısının OpenAI uyumlu /v1/audio/speech
 * ucundan VoxCPM 2 (model: TTS_MODEL). Provider yalnızca "default" sesi
 * sunar; karakter sesi, her profile özgü SABİT `instructions` (Voice
 * Design) tanımıyla şekillendirilir. Aynı talimat her çağrıda gönderildiği
 * için karakterin ses karakteri olabildiğince tutarlı kalır.
 *
 * Ses tutarlılığı ayrıca konuşmacı adından deterministik hash ile
 * sağlanır: aynı isim her zaman aynı voiceKey'e eşlenir ve atama
 * senaryo üretilirken script.speakers[].voiceKey olarak KAYDEDİLİR.
 *
 * Not: Önceden yerel edge-tts-api (travisvn/openai-edge-tts) kullanılıyordu;
 * Microsoft'un speech servisi VPS IP aralığını engellediği için sağlayıcı
 * TTS'ye geçildi.
 */

export type PodcastVoiceProfile = {
  /** Yönetim panelinde gösterilen kısa etiket (karakter adı). */
  label: string;
  /** Voice Design talimatı — sağlayıcı TTS'ye gönderilir. */
  instructions: string;
};

/** Beş sabit karakter sesi — sağlayıcı VoxCPM 2 Voice Design. */
export const PODCAST_VOICES = {
  female_1: {
    label: "Emel",
    instructions:
      "A Turkish woman news anchor in her thirties, warm and clear voice, calm professional bulletin tone, articulate and steady pace",
  },
  female_2: {
    label: "Emma",
    instructions:
      "A young Turkish woman, soft and friendly voice, gentle articulate tone, natural conversational pace",
  },
  male_1: {
    label: "William",
    instructions:
      "A mature Turkish man, deep and steady voice, documentary narrator tone, authoritative and calm",
  },
  male_2: {
    label: "Andrew",
    instructions:
      "A Turkish man in his thirties, confident energetic voice, news presenter tone, articulate with brisk pace",
  },
  male_3: {
    label: "Brian",
    instructions:
      "A Turkish man, relaxed and friendly voice, conversational tone, easygoing and approachable",
  },
} as const satisfies Record<string, PodcastVoiceProfile>;

export type PodcastVoiceKey = keyof typeof PODCAST_VOICES;

export const PODCAST_VOICE_KEYS = Object.keys(
  PODCAST_VOICES,
) as PodcastVoiceKey[];

/** Geçersiz/eksik anahtarlar için varsayılan profil (ilk anahtar). */
export function getPodcastVoice(
  key: string | null | undefined,
): PodcastVoiceProfile {
  if (typeof key === "string" && (key in PODCAST_VOICES)) {
    return PODCAST_VOICES[key as PodcastVoiceKey];
  }
  return PODCAST_VOICES[PODCAST_VOICE_KEYS[0]];
}

/** İsim → kararlı sayısal hash (basit polinom hash, 32-bit). */
function hashSpeakerName(name: string): number {
  const normalized = name.trim().toLocaleLowerCase("tr-TR");
  let hash = 0;

  for (let i = 0; i < normalized.length; i += 1) {
    hash = (hash * 31 + normalized.charCodeAt(i)) >>> 0;
  }

  return hash;
}

/**
 * Tek bir konuşmacı adını deterministik olarak bir sese eşler.
 * Aynı isim HER ZAMAN aynı voiceKey'i alır (bölümler arası tutarlılık).
 */
export function assignVoiceKey(speakerName: string): PodcastVoiceKey {
  return PODCAST_VOICE_KEYS[hashSpeakerName(speakerName) % PODCAST_VOICE_KEYS.length];
}

/**
 * Bir bölümün tüm konuşmacılarına deterministik ses atar — üstelik aynı
 * bölümde iki karakterin AYNI sese düşmesini engeller: hash çakışmasında
 * sıradaki boş sese kaydırılır. Atama yalnızca isimlere ve (çakışma varsa)
 * bölüm içi konuşmacı listesine bağlı olduğu için tekrarlanabilirdir.
 */
export function assignVoiceKeys(
  speakerNames: string[],
): Record<string, PodcastVoiceKey> {
  const taken = new Set<PodcastVoiceKey>();
  const result: Record<string, PodcastVoiceKey> = {};

  for (const name of new Set(speakerNames.map((n) => n.trim()))) {
    if (!name) continue;

    const base = hashSpeakerName(name);
    let key = PODCAST_VOICE_KEYS[base % PODCAST_VOICE_KEYS.length];
    let offset = 0;

    while (taken.has(key) && offset < PODCAST_VOICE_KEYS.length) {
      offset += 1;
      key = PODCAST_VOICE_KEYS[(base + offset) % PODCAST_VOICE_KEYS.length];
    }

    taken.add(key);
    result[name] = key;
  }

  return result;
}
