/**
 * Sahip hesapları: yönetim/moderasyon yetkisi olan e-postalar.
 * OWNER_EMAIL ortam değişkeniyle virgülle ayrılmış liste verilebilir.
 * Varsayılan: BOŞ. OWNER_EMAIL tanımlanmazsa hiç kimse owner sayılmaz
 * (güvenli varsayılan — açık kaynak kurulumlarında hesap ele geçirme riski yok).
 */
export const OWNER_EMAILS: string[] = (
  process.env.OWNER_EMAIL || ""
)
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

export function isOwner(email: string | null | undefined): boolean {
  if (!email) return false;
  return OWNER_EMAILS.includes(email.toLowerCase());
}
