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
    <section className="rounded-2xl border bg-surface p-6 shadow-sm">
      <h2 className="text-2xl font-bold text-foreground">
        {t("title")}
      </h2>

      <div className="mt-5 space-y-3">
        {members.map((member) => (
          <article
            key={member.member_id}
            className="rounded-2xl border p-4"
          >
            <p className="font-semibold text-foreground">
              {getName(member)}
            </p>

            <p className="mt-1 text-sm text-muted-foreground">
              {member.email ?? member.user_id}
            </p>

            <p className="mt-2 text-xs uppercase tracking-wide text-muted-foreground">
              {commonT(`roles.${member.role}`)} -{" "}
              {commonT(`membershipStatus.${member.membership_status}`)}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
