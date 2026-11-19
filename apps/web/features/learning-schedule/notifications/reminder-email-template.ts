import { z } from "zod";
import type { ReminderEmailContent } from "./reminder-provider.types";

/** 8A preview contract only. A trusted worker must supply owned Task/Session
 * fields and a confirmed profile locale. No browser/Host-header data resolver
 * or operational unsubscribe endpoint is implemented by this pure renderer. */
const contextSchema = z
  .object({
    taskId: z.uuid(),
    taskTitle: z
      .string()
      .trim()
      .min(1)
      .max(500)
      .refine((value) => !/[\u0000-\u001f\u007f\u2028\u2029]/u.test(value)),
    locale: z.enum(["en", "vi"]),
    scheduledStartAt: z.iso.datetime({ offset: true }),
    scheduledEndAt: z.iso.datetime({ offset: true }),
    timezone: z
      .string()
      .min(1)
      .max(128)
      .refine((value) => {
        if (
          (value !== "UTC" && !value.includes("/")) ||
          value.includes(":") ||
          value.startsWith("posix/") ||
          value.startsWith("right/")
        )
          return false;
        try {
          new Intl.DateTimeFormat("en", { timeZone: value }).format(0);
          return true;
        } catch {
          return false;
        }
      }),
    leadMinutes: z.union([z.literal(5), z.literal(15), z.literal(30), z.literal(60)]),
  })
  .strict();
export type TrustedReminderTemplateContext = z.infer<typeof contextSchema>;
export type ReminderTemplateConfig = { trustedOrigin: string; unsubscribeUrl: string };
const copy = {
  en: {
    subject: "Your study session starts soon",
    title: "Lumivox Study Reminder",
    greeting: "Hello,",
    intro: "Your upcoming study session:",
    lead: (minutes: number) => `Reminder ${minutes} minutes before your session.`,
    task: "Open your study task in Lumivox",
    settings: "Change reminder settings",
    unsubscribe: "Unsubscribe from study reminders",
    consent: "You received this email because you enabled study reminders in Lumivox.",
  },
  vi: {
    subject: "Buổi học của bạn sắp bắt đầu",
    title: "Lumivox — Nhắc lịch học",
    greeting: "Xin chào,",
    intro: "Bạn có một buổi học sắp diễn ra:",
    lead: (minutes: number) => `Nhắc trước buổi học ${minutes} phút.`,
    task: "Mở công việc học trong Lumivox",
    settings: "Thay đổi cài đặt nhắc học",
    unsubscribe: "Ngừng nhận email nhắc học",
    consent: "Bạn nhận email này vì đã bật nhắc lịch học trong Lumivox.",
  },
} as const;
function escape(value: string): string {
  const entities: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return value.replace(/[&<>"']/g, (char) => entities[char]);
}
function trustedLinks(config: ReminderTemplateConfig, context: TrustedReminderTemplateContext) {
  try {
    const origin = new URL(config.trustedOrigin),
      unsubscribe = new URL(config.unsubscribeUrl);
    if (
      origin.protocol !== "https:" ||
      origin.username ||
      origin.password ||
      origin.pathname !== "/" ||
      origin.search ||
      origin.hash ||
      unsubscribe.protocol !== "https:" ||
      unsubscribe.origin !== origin.origin ||
      unsubscribe.username ||
      unsubscribe.password ||
      unsubscribe.hash
    )
      throw new Error();
    const task = new URL(`/${context.locale}/workspace`, origin.origin);
    task.searchParams.set("task", context.taskId);
    return {
      task: task.href,
      settings: new URL(`/${context.locale}/settings`, origin.origin).href,
      unsubscribe: unsubscribe.href,
    };
  } catch {
    throw new Error("Invalid trusted reminder links");
  }
}

export function renderReminderEmail(
  raw: unknown,
  config: ReminderTemplateConfig,
): ReminderEmailContent {
  const parsed = contextSchema.safeParse(raw);
  if (!parsed.success) throw new Error("Invalid reminder template context");
  const value = parsed.data,
    c = copy[value.locale],
    links = trustedLinks(config, value);
  const start = new Date(value.scheduledStartAt),
    end = new Date(value.scheduledEndAt);
  if (!(end.getTime() > start.getTime())) throw new Error("Invalid reminder session interval");
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: value.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  if (day.format(start) !== day.format(end))
    throw new Error("Reminder session must remain on one local day");
  const date = new Intl.DateTimeFormat(value.locale === "vi" ? "vi-VN" : "en-US", {
    timeZone: value.timezone,
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(start);
  const clock = new Intl.DateTimeFormat(value.locale === "vi" ? "vi-VN" : "en-GB", {
    timeZone: value.timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const time = `${clock.format(start)}–${clock.format(end)} · ${value.timezone}`;
  const lead = c.lead(value.leadMinutes);
  const text = [
    c.title,
    c.greeting,
    c.intro,
    value.taskTitle,
    date,
    time,
    lead,
    `${c.task}: ${links.task}`,
    c.consent,
    `${c.settings}: ${links.settings}`,
    `${c.unsubscribe}: ${links.unsubscribe}`,
  ].join("\n\n");
  const link = (url: string, label: string) =>
    `<a href="${escape(url)}" style="color:#125c3a;text-decoration:underline">${escape(label)}</a>`;
  const html = `<!doctype html>
<html lang="${value.locale}" dir="ltr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(c.subject)}</title></head>
<body style="margin:0;background:#f4f6f5;color:#18251f;font-family:Arial,sans-serif;line-height:1.6">
<div lang="${value.locale}" dir="ltr"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:24px 12px">
<div style="max-width:560px;margin:auto;padding:24px;background:#ffffff;border:1px solid #dbe3de;border-radius:12px;overflow-wrap:anywhere;word-break:break-word">
<h1 style="font-size:24px;line-height:1.3;margin-top:0">${escape(c.title)}</h1><p>${escape(c.greeting)}</p><p>${escape(c.intro)}</p>
<h2 style="font-size:20px">${escape(value.taskTitle)}</h2><p>${escape(date)}<br>${escape(time)}</p><p>${escape(lead)}</p>
<p>${link(links.task, c.task)}</p><hr style="border:0;border-top:1px solid #dbe3de"><p style="font-size:14px">${escape(c.consent)}</p>
<p style="font-size:14px">${link(links.settings, c.settings)}<br>${link(links.unsubscribe, c.unsubscribe)}</p>
</div></td></tr></table></div></body></html>`;
  return { subject: c.subject, html, text };
}
