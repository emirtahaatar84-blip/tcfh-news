/**
 * VoxCPM 2 "Voice Design" personas for the Sesli Özet feature.
 *
 * The provider only exposes the `default` voice, but accepts free-form
 * textual voice descriptions through the OpenAI-compatible `instructions`
 * parameter. Per user request, all four personas read in the SAME female
 * voice (Ayşe) — this keeps the timbre 100% consistent across every story
 * and eliminates voice drift between personas. The persona keys are kept
 * so stored user preferences continue to work.
 *
 * Tip (VoxCPM docs): when the provider adds reference-wav cloning or a
 * named voice for this persona, the description can be swapped for a
 * reference file to lock the timbre even harder.
 */

export type VoicePersona = {
  /** Stable key stored on the user row and used in cache keys. */
  key: string;
  /** Voice Design description sent as `instructions`. Empty = provider default. */
  instructions: string;
};

/** Per user request the personas stay DISTINCT — each has its own timbre. */
export const VOICE_PERSONAS: VoicePersona[] = [
  {
    key: "default",
    instructions: "",
  },
  {
    key: "male_1",
    instructions:
      "A middle-aged Turkish man, deep authoritative voice, calm and professional podcast presenter tone, articulate and confident",
  },
  {
    key: "male_2",
    instructions:
      "A young Turkish man, vibrant and dynamic voice, conversational and enthusiastic tone, slightly faster pace",
  },
  {
    key: "female_1",
    instructions:
      "A young Turkish woman, warm and friendly voice, natural conversational tone, highly expressive and soft spoken",
  },
  {
    key: "female_2",
    instructions:
      "A mature Turkish woman, articulate and clear voice, serious and analytical tone, intellectual and calm tempo",
  },
];

export const DEFAULT_VOICE_KEY = "default";

/** Resolves a stored key to a persona, falling back to the default voice. */
export function getVoicePersona(key: string | null | undefined): VoicePersona {
  return (
    VOICE_PERSONAS.find((persona) => persona.key === key) ??
    VOICE_PERSONAS[0]
  );
}

export function isVoiceKey(key: unknown): key is string {
  return (
    typeof key === "string" &&
    VOICE_PERSONAS.some((persona) => persona.key === key)
  );
}
