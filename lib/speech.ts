/**
 * Paylaşılan TTS yardımcıları — LLM sağlayıcısının OpenAI uyumlu
 * /v1/audio/speech ucu (VoxCPM 2) hem sesli özetlerde (lib/tts.ts) hem
 * podcast üretiminde (lib/podcast.ts) kullanılır; uç çözümleme ve model
 * seçimi tek yerden yapılır.
 */

/** Sağlayıcı temel URL'sini /audio/speech ucuna çözer. */
export function resolveSpeechEndpoint(providerUrl: string): string {
  const base = providerUrl.trim().replace(/\/+$/, "");
  if (base.endsWith("/audio/speech")) return base;
  return `${base}/audio/speech`;
}

/** TTS_MODEL env değişkeninden model adını okur (varsayılan voxcpm2). */
export function resolveTtsModel(): string {
  return process.env.TTS_MODEL?.trim() || "voxcpm2";
}

/**
 * Metni TTS'e göndermeden önce temizler: tırnak, parantez, tire vb. özel
 * karakterler ses motorunda pelteklik/boğuklaşma/kelime yutma yarattığından
 * atılır. Yalnızca şunlar korunur:
 *  - Türkçe harfler (ç, ğ, ı, ö, ş, ü, İ dahil — Unicode NFD/NFC güvenli)
 *  - rakamlar (haber içeriğindeki sayılar korunmalı)
 *  - boşluklar, nokta ve virgül
 * Atılan karakterlerin yerine boşluk konur (kelimeler birleşmesin).
 */
export function sanitizeTtsText(text: string): string {
  return text
    .replace(/[^0-9a-zA-ZçÇğĞıİöÖşŞüÜ\s.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
