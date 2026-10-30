import type { ReactNode } from "react";

/**
 * Minimal, dependency-free Markdown renderer for AI-generated article
 * breakdowns: `##`/`###` subheadings, paragraphs, `- ` bullet lists, inline
 * **bold** and [text](url) links. Everything else is escaped as plain text.
 */

const INLINE_PATTERN = /(\*\*[^*]+\*\*)|(\[[^\]]+\]\([^)\s]+\))/g;

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const parts = text.split(INLINE_PATTERN).filter((part) => part !== undefined);

  return parts.map((part, index) => {
    const key = `${keyPrefix}-${index}`;

    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={key} className="font-semibold text-zinc-100">
          {part.slice(2, -2)}
        </strong>
      );
    }

    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
    if (linkMatch) {
      const [, label, href] = linkMatch;
      const safeHref = /^https?:\/\//i.test(href) ? href : "#";
      return (
        <a
          key={key}
          href={safeHref}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-400 underline-offset-2 hover:underline"
        >
          {label}
        </a>
      );
    }

    return <span key={key}>{part}</span>;
  });
}

function isBulletList(block: string): boolean {
  const lines = block.split("\n").filter((line) => line.trim());
  return lines.length > 0 && lines.every((line) => /^[-*]\s+/.test(line.trim()));
}

export function MarkdownContent({ content }: { content: string }) {
  const blocks = content
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  return (
    <div className="space-y-space-4">
      {blocks.map((block, index) => {
        const key = `block-${index}`;

        if (block.startsWith("### ")) {
          return (
            <h3
              key={key}
              className="t-h3 pt-space-2 text-zinc-100"
            >
              {renderInline(block.slice(4), key)}
            </h3>
          );
        }

        if (block.startsWith("## ")) {
          return (
            <h2
              key={key}
              className="t-h2 pt-space-3 text-zinc-100"
            >
              {renderInline(block.slice(3), key)}
            </h2>
          );
        }

        if (block.startsWith("# ") && !block.startsWith("## ")) {
          return (
            <h2 key={key} className="t-h2 pt-space-3 text-zinc-100">
              {renderInline(block.slice(2), key)}
            </h2>
          );
        }

        if (isBulletList(block)) {
          const items = block
            .split("\n")
            .map((line) => line.trim().replace(/^[-*]\s+/, ""))
            .filter(Boolean);

          return (
            <ul key={key} className="space-y-space-2 pl-space-1">
              {items.map((item, itemIndex) => (
                <li
                  key={`${key}-${itemIndex}`}
                  className="t-body flex gap-space-3 text-zinc-200"
                >
                  <span
                    aria-hidden="true"
                    className="mt-space-2 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-500"
                  />
                  <span>{renderInline(item, `${key}-${itemIndex}`)}</span>
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p key={key} className="t-body text-zinc-200">
            {renderInline(block, key)}
          </p>
        );
      })}
    </div>
  );
}
