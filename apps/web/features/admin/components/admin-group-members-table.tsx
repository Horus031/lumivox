import { useTranslations } from "next-intl";

type AdminGroupMember = {
  member_id: string;
  user_id: string;
  full_name: string | null;
  display_name: string | null;
  email: string | null;
  role: string;
  membership_status: string;
  joined_at: string | null;
};

type AdminGroupMembersTableProps = {
  members: AdminGroupMember[];
};

function getName(member: AdminGroupMember) {
  return (
    member.display_name ||
    member.full_name ||
    `User ${member.user_id.slice(0, 8)}`
  );
}

export function AdminGroupMembersTable({
  members,
}: AdminGroupMembersTableProps) {
  const t = useTranslations("admin.groups.members");
  const commonT = useTranslations("admin.common");

  return (
    <section className="min-w-0 space-y-3 border-t border-border pt-card">
      <h2 className="text-section font-semibold text-foreground">
        {t("title")}
      </h2>

      {members.length === 0 ? <p className="py-section text-body text-muted-foreground">{t("empty")}</p> : <ul className="divide-y divide-border">
        {members.map((member) => (
          <li
            key={member.member_id}
            className="min-w-0 py-3 [overflow-wrap:anywhere]"
          >
            <p className="text-body font-medium text-foreground">
              {getName(member)}
            </p>

            <p className="mt-1 text-caption text-muted-foreground">
              {member.email ?? member.user_id}
            </p>

            <p className="mt-2 text-caption text-secondary-text">
              {commonT(`roles.${member.role}`)} -{" "}
              {commonT(`membershipStatus.${member.membership_status}`)}
            </p>
          </li>
        ))}
      </ul>}
    </section>
  );
}
