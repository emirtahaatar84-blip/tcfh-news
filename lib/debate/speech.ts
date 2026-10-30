import type { Locale } from "@/lib/i18n-config";
import type { DebateDetail } from "@/lib/debate/types";
import { motionTypeLabel, scopeLabel } from "@/lib/debate/types";
import { stagesForLevel } from "@/lib/debate/format";
import {
  buildFullDocument,
  buildSummaryDocument,
  type SpeechBundle,
} from "@/lib/speech-text";

/**
 * Münazara sesli okuma paketi.
 *
 * Seslendirme tamamen tarayıcıda (Web Speech API) yapılır; dış TTS servisi,
 * dosya yükleme veya telemetri yoktur. Sunucu yalnızca metni hazırlar.
 */
export function buildDebateSpeechBundle(
  debate: DebateDetail,
  lang: Locale,
): SpeechBundle {
  const contentId = `munazara:${debate.slug}`;
  const url = debate.href;

  const summary = buildSummaryDocument({
    contentId,
    title: debate.title,
    url,
    coverImageUrl: null,
    subtitle: debate.motionText,
    bullets: debate.whyNow.slice(0, 3).map((item) => item.text),
  });

  const sections: { heading: string; paragraphs: string[] }[] = [
    {
      heading: lang === "tr" ? "Konu" : "Motion",
      paragraphs: [debate.motionText],
    },
    {
      heading: lang === "tr" ? "Neden gündemde" : "Why it matters",
      paragraphs: debate.whyNow.map((item) => item.text),
    },
    {
      heading: lang === "tr" ? "Hükümet tezi" : "Government case",
      paragraphs: debate.governmentThesis.map((item) => item.text),
    },
    {
      heading: lang === "tr" ? "Muhalefet tezi" : "Opposition case",
      paragraphs: debate.oppositionThesis.map((item) => item.text),
    },
    {
      heading: lang === "tr" ? "Kilit çatışma noktaları" : "Key clashes",
      paragraphs: debate.keyClash.map(
        (clash) =>
          `${clash.title}. Hükümet: ${clash.government} Muhalefet: ${clash.opposition}`,
      ),
    },
    {
      heading: lang === "tr" ? "İspat yükü" : "Burdens",
      paragraphs: [
        ...debate.burdens.government.map(
          (item) => `${lang === "tr" ? "Hükümet" : "Government"}: ${item}`,
        ),
        ...debate.burdens.opposition.map(
          (item) => `${lang === "tr" ? "Muhalefet" : "Opposition"}: ${item}`,
        ),
      ],
    },
    {
      heading: lang === "tr" ? "Münazara akışı" : "Debate format",
      paragraphs: stagesForLevel(debate.level).map(
        (stage) =>
          `${stage.index}. ${stage.label}, ${Math.round(stage.seconds / 60)} dakika. ${stage.task}`,
      ),
    },
    {
      heading: lang === "tr" ? "Terimler" : "Glossary",
      paragraphs: debate.glossary.map(
        (item) => `${item.term}: ${item.definition}`,
      ),
    },
    {
      heading: lang === "tr" ? "Sık sorulanlar" : "FAQ",
      paragraphs: debate.faqs.map(
        (item) => `${item.question} ${item.answer}`,
      ),
    },
  ].filter((section) => section.paragraphs.length > 0);

  const full = buildFullDocument({
    contentId,
    title: debate.title,
    url,
    coverImageUrl: null,
    subtitle: `${motionTypeLabel(debate.motionType)} · ${scopeLabel(debate.motionScope)} · ${debate.motionText}`,
    sections,
  });

  return { summary, full };
}
