import type { RSSSource } from "@prisma/client";

export type RssSourceDto = Omit<RSSSource, "createdAt"> & {
  createdAt: string;
};

export function serializeRssSource(source: RSSSource): RssSourceDto {
  return {
    ...source,
    createdAt: source.createdAt.toISOString(),
  };
}
