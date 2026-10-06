import { getLocale } from "next-intl/server";

import { redirect } from "next/navigation";

export default async function GoalsPage() {
  const locale = await getLocale();

  redirect(`/${locale}/workspace?goal=all`);
}
