"use client";

import { toast } from "sonner";

type DocumentShareLinkCardProps = {
  documentId: string;
};

export function DocumentShareLinkCard({
  documentId,
}: DocumentShareLinkCardProps) {
  const sharePath = `/documents/shared/${documentId}`;
  const shareUrl =
    typeof window === "undefined"
      ? sharePath
      : `${window.location.origin}${sharePath}`;

  async function handleCopy() {
    await navigator.clipboard.writeText(shareUrl);
    toast.success("Share link copied.");
  }

  return (
    <section className="rounded-2xl border bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Share Link
        </p>

        <h2 className="mt-2 text-2xl font-bold tracking-tight text-neutral-950 dark:text-neutral-50">
          Document access link
        </h2>

        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          Users still need the correct permission unless the document is public.
        </p>
      </div>

      <div className="mt-5 flex flex-col gap-3 md:flex-row">
        <input
          readOnly
          value={shareUrl}
          className="w-full rounded-xl border bg-neutral-50 px-3 py-2.5 text-sm text-neutral-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300"
        />

        <button
          type="button"
          onClick={handleCopy}
          className="rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200"
        >
          Copy Link
        </button>
      </div>
    </section>
  );
}