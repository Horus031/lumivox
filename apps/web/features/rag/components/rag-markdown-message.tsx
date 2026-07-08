import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type MarkdownBlock =
  | { type: "paragraph"; content: string }
  | { type: "heading"; level: 2 | 3 | 4; content: string }
  | { type: "code"; language?: string; content: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "quote"; content: string };

type RagMarkdownMessageProps = {
  content: string;
  className?: string;
};

const SPECIAL_BLOCK_PATTERN =
  /^(#{1,3}\s+|```|>\s?|[-*]\s+|\d+\.\s+)/;

function parseMarkdownBlocks(content: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const codeFenceMatch = line.match(/^```([\w-]+)?\s*$/);
    if (codeFenceMatch) {
      const codeLines: string[] = [];
      index += 1;

      while (index < lines.length && !lines[index].startsWith("```")) {
        codeLines.push(lines[index]);
        index += 1;
      }

      blocks.push({
        type: "code",
        language: codeFenceMatch[1],
        content: codeLines.join("\n"),
      });

      index += index < lines.length ? 1 : 0;
      continue;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({
        type: "heading",
        level: Math.min(headingMatch[1].length + 1, 4) as 2 | 3 | 4,
        content: headingMatch[2],
      });
      index += 1;
      continue;
    }

    if (line.startsWith(">")) {
      const quoteLines: string[] = [];

      while (index < lines.length && lines[index].startsWith(">")) {
        quoteLines.push(lines[index].replace(/^>\s?/, ""));
        index += 1;
      }

      blocks.push({ type: "quote", content: quoteLines.join("\n") });
      continue;
    }

    const unorderedMatch = line.match(/^[-*]\s+(.+)$/);
    const orderedMatch = line.match(/^\d+\.\s+(.+)$/);
    if (unorderedMatch || orderedMatch) {
      const ordered = Boolean(orderedMatch);
      const items: string[] = [];

      while (index < lines.length) {
        const itemMatch = ordered
          ? lines[index].match(/^\d+\.\s+(.+)$/)
          : lines[index].match(/^[-*]\s+(.+)$/);

        if (!itemMatch) break;

        items.push(itemMatch[1]);
        index += 1;
      }

      blocks.push({ type: "list", ordered, items });
      continue;
    }

    const paragraphLines: string[] = [];

    while (
      index < lines.length &&
      lines[index].trim() &&
      !SPECIAL_BLOCK_PATTERN.test(lines[index])
    ) {
      paragraphLines.push(lines[index]);
      index += 1;
    }

    blocks.push({ type: "paragraph", content: paragraphLines.join("\n") });
  }

  return blocks;
}

function getSafeHref(rawHref: string) {
  const href = rawHref.trim();

  if (/^(https?:|mailto:)/i.test(href)) {
    return href;
  }

  return undefined;
}

function renderInlineMarkdown(text: string): ReactNode[] {
  const pattern =
    /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|\[[^\]]+\]\([^)]+\))/g;
  const nodes: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(pattern)) {
    const value = match[0];
    const index = match.index ?? 0;

    if (index > lastIndex) {
      nodes.push(text.slice(lastIndex, index));
    }

    const key = `${index}-${value}`;

    if (value.startsWith("`")) {
      nodes.push(
        <code
          key={key}
          className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground"
        >
          {value.slice(1, -1)}
        </code>,
      );
    } else if (value.startsWith("**") || value.startsWith("__")) {
      nodes.push(
        <strong key={key} className="font-semibold text-foreground">
          {renderInlineMarkdown(value.slice(2, -2))}
        </strong>,
      );
    } else if (value.startsWith("*") || value.startsWith("_")) {
      nodes.push(
        <em key={key} className="italic">
          {renderInlineMarkdown(value.slice(1, -1))}
        </em>,
      );
    } else {
      const linkMatch = value.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      const href = linkMatch ? getSafeHref(linkMatch[2]) : undefined;

      nodes.push(
        href ? (
          <a
            key={key}
            href={href}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-primary underline underline-offset-4"
          >
            {renderInlineMarkdown(linkMatch?.[1] ?? href)}
          </a>
        ) : (
          value
        ),
      );
    }

    lastIndex = index + value.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

export function RagMarkdownMessage({
  content,
  className,
}: RagMarkdownMessageProps) {
  const blocks = parseMarkdownBlocks(content);

  return (
    <div
      className={cn(
        "space-y-3 text-sm leading-6 text-foreground",
        className,
      )}
    >
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          const Heading = `h${block.level}` as "h2" | "h3" | "h4";

          return (
            <Heading
              key={`${block.type}-${index}`}
              className="font-semibold leading-7 text-foreground"
            >
              {renderInlineMarkdown(block.content)}
            </Heading>
          );
        }

        if (block.type === "code") {
          return (
            <figure
              key={`${block.type}-${index}`}
              className="overflow-hidden rounded-lg border bg-muted/40"
            >
              {block.language ? (
                <figcaption className="border-b px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
                  {block.language}
                </figcaption>
              ) : null}
              <pre className="overflow-x-auto p-3 text-xs leading-5">
                <code>{block.content}</code>
              </pre>
            </figure>
          );
        }

        if (block.type === "list") {
          const List = block.ordered ? "ol" : "ul";

          return (
            <List
              key={`${block.type}-${index}`}
              className={cn(
                "space-y-1 pl-5",
                block.ordered ? "list-decimal" : "list-disc",
              )}
            >
              {block.items.map((item, itemIndex) => (
                <li key={`${itemIndex}-${item}`}>
                  {renderInlineMarkdown(item)}
                </li>
              ))}
            </List>
          );
        }

        if (block.type === "quote") {
          return (
            <blockquote
              key={`${block.type}-${index}`}
              className="border-l-2 border-primary/40 pl-3 text-muted-foreground"
            >
              {renderInlineMarkdown(block.content)}
            </blockquote>
          );
        }

        return (
          <p key={`${block.type}-${index}`} className="whitespace-pre-wrap">
            {renderInlineMarkdown(block.content)}
          </p>
        );
      })}
    </div>
  );
}
