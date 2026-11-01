import Link from "next/link";
import { Fragment } from "react";
import {
  AlertTriangleIcon,
  CheckIcon,
  ExternalLinkIcon,
  QuoteIcon,
  SparklesIcon,
} from "@/components/icons";
import { CitationLink } from "@/components/citations/CitationLink";
import { ContentBehaviors } from "@/components/content/ContentBehaviors";
import { RemoveNewsButton } from "@/components/RemoveNewsButton";
import { ReportButton } from "@/components/ReportButton";
import { SourceComparison } from "@/components/content/SourceComparison";
import { ListenControls } from "@/components/media/ListenControls";
import { ReadingToolbar } from "@/components/ReadingToolbar";
import { SaveButton } from "@/components/SaveButton";
import { ShareButton } from "@/components/ShareButton";
import { StickyTitle } from "@/components/content/StickyTitle";
import { TimeAgo } from "@/components/TimeAgo";
import { formatDate, formatDateTime } from "@/lib/datetime";
import type { Dictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n-config";
import { badgeClassesFor } from "@/lib/categories";
import type { ContentItem } from "@/lib/content";
import { annotateText } from "@/lib/citations";
import type {
  CitationAnchor,
  CitationLabels,
} from "@/lib/citation-types";
import type { SpeechBundle } from "@/lib/speech-text";

type Props = {
  content: ContentItem;
  lang: Locale;
  dict: Dictionary;
  speechBundle: SpeechBundle;
  listenMinutes: number;
  /** Sunucuda doğrulanmış sahip oturumu (moderasyon düğmesi). */
  canModerate?: boolean;
};

/**
 * İçerik şablonu (portre + haber ortak): 8 bölümlü gövde, sesli okuma
 * başlığın hemen altında, görünür AI uyarısı ve kaynak listesi.
 * Veri yoksa ilgili bölüm hiç render edilmez.
 */
export function ContentArticle({
  content,
  lang,
  dict,
  speechBundle,
  listenMinutes,
  canModerate = false,
}: Props) {
  const t = dict.content;
  // FAZ 1 — güven etiketleri (yapay zekâ île özetlendi / son güncelleme / hata bildir).
  const trust = dict.trust;
  const citationLabels = dict.citations;
  // Atıf hedefleri içerik başına yalnızca bir kez işaretlenir.
  const usedCitations = new Set<string>();

  const Annotated = ({ text }: { text: string }) => (
    <AnnotatedText
      text={text}
      anchors={content.citations}
      used={usedCitations}
      labels={citationLabels}
      lang={lang}
    />
  );

  const subjectLabel =
    content.subjectType === "kisi"
      ? t.subjectPerson
      : content.subjectType === "kurum"
        ? t.subjectOrganization
        : content.subjectType === "olay"
          ? t.subjectEvent
          : null;

  const savedUrl = content.href;

  const Citation = ({ index }: { index?: number }) => {
    if (!index || index < 1 || index > content.sources.length) return null;
    const source = content.sources[index - 1];

    return (
      <a
        href={`#kaynak-${index}`}
        aria-label={`${t.source} ${index}: ${source.name}`}
        className="ml-space-1 align-super t-label font-bold text-violet-400 hover:text-violet-300"
      >
        [{index}]
      </a>
    );
  };

  return (
    <article className="px-space-3 pb-space-9 pt-space-3 sm:px-space-5">
      <ContentBehaviors
        contentKey={`${content.kind}:${content.slug}`}
        kind={content.kind}
        id={content.id}
      />
      <StickyTitle
        title={content.title}
        backLabel={t.backToFeed}
        backHref={`/${lang}`}
      />

      <div className="measure">
        {/* Breadcrumb */}
        <nav aria-label="breadcrumb" className="mb-space-3">
          <ol className="flex flex-wrap items-center gap-space-2 text-[11px] text-zinc-500">
            <li>
              <Link href={`/${lang}`} className="hover:text-zinc-300">
                {dict.breadcrumb.home}
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link
                href={`/${lang}/kategori/${encodeURIComponent(content.category)}`}
                className="hover:text-zinc-300"
              >
                {content.category}
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li className="truncate text-zinc-400">
              {content.kind === "portre" ? t.portrait : t.news}
            </li>
          </ol>
        </nav>

        {/* Rozet satırı */}
        <div className="flex flex-wrap items-center gap-space-2">
          <span className={`chip ${badgeClassesFor(content.category)}`}>
            {content.category}
          </span>

          {content.kind === "portre" ? (
            <span className="inline-flex items-center gap-space-1 rounded-full border border-violet-500/30 bg-violet-500/10 px-space-3 py-space-1 t-label font-bold uppercase tracking-wide text-violet-300">
              <SparklesIcon className="h-3 w-3" />
              {t.portrait}
            </span>
          ) : null}

          {subjectLabel ? (
            <span className="rounded-full border border-[#22252a] bg-[#16181c] px-space-3 py-space-1 t-label font-semibold text-zinc-300">
              {subjectLabel}
              {content.subjectName ? `: ${content.subjectName}` : ""}
            </span>
          ) : null}

          {/* FAZ 1.4 — rozet DOĞRULANMIŞ kaynak sayısını gösterir; ham kayıt
              sayısı (sourceCount) medya grubu tekilleştirmesi içermez. */}
          {content.verifiedSourceCount > 1 ? (
            <span className="inline-flex items-center gap-space-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-space-3 py-space-1 t-label font-semibold text-emerald-400">
              <CheckIcon className="h-3 w-3" />
              {t.verified.replace("{count}", String(content.verifiedSourceCount))}
            </span>
          ) : content.verifiedSourceCount === 1 ? (
            <span
              className="inline-flex items-center gap-space-1 rounded-full border border-amber-500/25 bg-amber-500/10 px-space-3 py-space-1 t-label font-semibold text-amber-400"
              title={t.singleSourceHint ?? ""}
            >
              {t.singleSource}
            </span>
          ) : null}
        </div>

        {/* Başlık */}
        <h1 className="t-h1 mt-spot-meta text-zinc-50">
          {content.title}
        </h1>

        {/* FAZ 1.1 — "Yapay zekâ ile özetlendi · Son güncelleme" */}
        {content.aiGenerated ? (
          <p className="mt-space-2 flex flex-wrap items-center gap-x-space-2 gap-y-space-1 text-[11px] text-zinc-500">
            <span className="inline-flex items-center gap-space-1 rounded-full border border-violet-500/25 bg-violet-500/10 px-space-2 py-space-1 font-semibold text-violet-300">
              <span aria-hidden="true">✦</span>
              {trust.aiGenerated}
            </span>
            {content.updatedAt ? (
              <time dateTime={content.updatedAt}>
                {trust.lastUpdated.replace(
                  "{date}",
                  formatDateTime(content.updatedAt, lang),
                )}
              </time>
            ) : null}
          </p>
        ) : null}

        {/* Meta */}
        <div className="mt-space-2 flex flex-wrap items-center gap-x-space-3 gap-y-space-1 text-[11px] text-zinc-500">
          {content.publishedAt ? (
            <>
              <time dateTime={content.publishedAt}>
                {formatDateTime(content.publishedAt, lang)}
              </time>
              <span aria-hidden="true">·</span>
              <TimeAgo date={content.publishedAt} locale={lang} />
              <span aria-hidden="true">·</span>
            </>
          ) : null}
          <span>{t.readingTime.replace("{minutes}", String(content.readingMinutes))}</span>
          <span aria-hidden="true">·</span>
          <span>{t.listeningTime.replace("{minutes}", String(listenMinutes))}</span>
          {content.updatedAt && content.updatedAt !== content.publishedAt ? (
            <>
              <span aria-hidden="true">·</span>
              <span>
                {t.updated}: {formatDate(content.updatedAt, lang)}
              </span>
            </>
          ) : null}
        </div>

        {/* Sesli okuma — başlığın hemen altında */}
        <ListenControls
          bundle={speechBundle}
          labels={{
            summary: t.listenSummary,
            full: t.listenFull,
            playing: t.listenPlaying,
            paused: t.listenPaused,
            unsupported: t.speechUnsupported,
            noVoice: t.speechNoVoice,
            resume: t.resumeTitle,
            resumeBody: t.resumeBody,
            dismiss: t.dismiss,
            deviceOnly: t.speechDeviceOnly,
          }}
        />

        {/* Eylemler */}
        <div className="mt-spot-meta flex items-center gap-space-1">
          <ShareButton
            title={content.title}
            url={savedUrl}
            labels={{
              share: dict.card.share,
              copied: dict.card.copied,
              shareError: dict.card.shareError,
            }}
          />
          <SaveButton
            variant="button"
            bookmark={{
              id: `${content.kind}:${content.slug}`,
              title: content.title,
              url: savedUrl,
              category: content.category,
            }}
            labels={{ save: dict.card.save, saved: dict.card.saved }}
            className="!px-space-3 !py-space-2 t-meta"
          />
        </div>

        {/* Okuma araçları: A- / A+, satır aralığı, sade okuma */}
        <div className="mt-space-2">
          <ReadingToolbar labels={dict.reading} />
        </div>

        {content.kind === "haber" ? (
          <div className="mt-space-1 flex justify-end">
            <RemoveNewsButton
              newsId={content.id}
              labels={dict.moderation}
              canModerate={canModerate}
              variant="page"
            />
          </div>
        ) : null}

        {/* Kapak */}
        {content.coverImageUrl ? (
          <figure className="mt-space-4 overflow-hidden rounded-2xl border border-[#22252a] bg-[#0e0f12]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={content.coverImageUrl}
              alt={content.coverImageAlt}
              width={1200}
              height={675}
              referrerPolicy="no-referrer"
              className="aspect-video w-full object-cover"
            />
            {content.coverImageCaption || content.coverImageCredit ? (
              <figcaption className="px-space-3 py-space-2 t-label leading-snug text-zinc-500">
                {content.coverImageCaption}
                {content.coverImageCredit ? (
                  <span className="block text-zinc-600">
                    {t.coverCredit}: {content.coverImageCredit}
                  </span>
                ) : null}
              </figcaption>
            ) : null}
          </figure>
        ) : null}

        {/* Tek cümlede */}
        {content.subtitle ? (
          <div className="mt-space-4 rounded-2xl border border-violet-500/25 bg-violet-500/[0.07] px-space-4 py-space-3">
            <p className="t-label font-bold uppercase tracking-wide text-violet-300">
              {t.oneSentence}
            </p>
            <p className="speakable-summary mt-space-1 t-body font-semibold text-zinc-100">
              <Annotated text={content.subtitle} />
            </p>
          </div>
        ) : null}

        {/* 1) Neden gündemde */}
        {content.whyNow.length > 0 ? (
          <section aria-labelledby="why-now" className="mt-section-gap">
            <h2
              id="why-now"
              className="section-title"
            >
              {t.whyNow}
            </h2>
            <ul className="mt-space-2 space-y-space-2">
              {content.whyNow.map((item, index) => (
                <li
                  key={index}
                  className="flex gap-space-3 rounded-xl border border-[#22252a] bg-[#16181c] px-space-3 py-space-3 t-body text-zinc-300"
                >
                  <span
                    aria-hidden="true"
                    className="mt-title-spot flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-violet-500/15 t-label font-bold text-violet-300"
                  >
                    {index + 1}
                  </span>
                  <span>
                    <Annotated text={item.text} />
                    <Citation index={item.sourceIndex} />
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* 2) Kronoloji */}
        {content.timeline.length >= 2 ? (
          <section aria-labelledby="timeline" className="mt-section-gap">
            <h2
              id="timeline"
              className="section-title"
            >
              {t.timeline}
            </h2>
            <ol className="mt-spot-meta space-y-space-0">
              {content.timeline.map((item, index) => (
                <li key={index} className="relative flex gap-space-3 pb-space-3 last:pb-space-0">
                  <span
                    aria-hidden="true"
                    className="absolute left-space-1 top-3 h-full w-px bg-[#22252a]"
                  />
                  <span
                    aria-hidden="true"
                    className="relative mt-title-spot h-2.5 w-2.5 shrink-0 rounded-full border-2 border-violet-500 bg-[#0e0f12]"
                  />
                  <div className="min-w-0 flex-1">
                    <time
                      dateTime={item.date}
                      className="t-label font-bold uppercase tracking-wide text-violet-300"
                    >
                      {formatDate(item.date, lang)}
                    </time>
                    <p className="t-body text-zinc-300">
                      <Annotated text={item.text} />
                      <Citation index={item.sourceIndex} />
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        {/* 3) Bilinmesi gerekenler */}
        {content.keyFacts.length > 0 ? (
          <section aria-labelledby="key-facts" className="mt-section-gap">
            <h2
              id="key-facts"
              className="section-title"
            >
              {t.keyFacts}
            </h2>
            <ul className="mt-space-2 space-y-space-2">
              {content.keyFacts.map((item, index) => (
                <li
                  key={index}
                  className="flex gap-inline t-body text-zinc-300"
                >
                  <CheckIcon className="mt-space-1 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                  <span>
                    <Annotated text={item.text} />
                    <Citation index={item.sourceIndex} />
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Ayrıntılar (haber gövdesi) */}
        {content.bodyMarkdown ? (
          <section aria-labelledby="details" className="mt-section-gap">
            <h2
              id="details"
              className="section-title"
            >
              {t.details}
            </h2>
            <div className="article-body mt-space-2 space-y-space-4 text-zinc-200">
              <MarkdownBlocks
                content={content.bodyMarkdown}
                citations={content.citations}
                used={usedCitations}
                labels={citationLabels}
                lang={lang}
              />
            </div>
          </section>
        ) : null}

        {/* 4) Alıntı */}
        {content.quote ? (
          <figure className="mt-section-gap surface-card.5">
            <QuoteIcon className="h-4 w-4 text-violet-400" />
            <blockquote className="mt-title-spot text-[15px] font-medium italic leading-relaxed text-zinc-100">
              “{content.quote.text}”
              <Citation index={content.quote.sourceIndex} />
            </blockquote>
            <figcaption className="mt-space-2 text-[11px] text-zinc-500">
              <span className="font-semibold text-zinc-300">
                {content.quote.speaker}
              </span>
              {content.quote.date ? (
                <span> · {formatDate(content.quote.date, lang)}</span>
              ) : null}
            </figcaption>
          </figure>
        ) : null}

        {/* Kaynaklar çelişiyor */}
        {content.conflictNote ? (
          <aside className="mt-section-gap rounded-2xl border border-amber-500/30 bg-amber-500/10 px-space-4 py-space-3">
            <p className="flex items-center gap-space-2 text-[11px] font-bold uppercase tracking-wide text-amber-400">
              <AlertTriangleIcon className="h-3.5 w-3.5" />
              {t.conflict}
            </p>
            <p className="mt-space-1 t-meta leading-relaxed text-amber-100/90">
              {content.conflictNote}
            </p>
          </aside>
        ) : null}

        {/* 5) Sık sorulanlar */}
        {content.faqs.length > 0 ? (
          <section aria-labelledby="faqs" className="mt-section-gap">
            <h2
              id="faqs"
              className="section-title"
            >
              {t.faq}
            </h2>
            <div className="mt-space-2 space-y-space-2">
              {content.faqs.map((faq, index) => (
                <details
                  key={index}
                  className="rounded-xl border border-[#22252a] bg-[#16181c] px-space-3 py-space-3"
                >
                  <summary className="cursor-pointer list-none t-meta font-semibold text-zinc-200">
                    {faq.question}
                  </summary>
                  <p className="mt-title-spot t-meta leading-relaxed text-zinc-400">
                    <Annotated text={faq.answer} />
                    <Citation index={faq.sourceIndex} />
                  </p>
                </details>
              ))}
            </div>
          </section>
        ) : null}

        {/* 6) Kaynaklar */}
        {content.sources.length > 0 ? (
          <section
            aria-labelledby="sources"
            className="mt-section-gap overflow-hidden rounded-2xl border border-[#22252a] bg-[#16181c]"
          >
            <h2
              id="sources"
              className="border-b border-[#22252a] px-space-4 py-space-3 t-lead font-bold text-zinc-100"
            >
              {t.sources}
            </h2>
            <ol className="divide-y divide-[#22252a]">
              {content.sources.map((source, index) => (
                <li
                  key={`${source.url}-${index}`}
                  id={`kaynak-${index + 1}`}
                  className="flex items-start gap-space-3 px-space-4 py-space-3"
                >
                  <span className="mt-title-spot flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#22252a] t-label font-bold text-zinc-400">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="t-meta font-semibold leading-snug text-zinc-200">
                      {source.title || source.name}
                    </p>
                    <p className="mt-title-spot flex flex-wrap items-center gap-x-space-2 gap-y-space-1 t-label text-zinc-500">
                      <span className="font-semibold text-zinc-400">
                        {source.name}
                      </span>
                      {source.publishedAt ? (
                        <time dateTime={source.publishedAt}>
                          {formatDate(source.publishedAt, lang)}
                        </time>
                      ) : null}
                      {source.accessedAt ? (
                        <span>
                          {t.accessed}: {formatDate(source.accessedAt, lang)}
                        </span>
                      ) : null}
                    </p>
                  </div>
                  {source.url ? (
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      aria-label={`${source.name} — ${t.openSource}`}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-zinc-500 transition hover:bg-white/10 hover:text-zinc-100"
                    >
                      <ExternalLinkIcon className="h-4 w-4" />
                    </a>
                  ) : null}
                </li>
              ))}
            </ol>

            {/* 7) Şeffaflık notu */}
            <div className="border-t border-[#22252a] px-space-4 py-space-3">
              <p className="t-label font-bold uppercase tracking-wide text-zinc-500">
                {t.methodology}
              </p>
              <p className="mt-space-1 t-label leading-relaxed text-zinc-400">
                {t.methodologyBody
                  .replace("{count}", String(content.sources.length))
                  .replace(
                    "{date}",
                    formatDate(content.updatedAt ?? content.publishedAt ?? new Date(), lang),
                  )}
              </p>
            </div>
          </section>
        ) : null}

        {/* Görünür AI uyarısı */}
        <p className="mt-space-4 flex items-start gap-inline rounded-xl border border-amber-500/25 bg-amber-500/[0.08] px-card-x py-space-3 t-label leading-relaxed text-amber-300">
          <AlertTriangleIcon className="mt-title-spot h-3.5 w-3.5 shrink-0" />
          {t.aiWarning}
        </p>

        {/* 8) İlgili içerikler */}
        {content.related.length > 0 ? (
          <section aria-labelledby="related" className="reading-hide mt-section-gap">
            <h2
              id="related"
              className="section-title"
            >
              {t.related}
            </h2>
            <ul className="mt-spot-meta grid grid-cols-1 gap-inline sm:grid-cols-2">
              {content.related.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="group flex h-full items-start gap-space-3 rounded-xl border border-[#22252a] bg-[#16181c] p-space-3 transition hover:border-[#31363e]"
                  >
                    {item.imageUrl ? (
                      <span className="relative block h-12 w-16 shrink-0 overflow-hidden rounded-lg border border-[#22252a] bg-[#0e0f12]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.imageUrl}
                          alt=""
                          width={160}
                          height={112}
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      </span>
                    ) : null}
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 block t-meta font-semibold text-zinc-200 group-hover:text-zinc-50">
                        {item.title}
                      </span>
                      <span className="mt-title-spot block t-label text-zinc-500">
                        {item.category} · {item.meta}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* FAZ 2.1 — Kaynakları karşılaştır (yalnızca haberlerde). */}
        {content.kind === "haber" && content.newsId ? (
          <SourceComparison newsId={content.newsId} labels={dict.compare} />
        ) : null}

        {/* FAZ 1.2 — Hata bildir. Yalnızca haberlerde (portrelerde değil:
            portre düzeltmesi editör panelinden yapılır). */}
        {content.kind === "haber" && content.newsId ? (
          <div className="mt-space-6 border-t border-[#22252a] pt-space-4">
            <ReportButton newsId={content.newsId} labels={trust.report} />
          </div>
        ) : null}
      </div>
    </article>
  );
}

// ─── Minimal markdown (bağımlılıksız) ───────────────────────────────────────

const INLINE = /(\*\*[^*]+\*\*)|(\[[^\]]+\]\([^)\s]+\))/g;

function renderInline(text: string): React.ReactNode[] {
  return text.split(INLINE).filter((part) => part !== undefined).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={index} className="font-semibold text-zinc-100">
          {part.slice(2, -2)}
        </strong>
      );
    }

    const match = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
    if (match) {
      const [, label, href] = match;
      const safe = /^https?:\/\//i.test(href) ? href : "#";
      return (
        <a
          key={index}
          href={safe}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="text-blue-400 underline-offset-2 hover:underline"
        >
          {label}
        </a>
      );
    }

    return <span key={index}>{part}</span>;
  });
}

function MarkdownBlocks({
  content,
  citations,
  used,
  labels,
  lang,
}: {
  content: string;
  citations: CitationAnchor[];
  used: Set<string>;
  labels: CitationLabels;
  lang: string;
}) {
  const context = { citations, used, labels, lang };
  const blocks = content.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);

  return (
    <>
      {blocks.map((block, index) => {
        if (block.startsWith("### ")) {
          return (
            <h3 key={index} className="pt-space-2 text-[15px] font-bold text-zinc-100">
              {renderInline(block.slice(4))}
            </h3>
          );
        }

        if (block.startsWith("## ")) {
          return (
            <h2 key={index} className="pt-space-3 text-base font-bold text-zinc-100">
              {renderInline(block.slice(3))}
            </h2>
          );
        }

        const lines = block.split("\n").filter((line) => line.trim());

        if (lines.length > 0 && lines.every((line) => /^[-*]\s+/.test(line.trim()))) {
          return (
            <ul key={index} className="ml-space-1 list-disc space-y-space-2 pl-space-4">
              {lines.map((line, lineIndex) => (
                <li key={lineIndex}>
                  {renderInlineAnnotated(line.replace(/^[-*]\s+/, ""), context)}
                </li>
              ))}
            </ul>
          );
        }

        return <p key={index}>{renderInlineAnnotated(block, context)}</p>;
      })}
    </>
  );
}

/**
 * Satır içi markdown (kalın/bağlantı) + gövde içi atıf işaretlemesi.
 * Atıf ifadeleri markdown'dan ÖNCE ayrıştırılır; böylece atıf metni
 * bölünmez ve bağlantı normal metin akışında kalır.
 */
function renderInlineAnnotated(
  text: string,
  context: {
    citations: CitationAnchor[];
    used: Set<string>;
    labels: CitationLabels;
    lang: string;
  },
): React.ReactNode[] {
  const parts = annotateText(text, context.citations, context.used);

  return parts.flatMap((part, index) => {
    if (part.citation) {
      return [
        <CitationLink
          key={`citation-${index}`}
          anchor={part.citation}
          labels={context.labels}
          lang={context.lang}
        />,
      ];
    }

    return renderInline(part.text).map((node, nodeIndex) => (
      <Fragment key={`inline-${index}-${nodeIndex}`}>{node}</Fragment>
    ));
  });
}

/** Portre bloklarında atıf işaretli düz metin. */
function AnnotatedText({
  text,
  anchors,
  used,
  labels,
  lang,
}: {
  text: string;
  anchors: CitationAnchor[];
  used: Set<string>;
  labels: CitationLabels;
  lang: string;
}) {
  const parts = annotateText(text, anchors, used);

  return (
    <>
      {parts.map((part, index) =>
        part.citation ? (
          <CitationLink
            key={`citation-${index}`}
            anchor={part.citation}
            labels={labels}
            lang={lang}
          />
        ) : (
          <Fragment key={`text-${index}`}>{part.text}</Fragment>
        ),
      )}
    </>
  );
}

