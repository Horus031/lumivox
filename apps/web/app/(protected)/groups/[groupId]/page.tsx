import { notFound } from "next/navigation";

import {
  getStudyGroupById,
  getStudyGroupMembers,
  getStudyGroupMessages,
} from "@/features/study-groups/study-group.queries";
import { InviteStudyGroupMemberForm } from "@/features/study-groups/components/invite-study-group-member-form";
import { StudyGroupMemberList } from "@/features/study-groups/components/study-group-member-list";
import { StudyGroupChat } from "@/features/study-groups/components/study-group-chat";
import { requireUser } from "@/lib/auth/require-user";

type GroupDetailPageProps = {
  params: Promise<{
    groupId: string;
  }>;
};

export default async function GroupDetailPage({
  params,
}: GroupDetailPageProps) {
  const { groupId } = await params;
  const { user } = await requireUser();

  const membership = await getStudyGroupById(groupId);

  if (!membership) {
    notFound();
  }

  const [members, messages] = await Promise.all([
    getStudyGroupMembers(groupId),
    getStudyGroupMessages(groupId),
  ]);

  const group = membership.study_rooms;
  const canInvite =
    membership.membership_status === "active" &&
    ["owner", "admin"].includes(membership.role);

  return (
    <main className="space-y-6">
      <section className="rounded-2xl border bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
        <p className="text-sm font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Study Group
        </p>

        <h1 className="mt-2 text-3xl font-bold tracking-tight text-neutral-950 dark:text-neutral-50">
          {group.title}
        </h1>

        {group.description ? (
          <p className="mt-3 max-w-3xl text-neutral-600 dark:text-neutral-400">
            {group.description}
          </p>
        ) : null}
      </section>

      {canInvite ? <InviteStudyGroupMemberForm groupId={groupId} /> : null}

      <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
        <StudyGroupMemberList members={members} />

        <StudyGroupChat
          groupId={groupId}
          currentUserId={user.id}
          currentUserEmail={user.email ?? null}
          initialMessages={messages}
        />
      </div>
    </main>
  );
}
