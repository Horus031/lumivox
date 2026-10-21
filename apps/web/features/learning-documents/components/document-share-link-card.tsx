"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
    <section className="rounded-2xl border bg-background p-6 shadow-sm">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Share Link
        </p>

        <h2 className="mt-2 text-2xl font-bold tracking-tight text-foreground">
          Document access link
        </h2>

        <p className="mt-2 text-sm text-muted-foreground">
          Users still need the correct permission unless the document is public.
        </p>
      </div>

      <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-center">
        <Input readOnly value={shareUrl} />

        <Button type="button" onClick={handleCopy}>
          Copy Link
        </Button>
      </div>
    </section>
  );
}
