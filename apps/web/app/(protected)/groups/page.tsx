import Link from "next/link";

import { getMyStudyGroups } from "@/features/study-groups/study-group.queries";
import { CreateStudyGroupForm } from "@/features/study-groups/components/create-study-group-form";

export default async function GroupsPage() {
  const memberships = await getMyStudyGroups();

  return (
    <main className="space-y-6">
      <section className="rounded-2xl border bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
        <p className="text-sm font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Social Learning
        </p>

        <h1 className="mt-2 text-3xl font-bold tracking-tight text-neutral-950 dark:text-neutral-50">
          Study Groups
        </h1>

        <p className="mt-3 max-w-3xl text-neutral-600 dark:text-neutral-400">
          Create private study groups to chat, share progress, and learn with
          other Lumivox users.
        </p>
      </section>

      <CreateStudyGroupForm />

      <section className="rounded-2xl border bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
        <h2 className="text-2xl font-bold text-neutral-950 dark:text-neutral-50">
          My Groups
        </h2>

        {memberships.length === 0 ? (
          <div className="mt-5 rounded-2xl border border-dashed p-8 text-center dark:border-neutral-800">
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              You are not part of any study group yet.
            </p>
          </div>
        ) : (
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {memberships.map((membership) => {
              const group = membership.study_rooms;

              return (
                <article
                  key={membership.id}
                  className="rounded-2xl border p-5 dark:border-neutral-800"
                >
                  <p className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                    {membership.role}
                  </p>

                  <h3 className="mt-2 text-lg font-bold text-neutral-950 dark:text-neutral-50">
                    {group.title}
                  </h3>

                  {group.description ? (
                    <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                      {group.description}
                    </p>
                  ) : null}

                  <Link
                    href={`/groups/${group.id}`}
                    className="mt-4 inline-flex rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200"
                  >
                    Open Group
                  </Link>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
