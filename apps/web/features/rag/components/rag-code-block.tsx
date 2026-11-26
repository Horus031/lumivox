"use client";

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { Check, Copy } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

type RagCodeBlockProps = {
  children: ReactNode;
  language?: string;
};

type CopyStatus = "idle" | "copied" | "error";

export function RagCodeBlock({
  children,
  language,
}: RagCodeBlockProps) {
  const t = useTranslations("rag");

  const codeRef = useRef<HTMLPreElement>(null);

  const resetTimerRef = useRef<
    ReturnType<typeof setTimeout> | null
  >(null);

  const [status, setStatus] =
    useState<CopyStatus>("idle");

  useEffect(() => {
    return () => {
      if (resetTimerRef.current !== null) {
        clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  async function handleCopy() {
    const code = codeRef.current?.textContent;

    if (!code) return;

    if (resetTimerRef.current !== null) {
      clearTimeout(resetTimerRef.current);
    }

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard unavailable");
      }

      await navigator.clipboard.writeText(
        code.replace(/\n$/, ""),
      );

      setStatus("copied");
    } catch {
      setStatus("error");
    }

    resetTimerRef.current = setTimeout(() => {
      setStatus("idle");
      resetTimerRef.current = null;
    }, 2000);
  }

  const buttonLabel =
    status === "copied"
      ? t("codeCopied")
      : status === "error"
        ? t("codeCopyFailed")
        : t("copyCode");

  return (
    <figure className="my-3 min-w-0 max-w-full overflow-hidden rounded-xl border border-border bg-muted/40">
      <figcaption className="flex min-w-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
        <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
          {language || t("plainText")}
        </span>

        <button
          type="button"
          onClick={handleCopy}
          aria-label={buttonLabel}
          className={cn(
            "inline-flex min-h-8 shrink-0 items-center gap-1.5",
            "rounded-md px-2 text-xs font-medium",
            "text-muted-foreground transition-colors",
            "hover:bg-muted hover:text-foreground",
            "focus-visible:outline-2 focus-visible:outline-offset-2",
            "focus-visible:outline-primary",
          )}
        >
          {status === "copied" ? (
            <Check
              size={14}
              aria-hidden="true"
            />
          ) : (
            <Copy
              size={14}
              aria-hidden="true"
            />
          )}

          <span>{buttonLabel}</span>
        </button>
      </figcaption>

      <pre
        ref={codeRef}
        tabIndex={0}
        aria-label={t("codeBlock")}
        className="max-w-full overflow-x-auto p-3 font-mono text-xs leading-6 focus-visible:outline-2 focus-visible:outline-primary"
      >
        {children}
      </pre>

      <span
        role="status"
        aria-live="polite"
        className="sr-only"
      >
        {status === "idle" ? "" : buttonLabel}
      </span>
    </figure>
  );
}
