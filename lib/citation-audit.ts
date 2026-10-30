import { prisma } from "@/lib/prisma";
import { CITATION } from "@/lib/hq/config";

/**
 * İŞ 4.5 — Haftalık atıf denetimi (otomatik, insansız).
 *
 * 1. Son 7 günün atıflarından rastgele 20 örnek seçilir.
 * 2. Her örnek ikinci LLM'e "bu atıf doğru mu?" diye sorulur.
 * 3. Yanlış oranı %5'i geçerse `SystemSettings.citationThreshold` tek yönlü
 *    olarak CITATION.thresholdEscalated değerine yükseltilir.
 *
 * KVKK: yalnız içerik başlıkları + ortak varlık adları gönderilir (zaten
 * sentez için aynı sağlayıcı kullanılıyor). Kullanıcı verisi YOK.
 * Yeni üçüncü taraf YOK.
 */

export type CitationAuditReport = {
  sampled: number;
  judged: number;
  wrong: number;
  wrongRate: number | null;
  thresholdBefore: number;
  thresholdAfter: number;
  escalated: boolean;
  note: string;
};

const SYSTEM_PROMPT = `Bir haber sitesinin atıf denetçisisin. Sana iki içerik başlığı ve ortak varlıklar vereceğim.
Soru: A içeriği, B içeriğine atıf yapabilir mi? Yani aynı olaydan/olayın doğrudan devamından mı bahsediyor
ve ortak varlık gerçekten aynı şeyi mi gösteriyor?
Yalnızca şu JSON'u döndür: {"sameEvent": true|false, "reason": "kısa gerekçe"}`;

async function askModel(input: {
  providerUrl: string;
  apiKey: string;
  model: string;
  aTitle: string;
  bTitle: string;
  entities: string[];
}): Promise<boolean | null> {
  try {
    const response = await fetch(`${input.providerUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.apiKey}`,
      },
      body: JSON.stringify({
        model: input.model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `A: ${input.aTitle}\nB: ${input.bTitle}\nOrtak varlıklar: ${input.entities.join(", ") || "—"}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) return null;

    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content) as { sameEvent?: unknown };
    return typeof parsed.sameEvent === "boolean" ? parsed.sameEvent : null;
  } catch {
    return null;
  }
}

export async function runCitationAudit(): Promise<CitationAuditReport> {
  const settings = await prisma.systemSettings.findFirst();
  const thresholdBefore = settings?.citationThreshold ?? CITATION.threshold;
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const candidates = await prisma.citation.findMany({
    where: { createdAt: { gte: since }, reviewed: null },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  // Deterministik örnekleme: en yeni kayıtlardan eşit aralıklarla.
  const sampleSize = Math.min(CITATION.weeklySampleSize, candidates.length);
  const step = sampleSize > 0 ? Math.floor(candidates.length / sampleSize) : 0;
  const sample = step > 0 ? candidates.filter((_, index) => index % step === 0).slice(0, sampleSize) : [];

  if (sample.length === 0) {
    return {
      sampled: 0,
      judged: 0,
      wrong: 0,
      wrongRate: null,
      thresholdBefore,
      thresholdAfter: thresholdBefore,
      escalated: false,
      note: "Son 7 günde denetlenecek atıf yok.",
    };
  }

  if (!settings?.apiKey) {
    return {
      sampled: sample.length,
      judged: 0,
      wrong: 0,
      wrongRate: null,
      thresholdBefore,
      thresholdAfter: thresholdBefore,
      escalated: false,
      note: "AI anahtarı yok; denetim atlandı (atıflar korunur).",
    };
  }

  let judged = 0;
  let wrong = 0;

  for (const citation of sample) {
    const [from, to] = await Promise.all([
      citation.fromKind === "haber"
        ? prisma.newsItem.findUnique({ where: { id: citation.fromId }, select: { title: true } })
        : prisma.portrait.findUnique({ where: { id: citation.fromId }, select: { title: true } }),
      citation.toKind === "haber"
        ? prisma.newsItem.findUnique({ where: { id: citation.toId }, select: { title: true } })
        : prisma.portrait.findUnique({ where: { id: citation.toId }, select: { title: true } }),
    ]);

    if (!from?.title || !to?.title) continue;

    const entities = JSON.parse(citation.entities || "[]") as string[];
    const verdict = await askModel({
      providerUrl: settings.providerUrl,
      apiKey: settings.apiKey,
      model: settings.modelName,
      aTitle: from.title,
      bTitle: to.title,
      entities,
    });

    if (verdict === null) continue;

    judged += 1;
    const correct = verdict ? 1 : 0;
    if (!verdict) wrong += 1;

    await prisma.citation.update({
      where: { id: citation.id },
      data: { reviewed: correct },
    }).catch(() => undefined);
  }

  const wrongRate = judged === 0 ? null : wrong / judged;
  const shouldEscalate = wrongRate !== null && wrongRate > CITATION.falsePositiveLimit;
  const thresholdAfter = shouldEscalate
    ? Math.max(thresholdBefore, CITATION.thresholdEscalated)
    : thresholdBefore;

  if (thresholdAfter !== thresholdBefore) {
    await prisma.systemSettings.updateMany({ data: { citationThreshold: thresholdAfter } });
  }

  return {
    sampled: sample.length,
    judged,
    wrong,
    wrongRate: wrongRate === null ? null : Number((wrongRate * 100).toFixed(1)),
    thresholdBefore,
    thresholdAfter,
    escalated: shouldEscalate,
    note: shouldEscalate
      ? `Yanlış oranı %${(wrongRate! * 100).toFixed(1)} > %${(CITATION.falsePositiveLimit * 100).toFixed(0)} → eşik ${thresholdAfter}`
      : `Yanlış oranı %${wrongRate === null ? "—" : (wrongRate * 100).toFixed(1)} → eşik korundu.`,
  };
}

/** 90 günden eski atıf kayıtlarını siler (KVKK saklama süresi). */
export async function purgeOldCitations(): Promise<number> {
  const cutoff = new Date(Date.now() - CITATION.retentionDays * 24 * 60 * 60 * 1000);
  const result = await prisma.citation.deleteMany({ where: { createdAt: { lt: cutoff } } });
  return result.count;
}
