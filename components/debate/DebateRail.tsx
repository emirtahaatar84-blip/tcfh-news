import Link from "next/link";
import { MUS_THRESHOLDS, MUS_WEIGHTS } from "@/lib/debate/config";
import { formatTotalMinutes } from "@/lib/debate/format";
import type { Dictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n-config";

type Props = {
  lang: Locale;
  dict: Dictionary;
};

const WEIGHT_ROWS = [
  { key: "controversy", label: "Tartışılabilirlik", value: MUS_WEIGHTS.controversy },
  { key: "evidence", label: "Kanıt bulunabilirliği", value: MUS_WEIGHTS.evidence },
  { key: "recency", label: "Güncellik", value: MUS_WEIGHTS.recency },
  { key: "scope", label: "Kapsam", value: MUS_WEIGHTS.scope },
  { key: "levelFit", label: "Seviyeye uygunluk", value: MUS_WEIGHTS.levelFit },
  { key: "originality", label: "Özgünlük", value: MUS_WEIGHTS.originality },
];

/** Münazara sayfalarının sağ kolonu: yöntem şeffaflığı + arşiv. */
export function DebateRail({ lang, dict }: Props) {
  return (
    <div className="space-y-space-4">
      <section className="rounded-2xl border border-[#22252a] bg-[#16181c] p-space-4">
        <h2 className="text-[11px] font-bold uppercase tracking-wide text-zinc-400">
          Münazara Uygunluk Skoru
        </h2>
        <p className="mt-space-1 text-[10px] leading-relaxed text-zinc-500">
          Konular 0-100 arasında puanlanır; eşikler tek bir ayar dosyasında
          tutulur. Tarayıcıda hesaplama veya istek yapılmaz.
        </p>
        <ul className="mt-space-2 space-y-space-1 text-[10px] text-zinc-400">
          {WEIGHT_ROWS.map((row) => (
            <li key={row.key} className="flex items-center justify-between gap-space-2">
              <span>{row.label}</span>
              <span className="font-bold text-zinc-200">
                %{Math.round(row.value * 100)}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-space-2 rounded-lg border border-[#22252a] bg-[#0e0f12] px-space-2 py-space-2 text-[10px] text-zinc-500">
          ≥{MUS_THRESHOLDS.autoDraft} otomatik taslak · {MUS_THRESHOLDS.reviewQueue}–
          {MUS_THRESHOLDS.autoDraft - 1} inceleme · tartışılabilirlik &lt;
          {MUS_THRESHOLDS.minControversy} elenir.
        </p>
      </section>

      <section className="rounded-2xl border border-[#22252a] bg-[#16181c] p-space-4">
        <h2 className="text-[11px] font-bold uppercase tracking-wide text-zinc-400">
          Seviye formatları
        </h2>
        <ul className="mt-space-2 space-y-space-2 text-[11px] text-zinc-300">
          <li className="flex justify-between gap-space-2">
            <span>Lise</span>
            <span className="font-semibold">{formatTotalMinutes("lise")} dk</span>
          </li>
          <li className="flex justify-between gap-space-2">
            <span>Üniversite</span>
            <span className="font-semibold">
              {formatTotalMinutes("universite")} dk
            </span>
          </li>
        </ul>
        <p className="mt-space-2 text-[10px] leading-relaxed text-zinc-500">
          Hükümet konuyu savunan, Muhalefet karşı çıkan taraftır. Her aşamada
          iddia, gerekçe, kaynaklı kanıt ve etki alanları zorunludur.
        </p>
      </section>

      <section className="rounded-2xl border border-[#22252a] bg-[#16181c] p-space-4">
        <h2 className="text-[11px] font-bold uppercase tracking-wide text-zinc-400">
          {dict.shell.debateArchive}
        </h2>
        <Link
          href={`/${lang}/munazara/arsiv`}
          className="mt-space-2 inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-[#22252a] bg-white/5 px-space-3 text-[12px] font-semibold text-zinc-200 transition hover:bg-white/10"
        >
          {dict.shell.debateArchive}
          <span aria-hidden="true" className="ml-space-1">
            →
          </span>
        </Link>
        <p className="mt-space-2 text-[10px] leading-relaxed text-zinc-500">
          {dict.shell.debateArchiveHint}
        </p>
      </section>

      <p className="rounded-2xl border border-[#22252a] bg-[#16181c] px-space-4 py-space-3 text-[10px] leading-relaxed text-zinc-500">
        {dict.shell.transparencyBody}
      </p>
    </div>
  );
}
