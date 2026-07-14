"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { createStudyGroupAction } from "@/features/study-groups/study-group.actions";

export function CreateStudyGroupForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    startTransition(async () => {
      const result = await createStudyGroupAction({
        title,
        description,
      });

      if (!result.success) {
        toast.error(result.message);
        return;
      }

      toast.success(result.message);
      setTitle("");
      setDescription("");

      if (result.data?.groupId) {
        router.push(`/groups/${result.data.groupId}`);
        return;
      }

      router.refresh();
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-950"
    >
      <p className="text-sm font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        Private Study Group
      </p>

      <h2 className="mt-2 text-2xl font-bold tracking-tight text-neutral-950 dark:text-neutral-50">
        Create a study group
      </h2>

      <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
        Create a private group for long-term study chat and collaboration.
      </p>

      <div className="mt-5 space-y-4">
        <label className="block space-y-2">
          <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Group name
          </span>

          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm outline-none transition focus:border-neutral-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
            placeholder="AWS Study Group"
          />
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Description
          </span>

          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm outline-none transition focus:border-neutral-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
            placeholder="A private group for learning together."
          />
        </label>
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="mt-5 rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:opacity-60 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200"
      >
        {isPending ? "Creating..." : "Create Group"}
      </button>
    </form>
  );
}
