import { LeftRail } from "@/components/layout/LeftRail";
import { MobileSummaryStrip } from "@/components/layout/MobileSummaryStrip";
import { RailSticky } from "@/components/layout/RailSticky";
import { RightRail } from "@/components/layout/RightRail";
import type { RailItem } from "@/components/layout/rail-types";
import type { Dictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n-config";
import type { FeedNewsItem } from "@/lib/news-types";
import type { PortraitCardDto } from "@/lib/portrait-types";

type Props = {
  lang: Locale;
  dict: Dictionary;
  categories: Record<string, string>;
  activeCategorySlug: string;
  summary: RailItem[];
  important: RailItem[];
  portraits: PortraitCardDto[];
  radioItems: FeedNewsItem[];
  /** Sağ kolonu tamamen değiştirmek için (ör. münazara sayfaları). */
  right?: React.ReactNode;
  children: React.ReactNode;
};

/**
 * Üç kolonlu yerleşim iskeleti.
 *
 * <768 px   : tek kolon; sağ kolon içeriği en üstte katlanabilir özet şeridi.
 * 768-1179  : tek okuma kolonu; sağ kolon akışın ALTINDA iki kolonlu widget
 *             ızgarası. Sol kolon üst menüdeki Kategoriler'e katlanır.
 * >=1180 px : 236 / akış / 320; kolon arası 32 px. Sol ve sağ kolon sticky,
 *             kendi kaydırma alanları YOK (kaydırma kilidi oluşmaz).
 */
export function ThreeColumn({
  lang,
  dict,
  categories,
  activeCategorySlug,
  summary,
  important,
  portraits,
  radioItems,
  right,
  children,
}: Props) {
  return (
    <div className="page-shell">
      <div className="layout-grid">
        <aside aria-label={dict.shell.all} className="hidden 3col:block">
          <RailSticky>
            <LeftRail
              lang={lang}
              categories={categories}
              activeSlug={activeCategorySlug}
              labels={{
                search: dict.search.label,
                searchPlaceholder: dict.shell.searchPlaceholder,
                categories: dict.navMain.categories,
                all: dict.shell.all,
                saved: dict.shell.saved,
                debate: dict.shell.debate,
                language: dict.shell.language,
                transparency: dict.shell.transparency,
                transparencyBody: dict.shell.transparencyBody,
                density: dict.preferences.density,
                densityGroup: dict.preferences.densityGroup,
                densityAuto: dict.preferences.densityAuto,
                densityReset: dict.preferences.densityResetAuto,
              }}
            />
          </RailSticky>
        </aside>

        <div className="layout-main">
          <MobileSummaryStrip
            items={summary}
            title={dict.shell.summaryStrip}
            hint={dict.shell.summaryStripHint}
          />
          <h1 className="sr-only">{dict.meta.title}</h1>
          {children}
        </div>

        <aside aria-label={dict.shell.summaryStrip} className="layout-rail hidden md:block">
          <RailSticky>
            {right ?? (
              <RightRail
                lang={lang}
                summary={summary}
                important={important}
                portraits={portraits}
                radioItems={radioItems}
                dict={dict}
              />
            )}
          </RailSticky>
        </aside>
      </div>
    </div>
  );
}
