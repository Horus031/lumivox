import { getTranslations } from "next-intl/server";
import { PageLoading } from "@/features/app-shell/components/page-loading";
export default async function Loading() {
  const t = await getTranslations("studyPlan");
  return <PageLoading label={t("loading")} />;
}
