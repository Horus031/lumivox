"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { shareLearningDocumentByEmailAction } from "@/features/learning-documents/learning-document-sharing.actions";

type ShareDocumentFormProps = {
  documentId: string;
};

export function ShareDocumentForm({ documentId }: ShareDocumentFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"viewer" | "editor">("viewer");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    startTransition(async () => {
      const result = await shareLearningDocumentByEmailAction({
        documentId,
        userEmail: email,
        role,
      });

      if (!result.success) {
        toast.error(result.message);
        return;
      }

      toast.success(result.message);
      setEmail("");
      setRole("viewer");
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-950"
    >
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Share by Email
        </p>

        <h2 className="mt-2 text-2xl font-bold tracking-tight text-neutral-950 dark:text-neutral-50">
          Grant document access
        </h2>

        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          Add the email address of a Lumivox user who should be allowed to
          access this document.
        </p>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-[1fr_180px]">
        <label className="space-y-2">
          <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Email
          </span>

          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            required
            placeholder="friend@example.com"
            className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm outline-none transition focus:border-neutral-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50 dark:focus:border-neutral-400"
          />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Role
          </span>

          <select
            value={role}
            onChange={(event) =>
              setRole(event.target.value as "viewer" | "editor")
            }
            className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm outline-none transition focus:border-neutral-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50 dark:focus:border-neutral-400"
          >
            <option value="viewer">Viewer</option>
            <option value="editor">Editor</option>
          </select>
        </label>
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="mt-5 rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200"
      >
        {isPending ? "Sharing..." : "Share Document"}
      </button>
    </form>
  );
}