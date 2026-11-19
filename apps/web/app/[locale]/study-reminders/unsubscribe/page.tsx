import { notFound } from "next/navigation";
import { hashUnsubscribeToken } from "@/features/learning-schedule/notifications/unsubscribe-token";
export const metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};
export default async function UnsubscribePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { locale } = await params;
  if (locale !== "en" && locale !== "vi") notFound();
  const { token } = await searchParams;
  const valid = hashUnsubscribeToken(token) !== null;
  const vi = locale === "vi";
  return (
    <main lang={locale} className="mx-auto max-w-lg space-y-5 px-6 py-16">
      <h1 className="text-2xl font-semibold">
        {vi ? "Ngừng nhận email nhắc học" : "Unsubscribe from study reminders"}
      </h1>
      <p>
        {vi
          ? "Chỉ ngừng nhận email khi bạn nhấn nút xác nhận bên dưới."
          : "Email reminders stop only when you confirm below."}
      </p>
      {valid ? (
        <form
          method="post"
          action={`/api/study-reminders/unsubscribe?token=${encodeURIComponent(token as string)}`}
        >
          <input type="hidden" name="List-Unsubscribe" value="One-Click" />
          <input type="hidden" name="locale" value={locale} />
          <button
            className="rounded-md bg-foreground px-4 py-3 text-background focus-visible:outline-2 focus-visible:outline-offset-4"
            type="submit"
          >
            {vi ? "Xác nhận ngừng nhận email" : "Confirm unsubscribe"}
          </button>
        </form>
      ) : (
        <p role="status">
          {vi ? "Liên kết không hợp lệ hoặc không khả dụng." : "Invalid or unavailable link."}
        </p>
      )}
    </main>
  );
}
