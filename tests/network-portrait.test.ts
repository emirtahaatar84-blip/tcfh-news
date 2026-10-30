import { describe, expect, it } from "vitest";
import { dedupeStories, fetchFeedStories, filterByWindow } from "@/lib/kantan-feed";
import { scoreStories } from "@/lib/portrait-score";
import { researchStory } from "@/lib/research";

const NETWORK = process.env.RUN_NETWORK_TESTS === "1";

describe.skipIf(!NETWORK)("canlı feed (ağ)", () => {
  it(
    "kantan.news/feed okunur ve puanlanır",
    async () => {
      const feed = await fetchFeedStories("https://kantan.news/feed");
      expect(feed.ok).toBe(true);
      if (!feed.ok) return;

      expect(feed.stories.length).toBeGreaterThan(0);
      const first = feed.stories[0];
      expect(first.title.length).toBeGreaterThan(5);
      expect(first.url).toMatch(/^https?:\/\//);

      const { fresh } = filterByWindow(feed.stories, 48);
      const unique = dedupeStories(fresh);
      const scores = scoreStories(unique);

      expect(scores.size).toBe(unique.length);

      const ranked = [...scores.entries()].sort((a, b) => b[1].total - a[1].total);
      console.log("[feed]", feed.strategy, "hikâye:", feed.stories.length, "taze:", fresh.length);
      for (const [key, score] of ranked.slice(0, 5)) {
        const story = unique.find((item) => item.key === key);
        console.log(`  ${score.total.toFixed(1)} | ${score.subjectType}/${score.subjectName ?? "-"} | ${story?.title.slice(0, 70)}`);
      }
    },
    120_000,
  );

  it(
    "araştırma en az 3 bağımsız kaynak bulabilir",
    async () => {
      const feed = await fetchFeedStories("https://kantan.news/feed");
      if (!feed.ok) return;

      const { fresh } = filterByWindow(feed.stories, 48);
      const unique = dedupeStories(fresh);
      const scores = scoreStories(unique);
      const ranked = [...scores.entries()].sort((a, b) => b[1].total - a[1].total);
      const [key, score] = ranked[0];
      const story = unique.find((item) => item.key === key)!;

      const research = await researchStory(story, score.subjectName, { useGdelt: false });
      console.log("[research]", story.title.slice(0, 70));
      console.log("  ok:", research.ok, "domain:", research.domainCount, "kaynak:", research.sources.length);
      console.log("  queries:", research.queries.join(" | "));
      for (const source of research.sources) {
        console.log(`  - [${source.kind}] ${source.name} (${source.domain}) ${source.text.length}b`);
      }

      expect(research.sources.length).toBeGreaterThan(0);
    },
    180_000,
  );
});
