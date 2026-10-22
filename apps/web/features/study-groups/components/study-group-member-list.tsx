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
    <section className="min-w-0 border-t border-border pt-card">
      <h2 className="text-section font-semibold text-foreground">
        {t("title")}
      </h2>

      <div className="mt-2 divide-y divide-border">
        {members.map((member) => (
          <article
            key={member.member_id}
            className="min-w-0 py-3"
          >
            <p className="text-body font-medium text-foreground [overflow-wrap:anywhere]">
              {getDisplayName(member)}
            </p>

            <p className="mt-1 text-caption text-muted-foreground">
              {t(`roles.${member.role}`)} -{" "}
              {t(`status.${member.membership_status}`)}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
