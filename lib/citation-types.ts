/**
 * Gövde içi atıf ("altılı çapraz bağ") veri tipleri.
 *
 * Bu dosya istemci bileşenleri tarafından da içe aktarılır; bu yüzden
 * Prisma veya sunucu tarafı bağımlılık içermez.
 */

export type CitationTopicType = "kisi" | "kurum" | "olay";

/**
 * Önizleme kartı verisi. Sayfaya sunucu tarafında (build/render anında)
 * gömülür; hover/focus sırasında hiçbir ağ isteği yapılmaz.
 */
export type CitationPreview = {
  id: string;
  slug: string;
  /** Kanonik, yerelleştirilmiş yol: /tr/haber/<slug> veya /tr/portre/<slug> */
  href: string;
  kind: "haber" | "portre";
  title: string;
  /** Hedef içeriğin ilk cümlesi (en fazla 180 karakter). */
  firstSentence: string;
  category: string;
  topicType: CitationTopicType;
  publishedAt: string | null;
  updatedAt: string | null;
  sourceCount: number;
  readingTime: number;
  listenTime: number;
};

/**
 * Gövde metninde işaretlenecek atıf. `phrase`, mevcut içeriğin metninde
 * birebir geçen, en fazla 12 kelimelik ifadedir.
 */
export type CitationAnchor = {
  targetId: string;
  phrase: string;
  href: string;
  preview: CitationPreview;
};

export type CitationLabels = {
  related: string;
  goTo: string;
  close: string;
  verified: string;
  readingTime: string;
  listeningTime: string;
  published: string;
  updated: string;
};

export type TextPart = {
  text: string;
  citation?: CitationAnchor;
};
