import { useLocale, useTranslations } from "next-intl";

import { AdminGroupMessageDeleteButton } from "./admin-group-message-delete-button";

type AdminGroupMessage = {
  message_id: string;
  group_id: string;
  user_id: string;
  full_name: string | null;
  display_name: string | null;
  email: string | null;
  content: string;
  created_at: string;
};

type AdminGroupMessagesTableProps = {
  groupId: string;
  messages: AdminGroupMessage[];
};

function getName(message: AdminGroupMessage) {
  return (
    message.display_name ||
    message.full_name ||
    `User ${message.user_id.slice(0, 8)}`
  );
}

export function AdminGroupMessagesTable({
  groupId,
  messages,
}: AdminGroupMessagesTableProps) {
  const locale = useLocale();
  const t = useTranslations("admin.groups.messages");

  return (
    <section className="min-w-0 space-y-3 border-t border-border pt-card">
        <h2 className="text-section font-semibold text-foreground">
          {t("title")}
        </h2>

      {messages.length === 0 ? (
        <div className="py-section">
          <p className="text-body text-muted-foreground">
            {t("empty")}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {messages.map((message) => (
            <article
              key={message.message_id}
              className="min-w-0 py-3"
            >
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0 [overflow-wrap:anywhere]">
                  <p className="text-body font-medium text-foreground">
                    {getName(message)}
                  </p>

                  <p className="mt-1 text-caption text-muted-foreground">
                    {message.email ?? message.user_id} -{" "}
                    {new Date(message.created_at).toLocaleString(locale)}
                  </p>
                </div>

                <AdminGroupMessageDeleteButton
                  groupId={groupId}
                  messageId={message.message_id}
                />
              </div>

              <p className="mt-3 max-h-80 overflow-y-auto whitespace-pre-wrap text-body text-foreground [overflow-wrap:anywhere]">
                {message.content}
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
