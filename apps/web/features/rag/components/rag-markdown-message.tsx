"use client";

import { useTranslations } from "next-intl";

import ReactMarkdown, {
  type Components,
  type UrlTransform,
} from "react-markdown";

import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";

import { cn } from "@/lib/utils";

import { RagCodeBlock } from "./rag-code-block";

import "katex/dist/katex.min.css";
import "./rag-markdown.css";

type RagMarkdownMessageProps = {
  content: string;
  className?: string;
};

const safeUrlTransform: UrlTransform = (
  url,
  key,
) => {
  // Only hyperlinks are permitted.
  // Never load resources from generated Markdown.
  if (key !== "href") return "";

  const normalized = url.trim();

  if (/[\u0000-\u001f\u007f]/.test(normalized)) {
    return "";
  }

  if (
    !/^(https?:\/\/|mailto:)/i.test(normalized)
  ) {
    return "";
  }

  try {
    const parsed = new URL(normalized);

    if (
      parsed.protocol !== "https:" &&
      parsed.protocol !== "http:" &&
      parsed.protocol !== "mailto:"
    ) {
      return "";
    }

    return normalized;
  } catch {
    return "";
  }
};

export function RagMarkdownMessage({
  content,
  className,
}: RagMarkdownMessageProps) {
  const t = useTranslations("rag");

  const components: Components = {
    h1: ({ children }) => (
      <h2 className="rag-heading-primary">
        {children}
      </h2>
    ),

    h2: ({ children }) => (
      <h3 className="rag-heading-secondary">
        {children}
      </h3>
    ),

    h3: ({ children }) => (
      <h4 className="rag-heading-tertiary">
        {children}
      </h4>
    ),

    h4: ({ children }) => (
      <h5 className="rag-heading-tertiary">
        {children}
      </h5>
    ),

    h5: ({ children }) => (
      <h6 className="rag-heading-tertiary">
        {children}
      </h6>
    ),

    h6: ({ children }) => (
      <h6 className="rag-heading-tertiary">
        {children}
      </h6>
    ),

    p: ({ children }) => (
      <p className="rag-paragraph">
        {children}
      </p>
    ),

    strong: ({ children }) => (
      <strong className="font-semibold">
        {children}
      </strong>
    ),

    em: ({ children }) => (
      <em className="italic">
        {children}
      </em>
    ),

    del: ({ children }) => (
      <del className="text-muted-foreground">
        {children}
      </del>
    ),

    ul: ({ children, className }) => (
      <ul
        className={cn(
          "rag-unordered-list",
          className,
        )}
      >
        {children}
      </ul>
    ),

    ol: ({ children, start, className }) => (
      <ol
        start={start}
        className={cn(
          "rag-ordered-list",
          className,
        )}
      >
        {children}
      </ol>
    ),

    li: ({ children, className }) => (
      <li className={className}>
        {children}
      </li>
    ),

    blockquote: ({ children }) => (
      <blockquote className="rag-blockquote">
        {children}
      </blockquote>
    ),

    hr: () => (
      <hr className="my-4 border-border" />
    ),

    a: ({ children, href, title }) => {
      if (!href) {
        return <span>{children}</span>;
      }

      return (
        <a
          href={href}
          title={title}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-primary underline underline-offset-4"
        >
          {children}
        </a>
      );
    },

    // Block all Markdown images.
    // This prevents external requests and tracking.
    img: ({ alt }) => (
      <span className="text-xs italic text-muted-foreground">
        {alt
          ? t("blockedImageWithAlt", { alt })
          : t("blockedImage")}
      </span>
    ),

    input: ({ type, checked }) => {
      if (type !== "checkbox") return null;

      return (
        <input
          type="checkbox"
          checked={Boolean(checked)}
          disabled
          readOnly
          aria-label={
            checked
              ? t("taskCompleted")
              : t("taskIncomplete")
          }
          className="mr-1 accent-primary"
        />
      );
    },

    table: ({ children }) => (
      <div
        role="region"
        aria-label={t("markdownTable")}
        tabIndex={0}
        className="rag-table-scroll"
      >
        <table className="rag-table">
          {children}
        </table>
      </div>
    ),

    thead: ({ children }) => (
      <thead className="bg-muted/60">
        {children}
      </thead>
    ),

    tbody: ({ children }) => (
      <tbody>{children}</tbody>
    ),

    tr: ({ children }) => (
      <tr>{children}</tr>
    ),

    th: ({ children, style }) => (
      <th scope="col" style={style}>
        {children}
      </th>
    ),

    td: ({ children, style }) => (
      <td style={style}>{children}</td>
    ),

    pre: ({ node, children }) => {
      const codeNode = node?.children.find(
        (child) =>
          child.type === "element" &&
          child.tagName === "code",
      );

      const rawClassName =
        codeNode?.type === "element"
          ? codeNode.properties.className
          : undefined;

      const classNames = Array.isArray(
        rawClassName,
      )
        ? rawClassName.map(String).join(" ")
        : String(rawClassName ?? "");

      const language = classNames.match(
        /(?:^|\s)language-([^\s]+)/,
      )?.[1];

      return (
        <RagCodeBlock language={language}>
          {children}
        </RagCodeBlock>
      );
    },

    code: ({ children, className }) => (
      <code className={className}>
        {children}
      </code>
    ),
  };

  return (
    <div
      className={cn(
        "rag-markdown min-w-0 max-w-full",
        "text-sm leading-6 text-foreground",
        className,
      )}
    >
      <ReactMarkdown
        skipHtml
        urlTransform={safeUrlTransform}
        remarkPlugins={[
          remarkGfm,
          [
            remarkMath,
            { singleDollarTextMath: true },
          ],
        ]}
        rehypePlugins={[
          [
            rehypeKatex,
            {
              trust: false,
              maxExpand: 500,
              maxSize: 20,
              output: "htmlAndMathml",
              strict: "warn",
            },
          ],
          [
            rehypeHighlight,
            {
              detect: false,
              plainText: ["text", "txt", "plaintext"],
            },
          ],
        ]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
