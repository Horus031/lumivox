import { useTranslations } from "next-intl";
import { PageLoading } from "@/features/app-shell/components/page-loading";

export default function ProtectedLoading() {
  const t = useTranslations("common");
  return <PageLoading label={t("loading")} />;
}
