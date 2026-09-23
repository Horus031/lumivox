import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import {
  getStudyGroupById,
  getStudyGroupMembers,
  getStudyGroupMessages,
  getStudyGroupWeeklyChallengeProgress,
  getStudyGroupWeeklyLeaderboard,
} from "@/features/study-groups/study-group.queries";
import { InviteStudyGroupMemberForm } from "@/features/study-groups/components/invite-study-group-member-form";
import { StudyGroupMemberList } from "@/features/study-groups/components/study-group-member-list";
import { StudyGroupChat } from "@/features/study-groups/components/study-group-chat";
import { requireUser } from "@/lib/auth/require-user";
import { StudyGroupLeaderboard } from "@/features/study-groups/components/study-group-leaderboard";
import { StudyGroupWeeklyChallenge } from "@/features/study-groups/components/study-group-weekly-challenge";
import { StudyGroupWeeklyChallengeForm } from "@/features/study-groups/components/study-group-weekly-challenge-form";
import { getWeeklyChallengeDefaultSettings } from "@/features/cms-settings/cms-settings.queries";
import { getLeaderboardSettings } from "@/features/cms-settings/cms-settings.queries";

type GroupDetailPageProps = {
  params: Promise<{
    groupId: string;
  }>;
};

async function GroupLeaderboardArea({
  groupId,
  canManage,
}: {
  groupId: string;
  canManage: boolean;
}) {
  const { groupLeaderboardEnabled } = await getLeaderboardSettings();

  if (!groupLeaderboardEnabled) {
    const t = await getTranslations("groups.detail");

    return (
      <section className="rounded-2xl border bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
        <h2 className="text-2xl font-bold text-neutral-950 dark:text-neutral-50">
          {t("leaderboardDisabledTitle")}
        </h2>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          {t("leaderboardDisabledDescription")}
        </p>
      </section>
    );
  }

  const [leaderboard, challengeProgress, weeklyChallengeDefaults] =
    await Promise.all([
      getStudyGroupWeeklyLeaderboard(groupId),
      getStudyGroupWeeklyChallengeProgress(groupId),
      getWeeklyChallengeDefaultSettings(),
    ]);

  return (
    <>
      <div className="grid gap-6 xl:grid-cols-2">
        <StudyGroupWeeklyChallenge progress={challengeProgress} />

        <StudyGroupLeaderboard
          weekStart={leaderboard.weekStart}
          weekEnd={leaderboard.weekEnd}
          rows={leaderboard.rows}
        />
      </div>

      {canManage ? (
        <StudyGroupWeeklyChallengeForm
          groupId={groupId}
          defaultFocusMinutes={weeklyChallengeDefaults.defaultFocusMinutes}
          defaultCompletedTasks={weeklyChallengeDefaults.defaultCompletedTasks}
        />
      ) : null}
    </>
  );
}

async function GroupMembersSection({ groupId }: { groupId: string }) {
  const members = await getStudyGroupMembers(groupId);
  return <StudyGroupMemberList members={members} />;
}

async function GroupChatSection({
  groupId,
  currentUserId,
  currentUserEmail,
}: {
  groupId: string;
  currentUserId: string;
  currentUserEmail: string | null;
}) {
  const messages = await getStudyGroupMessages(groupId);

  return (
    <StudyGroupChat
      groupId={groupId}
      currentUserId={currentUserId}
      currentUserEmail={currentUserEmail}
      initialMessages={messages}
    />
  );
}

function GroupPanelFallback({ className }: { className: string }) {
  return (
    <div
      aria-hidden="true"
      className={`${className} animate-pulse rounded-2xl border border-border/60 bg-card/60`}
    />
  );
}

export default async function GroupDetailPage({
  params,
}: GroupDetailPageProps) {
  const { groupId } = await params;

  const [{ user }, t, membership] = await Promise.all([
    requireUser(),
    getTranslations("groups.detail"),
    getStudyGroupById(groupId),
  ]);

  if (!membership) {
    notFound();
  }

  const group = membership.study_rooms;
  const canInvite =
    membership.membership_status === "active" &&
    ["owner", "admin"].includes(membership.role);

  return (
    <main className="space-y-6">
      <section className="rounded-2xl border bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
        <p className="text-sm font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          {t("eyebrow")}
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

      <Suspense fallback={<GroupPanelFallback className="h-72" />}>
        <GroupLeaderboardArea groupId={groupId} canManage={canInvite} />
      </Suspense>

      {canInvite ? <InviteStudyGroupMemberForm groupId={groupId} /> : null}

      <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
        <Suspense fallback={<GroupPanelFallback className="h-96" />}>
          <GroupMembersSection groupId={groupId} />
        </Suspense>

        <Suspense fallback={<GroupPanelFallback className="h-150" />}>
          <GroupChatSection
            groupId={groupId}
            currentUserId={user.id}
            currentUserEmail={user.email ?? null}
          />
        </Suspense>
      </div>
    </main>
  );
}
