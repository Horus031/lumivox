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
    <section className="rounded-2xl border bg-surface p-6 shadow-sm">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          {t("eyebrow")}
        </p>

        <h2 className="mt-2 text-2xl font-bold text-foreground">
          {t("title")}
        </h2>
      </div>

      {messages.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {t("empty")}
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {messages.map((message) => (
            <article
              key={message.message_id}
              className="rounded-2xl bg-surface p-4"
            >
              <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                <div>
                  <p className="font-semibold text-foreground">
                    {getName(message)}
                  </p>

                  <p className="text-xs text-muted-foreground">
                    {message.email ?? message.user_id} -{" "}
                    {new Date(message.created_at).toLocaleString(locale)}
                  </p>
                </div>

                <AdminGroupMessageDeleteButton
                  groupId={groupId}
                  messageId={message.message_id}
                />
              </div>

              <p className="mt-4 whitespace-pre-wrap bg-surface border p-2 px-4 rounded-xl text-sm leading-6 text-foreground">
                {message.content}
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
