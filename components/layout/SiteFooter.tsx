import Link from "next/link";
import { EmailLink } from "@/components/EmailLink";
import { EmailText } from "@/components/EmailText";
import { locales, type Locale } from "@/lib/i18n-config";

type Props = {
  lang: Locale;
  siteName: string;
  /** İletişim e-postası (env: NEXT_PUBLIC_CONTACT_EMAIL). Yoksa bağlantı gizlenir. */
  contactEmail?: string | null;
  labels: {
    rights: string;
    contact: string;
    links: {
      about: string;
      kvkk: string;
      terms: string;
      copyright: string;
      cookies: string;
    };
    noCookies?: string;
    language?: string;
  };
};

/** Alt bilgi: yasal bağlantılar + "çerez kullanılmaz" notu. */
export function SiteFooter({ lang, siteName, labels, contactEmail }: Props) {
  return (
    <footer className="border-t border-[#22252a] px-space-3 pb-space-9 pt-space-5 sm:px-space-5 lg:pb-space-6">
      <div className="mx-auto max-w-6xl">
        {/* Dil bağlantıları: hreflang ile tutarlı, çerez kullanılmaz. */}
        <nav aria-label={labels.language ?? "Dil"} className="mb-space-3">
          <ul className="flex gap-space-2">
            {locales.map((item) => (
              <li key={item}>
                <Link
                  href={`/${item}`}
                  hrefLang={item === "tr" ? "tr-TR" : item}
                  aria-current={item === lang ? "page" : undefined}
                  className={`inline-flex min-h-touch items-center rounded-full border px-space-3 text-label font-bold transition ${
                    item === lang
                      ? "border-blue-500/50 bg-blue-500/15 text-blue-400"
                      : "border-[#22252a] text-zinc-400 hover:text-zinc-100"
                  }`}
                >
                  {item.toUpperCase()}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label={labels.rights}>
          <ul className="flex flex-wrap items-center gap-x-space-3 gap-y-space-2 text-xs font-medium text-zinc-500">
            <li>
              <Link href={`/${lang}/about`} className="inline-flex min-h-touch items-center transition hover:text-zinc-300">
                {labels.links.about}
              </Link>
            </li>
            <li aria-hidden="true">·</li>
            <li>
              <Link href={`/${lang}/legal/kvkk`} className="inline-flex min-h-touch items-center transition hover:text-zinc-300">
                {labels.links.kvkk}
              </Link>
            </li>
            <li aria-hidden="true">·</li>
            <li>
              <Link href={`/${lang}/legal/cookies`} className="inline-flex min-h-touch items-center transition hover:text-zinc-300">
                {labels.links.cookies}
              </Link>
            </li>
            <li aria-hidden="true">·</li>
            <li>
              <Link href={`/${lang}/legal/terms`} className="inline-flex min-h-touch items-center transition hover:text-zinc-300">
                {labels.links.terms}
              </Link>
            </li>
            <li aria-hidden="true">·</li>
            <li>
              <Link href={`/${lang}/legal/copyright`} className="inline-flex min-h-touch items-center transition hover:text-zinc-300">
                {labels.links.copyright}
              </Link>
            </li>
          </ul>
        </nav>

        {labels.noCookies ? (
          <p className="mt-space-2 inline-flex rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-space-2 py-space-1 t-label leading-snug text-emerald-500">
            {labels.noCookies}
          </p>
        ) : null}

        <div className="mt-space-3 flex flex-wrap items-center justify-between gap-space-2 text-xs text-zinc-600">
          <p>
            © 2026 {siteName} · {labels.rights}
          </p>
          {/* İletişim e-postası env'den: NEXT_PUBLIC_CONTACT_EMAIL.
              Tanımlı değilse Hakkında sayfasına yönlendirir (spam koruması). */}
          {contactEmail ? (
            <EmailLink
              user={contactEmail.split("@")[0]}
              domain={contactEmail.split("@")[1] ?? "example.com"}
              fallbackHref={`/${lang}/about`}
              className="inline-flex min-h-touch items-center transition hover:text-zinc-400"
            >
              <EmailText text={`${labels.contact}: ${contactEmail}`} />
            </EmailLink>
          ) : (
            <Link
              href={`/${lang}/about`}
              className="inline-flex min-h-touch items-center transition hover:text-zinc-400"
            >
              {labels.contact}
            </Link>
          )}
        </div>
      </div>
    </footer>
  );
}
