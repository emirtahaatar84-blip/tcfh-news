/**
 * Basit, bellek içi eşzamanlılık sınırlayıcı.
 *
 * KVKK notu: IP adresi OKUNMAZ ve SAKLANMAZ. Sınırlama yalnızca süreç
 * genelinde bir sayaçtır; kişiye veya cihaza bağlanamaz. Amaç, AI
 * sağlayıcısının kötüye kullanımını engellemektir.
 */

type Bucket = { count: number; resetAt: number };

const globalBuckets = globalThis as unknown as {
  aiRateBuckets?: Map<string, Bucket>;
};

function buckets(): Map<string, Bucket> {
  if (!globalBuckets.aiRateBuckets) globalBuckets.aiRateBuckets = new Map();
  return globalBuckets.aiRateBuckets;
}

/**
 * @param name  Özellik adı ("chat", "summary" …) — kişi değil, uç nokta.
 * @param limit Pencere başına izin verilen istek sayısı.
 * @param windowMs Pencere süresi.
 */
export function allowRequest(
  name: string,
  limit: number,
  windowMs = 60_000,
): boolean {
  const now = Date.now();
  const store = buckets();
  const bucket = store.get(name);

  if (!bucket || bucket.resetAt <= now) {
    store.set(name, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (bucket.count >= limit) return false;

  bucket.count += 1;
  return true;
}
