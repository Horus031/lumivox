import { useTranslations } from "next-intl";

type StudyGroupMemberListProps = {
  members: Array<{
    member_id: string;
    room_id: string;
    user_id: string;
    email: string | null;
    role: string;
    membership_status: string;
    joined_at: string | null;
  }>;
};

function getDisplayName(member: StudyGroupMemberListProps["members"][number]) {
  return member.email || `User ${member.user_id.slice(0, 8)}`;
}

export function StudyGroupMemberList({ members }: StudyGroupMemberListProps) {
  const t = useTranslations("groups.members");

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
      <h2 className="text-xl font-bold text-neutral-950 dark:text-neutral-50">
        {t("title")}
      </h2>

      <div className="mt-5 space-y-3">
        {members.map((member) => (
          <article
            key={member.member_id}
            className="rounded-2xl border p-4 dark:border-neutral-800"
          >
            <p className="font-semibold text-neutral-950 dark:text-neutral-50">
              {getDisplayName(member)}
            </p>

            <p className="mt-2 text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              {t(`roles.${member.role}`)} -{" "}
              {t(`status.${member.membership_status}`)}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
