import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DebateBehaviors } from "@/components/debate/DebateBehaviors";
import { DebateSides } from "@/components/debate/DebateSides";
import { DebateStepper } from "@/components/debate/DebateStepper";
import { levelBadgeClass } from "@/components/debate/DebateCard";
import { OfflineSaver } from "@/components/OfflineSaver";
import { ReadingToolbar } from "@/components/ReadingToolbar";
import { SaveButton } from "@/components/SaveButton";
import { ShareButton } from "@/components/ShareButton";
import { StickyTitle } from "@/components/content/StickyTitle";
import { ListenControls } from "@/components/media/ListenControls";
import {
  AlertTriangleIcon,
  CheckIcon,
  ExternalLinkIcon,
  QuoteIcon,
  SparklesIcon,
} from "@/components/icons";
import { getDictionary } from "@/lib/i18n";
import { isLocale, type Locale } from "@/lib/i18n-config";
import { badgeClassesFor } from "@/lib/categories";
import { formatDate, formatDateTime } from "@/lib/datetime";
import { DEBATE_LEVEL_LABELS } from "@/lib/debate/config";
import {
  SIDE_LABELS,
  formatTotalMinutes,
  stagesForLevel,
} from "@/lib/debate/format";
import { getDebateDetail } from "@/lib/debate/query";
import { buildDebateSpeechBundle } from "@/lib/debate/speech";
import { estimateSeconds } from "@/lib/speech-text";
import { motionTypeLabel, scopeLabel } from "@/lib/debate/types";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ lang: string; slug: string }> };

function siteBase(): string {
  return (process.env.SITE_URL || "http://localhost:3000").replace(
    /\/+$/,
    "",
  );
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { lang: rawLang, slug } = await params;
  const lang = isLocale(rawLang) ? rawLang : "tr";
  const debate = await getDebateDetail(lang, slug);

  if (!debate) {
    return { title: undefined, robots: { index: false, follow: false } };
  }

  const base = siteBase();
  const url = `${base}${debate.href}`;

  return {
    title: debate.title,
    description: debate.motionText,
    alternates: {
      canonical: debate.href,
      languages: {
        "tr-TR": `/tr/munazara/${debate.slug}`,
        en: `/en/munazara/${debate.slug}`,
        "x-default": `/tr/munazara/${debate.slug}`,
      },
    },
    openGraph: {
      type: "article",
      title: debate.title,
      description: debate.motionText,
      url,
      siteName: "TCFH News",
      locale: lang === "tr" ? "tr_TR" : "en_US",
      publishedTime: debate.publishedAt,
      modifiedTime: debate.updatedAt,
    },
    twitter: {
      card: "summary",
      title: debate.title,
      description: debate.motionText,
    },
  };
}

