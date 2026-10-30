/**
 * E-posta adreslerini ayrı metin düğümleri hâlinde render eder.
 *
 * Neden: Cloudflare "E-posta Adresi Gizleme" özelliği HTML'deki düz e-posta
 * adreslerini DOM'da değiştirir; bu hidrasyon uyuşmazlığına ve üçüncü taraf
 * script enjeksiyonuna yol açar (KVKK: sıfır üçüncü taraf script). Adresi
 * `kullanıcı` + `@` + `alan adı` olarak ayırmak, adresin görünür ve
 * kopyalanabilir kalmasını sağlarken otomatik gizlemeyi devre dışı bırakır.
 */
const EMAIL_PATTERN = /([A-Za-z0-9._%+-]+)@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;

export function EmailText({ text }: { text: string }) {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  EMAIL_PATTERN.lastIndex = 0;

  while ((match = EMAIL_PATTERN.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    nodes.push(
      <span key={`email-${match.index}`}>
        {match[1]}
        <span aria-hidden="true">@</span>
        {match[2]}
      </span>,
    );

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return <>{nodes.length > 0 ? nodes : text}</>;
}
