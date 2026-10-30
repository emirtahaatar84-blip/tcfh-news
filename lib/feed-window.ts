/**
 * Sonsuz akışta DOM/bellek penceresi.
 *
 * Kullanıcı yüzlerce kart kaydırdığında yalnızca son N kart DOM'da tutulur.
 * Sıra korunur; en eski kartlar çıkarılır. Çıkarılan kartların yüksekliği
 * çağıran taraftan telafi edilir (okuma konumu zıplamaz).
 */

export const MAX_DOM_CARDS = 120;

export function trimFeedWindow<T>(
  items: T[],
  max: number = MAX_DOM_CARDS,
): { items: T[]; removed: number } {
  if (max < 1) return { items: [], removed: items.length };
  if (items.length <= max) return { items, removed: 0 };

  const removed = items.length - max;
  return { items: items.slice(removed), removed };
}