export default async function DebateDetailPage({ params }: PageProps) {
  const { lang: rawLang, slug } = await params;
  if (!isLocale(rawLang)) notFound();
  const lang: Locale = rawLang;

  const [dict, debate] = await Promise.all([
    getDictionary(lang),
    getDebateDetail(lang, slug),
  ]);

  if (!debate) notFound();

  const stages = stagesForLevel(debate.level);
  const speech = buildDebateSpeechBundle(debate, lang);
  const listenMinutes = Math.max(
    1,
    Math.round(estimateSeconds(speech.full.sentences.join(" ")) / 60),
  );

  const t = dict.shell;
  const url = `${siteBase()}${debate.href}`;

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: debate.title,
    description: debate.motionText,
    datePublished: debate.publishedAt,
    dateModified: debate.updatedAt,
    inLanguage: "tr-TR",
    articleSection: debate.category,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    author: { "@type": "Organization", name: "TCFH News" },
    publisher: { "@type": "Organization", name: "TCFH News" },
    citation: debate.sources.map((source) => ({
      "@type": "CreativeWork",
      name: source.title,
      url: source.url,
      publisher: source.name,
      datePublished: source.publishedAt ?? undefined,
    })),
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Ana sayfa",
        item: `${siteBase()}/${lang}`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Münazara",
        item: `${siteBase()}/${lang}/munazara`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: debate.title,
        item: url,
      },
    ],
  };

  const SourceRef = ({ index }: { index?: number }) => {
    if (!index || index < 1 || index > debate.sources.length) return null;
    return (
      <a
        href={`#kaynak-${index}`}
        aria-label={`${dict.content.source} ${index}`}
        className="ml-space-1 align-super t-label font-bold text-violet-400 hover:text-violet-300"
      >
        [{index}]
      </a>
    );
  };

  return (
    <article className="px-space-3 pb-space-9 pt-space-3 sm:px-space-5">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <OfflineSaver url={debate.href} />
      <DebateBehaviors
        contentKey={`munazara:${debate.slug}`}
        id={debate.id}
      />
      <StickyTitle
        title={debate.title}
        backLabel={dict.content.backToFeed}
        backHref={`/${lang}/munazara`}
      />

      <div className="measure">
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
                href={`/${lang}/munazara`}
                className="hover:text-zinc-300"
              >
                Münazara
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li className="truncate text-zinc-400">{debate.title}</li>
          </ol>
        </nav>

        {/* 1) Üst bilgi */}
        <div className="flex flex-wrap items-center gap-space-2">
          <span
            className={`inline-flex items-center gap-space-1 rounded-full border px-space-2 py-space-1 t-label font-bold uppercase tracking-wide ${levelBadgeClass(debate.level)}`}
          >
            <SparklesIcon className="h-3 w-3" aria-hidden="true" />
            {DEBATE_LEVEL_LABELS[debate.level]}
          </span>
          <span className={`chip ${badgeClassesFor(debate.category)}`}>
            {debate.category}
          </span>
          <span className="rounded-full border border-[#22252a] bg-[#16181c] px-space-2 py-space-1 t-label font-semibold text-zinc-300">
            {motionTypeLabel(debate.motionType)} · {scopeLabel(debate.motionScope)}
          </span>
          <span className="inline-flex items-center gap-space-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-space-2 py-space-1 t-label font-semibold text-emerald-400">
            <CheckIcon className="h-3 w-3" aria-hidden="true" />
            {t.debateVerified.replace("{count}", String(debate.sourceCount))}
          </span>
        </div>

        <h1 className="t-h1 mt-space-3 text-zinc-50">
          {debate.title}
        </h1>

        <div className="mt-space-2 flex flex-wrap items-center gap-x-space-3 gap-y-space-1 text-[11px] text-zinc-500">
          <time dateTime={debate.publishedAt}>
            {formatDateTime(debate.publishedAt, lang)}
          </time>
          <span aria-hidden="true">·</span>
          <span>
            {t.debateReading.replace(
              "{minutes}",
              String(debate.readingMinutes),
            )}
          </span>
          <span aria-hidden="true">·</span>
          <span>
            {t.debateListening.replace("{minutes}", String(listenMinutes))}
          </span>
          {debate.updatedAt !== debate.publishedAt ? (
            <>
              <span aria-hidden="true">·</span>
              <span>
                {t.debateUpdated}: {formatDate(debate.updatedAt, lang)}
              </span>
            </>
          ) : null}
          <span aria-hidden="true">·</span>
          <span>
            {t.debateFormat}: {formatTotalMinutes(debate.level)} dk ·{" "}
            {stages.length} {lang === "tr" ? "aşama" : "stages"}
          </span>
        </div>

        {/* 13) Sesli okuma */}
        <ListenControls
          bundle={speech}
          labels={{
            summary: dict.content.listenSummary,
            full: dict.content.listenFull,
            playing: dict.content.listenPlaying,
            paused: dict.content.listenPaused,
            unsupported: dict.content.speechUnsupported,
            noVoice: dict.content.speechNoVoice,
            resume: dict.content.resumeTitle,
            resumeBody: dict.content.resumeBody,
            dismiss: dict.content.dismiss,
            deviceOnly: dict.content.speechDeviceOnly,
          }}
        />

        <div className="mt-space-3 flex items-center gap-space-1">
          <ShareButton
            title={debate.title}
            url={debate.href}
            labels={{
              share: dict.card.share,
              copied: dict.card.copied,
              shareError: dict.card.shareError,
            }}
          />
          <SaveButton
            variant="button"
            bookmark={{
              id: `munazara:${debate.slug}`,
              title: debate.title,
              url: debate.href,
              category: debate.category,
            }}
            labels={{ save: dict.card.save, saved: dict.card.saved }}
            className="!px-space-3 !py-space-2 text-xs"
          />
        </div>

        <div className="mt-space-2">
          <ReadingToolbar labels={dict.reading} />
        </div>

        {/* 2) Motion */}
        <section
          aria-labelledby="motion"
          className="mt-space-4 rounded-2xl border border-violet-500/25 bg-violet-500/[0.07] px-space-4 py-space-4"
        >
          <h2
            id="motion"
            className="t-label font-bold uppercase tracking-wide text-violet-300"
          >
            Motion
          </h2>
          <p className="mt-space-1 text-[17px] font-bold leading-snug text-zinc-100">
            {debate.motionText}
          </p>
          {debate.levelNote ? (
            <p className="mt-space-2 t-label leading-relaxed text-zinc-500">
              {t.debateLevelNote}: {debate.levelNote}
            </p>
          ) : null}
        </section>

        {/* 3) Neden gündemde */}
        {debate.whyNow.length > 0 ? (
          <section aria-labelledby="why-now" className="mt-section-gap">
            <h2
              id="why-now"
              className="section-title"
            >
              {t.debateWhyNow}
            </h2>
            <ul className="mt-space-2 space-y-space-2">
              {debate.whyNow.map((item, index) => (
                <li
                  key={index}
                  className="flex gap-space-3 rounded-xl border border-[#22252a] bg-[#16181c] px-space-3 py-space-3 t-body text-zinc-300"
                >
                  <span
                    aria-hidden="true"
                    className="mt-space-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-violet-500/15 t-label font-bold text-violet-300"
                  >
                    {index + 1}
                  </span>
                  <span>
                    {item.text}
                    <SourceRef index={item.sourceIndex} />
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* 4) Taraflar */}
        <section aria-labelledby="sides" className="mt-section-gap">
          <h2
            id="sides"
            className="section-title"
          >
            {t.debateSides}
          </h2>
          <p className="mt-space-1 text-[11px] leading-relaxed text-zinc-500">
            {SIDE_LABELS.government}: {lang === "tr" ? "konuyu savunan taraf" : "the side defending the motion"} ·{" "}
            {SIDE_LABELS.opposition}: {lang === "tr" ? "karşı taraf" : "the side opposing it"}.
          </p>
          <div className="mt-space-2">
            <DebateSides
              government={debate.governmentThesis.map((item) => item.text)}
              opposition={debate.oppositionThesis.map((item) => item.text)}
              governmentLabel={t.debateGovernment}
              oppositionLabel={t.debateOpposition}
              ariaLabel={t.debateSides}
            />
          </div>
        </section>

        {/* 5) Kilit çatışmalar */}
        {debate.keyClash.length > 0 ? (
          <section aria-labelledby="key-clashes" className="mt-section-gap">
            <h2
              id="key-clashes"
              className="section-title"
            >
              {t.debateClash}
            </h2>
            <ol className="mt-space-2 space-y-space-2">
              {debate.keyClash.map((clash, index) => (
                <li
                  key={index}
                  className="rounded-xl border border-[#22252a] bg-[#16181c] px-space-3 py-space-3"
                >
                  <p className="text-[13px] font-bold text-zinc-100">
                    {index + 1}. {clash.title}
                  </p>
                  <dl className="mt-space-2 space-y-space-1 text-[12px] leading-relaxed">
                    <div className="flex gap-space-2">
                      <dt className="w-20 shrink-0 t-label font-bold uppercase tracking-wide text-emerald-400">
                        {t.debateGovernment}
                      </dt>
                      <dd className="text-zinc-300">{clash.government}</dd>
                    </div>
                    <div className="flex gap-space-2">
                      <dt className="w-20 shrink-0 t-label font-bold uppercase tracking-wide text-rose-400">
                        {t.debateOpposition}
                      </dt>
                      <dd className="text-zinc-300">{clash.opposition}</dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        {/* 6) İspat yükü */}
        <section aria-labelledby="burdens" className="mt-section-gap">
          <h2
            id="burdens"
            className="section-title"
          >
            {t.debateBurdens}
          </h2>
          <div className="mt-space-2 grid gap-space-2 sm:grid-cols-2">
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] px-space-3 py-space-3">
              <h3 className="t-label font-bold uppercase tracking-wide text-emerald-400">
                {t.debateGovernment}
              </h3>
              <ul className="mt-space-1 list-disc space-y-space-1 pl-space-4 text-[12px] leading-relaxed text-zinc-300">
                {debate.burdens.government.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/[0.05] px-space-3 py-space-3">
              <h3 className="t-label font-bold uppercase tracking-wide text-rose-400">
                {t.debateOpposition}
              </h3>
              <ul className="mt-space-1 list-disc space-y-space-1 pl-space-4 text-[12px] leading-relaxed text-zinc-300">
                {debate.burdens.opposition.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* 7) Münazara akışı */}
        <section aria-labelledby="debate-flow" className="mt-section-gap">
          <h2
            id="debate-flow"
            className="section-title"
          >
            {t.debateFlow}
          </h2>
          <div className="mt-space-2">
            <DebateStepper
              stages={stages}
              labels={{
                start: t.debateStart,
                pause: t.debatePause,
                resume: t.debateResume,
                reset: t.debateReset,
                next: t.debateNext,
                previous: t.debatePrev,
                done: t.debateDone,
                timeUp: t.debateTimeUp,
                required: t.debateRequired,
                speaker: t.debateSpeaker,
                task: t.debateTask,
                output: t.debateOutput,
                timer: t.debateTimer,
              }}
            />
          </div>
          <p className="mt-space-2 t-label leading-relaxed text-zinc-500">
            {t.debateNoSubmission}
          </p>
        </section>

        {/* 8) Kanıt havuzu */}
        {debate.sources.length > 0 ? (
          <section
            aria-labelledby="sources"
            className="mt-section-gap overflow-hidden rounded-2xl border border-[#22252a] bg-[#16181c]"
          >
            <h2
              id="sources"
              className="border-b border-[#22252a] px-space-4 py-space-3 text-sm font-bold text-zinc-100"
            >
              {t.debateEvidence}
            </h2>
            <ol className="divide-y divide-[#22252a]">
              {debate.sources.map((source, index) => (
                <li
                  key={source.id}
                  id={`kaynak-${index + 1}`}
                  className="flex items-start gap-space-3 px-space-4 py-space-3"
                >
                  <span className="mt-space-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#22252a] t-label font-bold text-zinc-400">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold leading-snug text-zinc-200">
                      {source.title}
                    </p>
                    <p className="mt-space-1 flex flex-wrap items-center gap-x-space-2 gap-y-space-1 t-label text-zinc-500">
                      <span className="font-semibold text-zinc-400">
                        {source.name}
                      </span>
                      {source.publishedAt ? (
                        <time dateTime={source.publishedAt}>
                          {formatDate(source.publishedAt, lang)}
                        </time>
                      ) : null}
                    </p>
                    {source.supports ? (
                      <p className="mt-space-1 rounded-lg bg-[#0e0f12] px-space-2 py-space-1 text-[11px] leading-relaxed text-zinc-400">
                        <span className="font-semibold text-zinc-300">
                          {t.debateSupports}:
                        </span>{" "}
                        {source.supports}
                      </p>
                    ) : null}
                  </div>
                  {source.url ? (
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      aria-label={`${source.name} — ${dict.content.openSource}`}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-zinc-500 transition hover:bg-white/10 hover:text-zinc-100"
                    >
                      <ExternalLinkIcon className="h-4 w-4" />
                    </a>
                  ) : null}
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        {/* 9) Çürütmeler */}
        {debate.keyClash.length > 0 ? (
          <section aria-labelledby="rebuttals" className="mt-section-gap">
            <h2
              id="rebuttals"
              className="section-title"
            >
              {t.debateRebuttal}
            </h2>
            <ul className="mt-space-2 space-y-space-2">
              {debate.keyClash.map((clash, index) => (
                <li
                  key={index}
                  className="rounded-xl border border-[#22252a] bg-[#16181c] px-space-3 py-space-3"
                >
                  <p className="flex items-start gap-space-2 text-[12px] font-bold text-zinc-100">
                    <QuoteIcon
                      className="mt-space-1 h-3.5 w-3.5 shrink-0 text-violet-400"
                      aria-hidden="true"
                    />
                    {clash.title}
                  </p>
                  <p className="mt-space-1 text-[12px] leading-relaxed text-zinc-300">
                    {clash.rebuttal}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {debate.conflictNote ? (
          <aside className="mt-section-gap rounded-2xl border border-amber-500/30 bg-amber-500/10 px-space-4 py-space-3">
            <p className="flex items-center gap-space-2 text-[11px] font-bold uppercase tracking-wide text-amber-400">
              <AlertTriangleIcon className="h-3.5 w-3.5" aria-hidden="true" />
              {t.debateConflict}
            </p>
            <p className="mt-space-1 t-meta leading-relaxed text-amber-100/90">
              {debate.conflictNote}
            </p>
          </aside>
        ) : null}

        {/* 10) SSS */}
        {debate.faqs.length > 0 ? (
          <section aria-labelledby="faq" className="mt-section-gap">
            <h2
              id="faq"
              className="section-title"
            >
              {t.debateFaq}
            </h2>
            <div className="mt-space-2 space-y-space-2">
              {debate.faqs.map((faq, index) => (
                <details
                  key={index}
                  className="rounded-xl border border-[#22252a] bg-[#16181c] px-space-3 py-space-3"
                >
                  <summary className="min-h-[32px] cursor-pointer list-none text-[13px] font-semibold text-zinc-200">
                    {faq.question}
                  </summary>
                  <p className="mt-space-2 t-meta leading-relaxed text-zinc-400">
                    {faq.answer}
                  </p>
                </details>
              ))}
            </div>
          </section>
        ) : null}

        {/* 11) Terimler */}
        {debate.glossary.length > 0 ? (
          <section aria-labelledby="glossary" className="mt-section-gap">
            <h2
              id="glossary"
              className="section-title"
            >
              {t.debateGlossary}
            </h2>
            <dl className="mt-space-2 space-y-space-2">
              {debate.glossary.map((item) => (
                <div
                  key={item.term}
                  className="rounded-xl border border-[#22252a] bg-[#16181c] px-space-3 py-space-2"
                >
                  <dt className="text-[12px] font-bold text-zinc-200">
                    {item.term}
                  </dt>
                  <dd className="text-[12px] leading-relaxed text-zinc-400">
                    {item.definition}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}

        {/* 12) Şeffaflık + AI uyarısı */}
        <section
          aria-labelledby="methodology"
          className="mt-section-gap rounded-2xl border border-[#22252a] bg-[#16181c] px-space-4 py-space-3"
        >
          <h2
            id="methodology"
            className="t-label font-bold uppercase tracking-wide text-zinc-500"
          >
            {dict.content.methodology}
          </h2>
          <p className="mt-space-1 text-[11px] leading-relaxed text-zinc-400">
            {dict.content.methodologyBody
              .replace("{count}", String(debate.sources.length))
              .replace("{date}", formatDate(debate.updatedAt, lang))}
          </p>
          {debate.musReason ? (
            <p className="mt-space-2 rounded-lg bg-[#0e0f12] px-space-2 py-space-2 t-label leading-relaxed text-zinc-500">
              MUS: {debate.musReason}
            </p>
          ) : null}
        </section>

        <p className="mt-space-4 flex items-start gap-space-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.08] px-space-4 py-space-3 text-[11px] leading-relaxed text-amber-300">
          <AlertTriangleIcon
            className="mt-space-1 h-3.5 w-3.5 shrink-0"
            aria-hidden="true"
          />
          {dict.content.aiWarning}
        </p>
      </div>
    </article>
  );
}
