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
import { PageHeader } from "@/features/app-shell/components/page-header";

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
      <section className="min-w-0 border-t border-border pt-card">
        <h2 className="text-section font-semibold text-foreground">
          {t("leaderboardDisabledTitle")}
        </h2>
        <p className="mt-1 text-body text-secondary-text">
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
      <div className="grid min-w-0 gap-section xl:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
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
      className={`${className} min-w-0 animate-pulse rounded-lg bg-muted`}
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
    <section className="min-w-0 space-y-section">
      <PageHeader eyebrow={t("eyebrow")} title={group.title} description={group.description ?? undefined} />

      <Suspense fallback={<GroupPanelFallback className="h-72" />}>
        <GroupLeaderboardArea groupId={groupId} canManage={canInvite} />
      </Suspense>

      {canInvite ? <InviteStudyGroupMemberForm groupId={groupId} /> : null}

      <div className="grid min-w-0 gap-section xl:grid-cols-[18rem_minmax(0,1fr)]">
        <Suspense fallback={<GroupPanelFallback className="h-96" />}>
          <GroupMembersSection groupId={groupId} />
        </Suspense>

        <Suspense fallback={<GroupPanelFallback className="h-112" />}>
          <GroupChatSection
            groupId={groupId}
            currentUserId={user.id}
            currentUserEmail={user.email ?? null}
          />
        </Suspense>
      </div>
    </section>
  );
}
