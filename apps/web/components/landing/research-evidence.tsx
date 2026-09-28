import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { modelEvidence } from "@/lib/marketing/evidence";

export default function ResearchEvidence() {
  const t = useTranslations("landing.researchEvidence");

  return (
    <section id="evidence" className="border-y border-border bg-surface py-20">
      <div className="mx-auto max-w-310 px-6">
        <div className="max-w-3xl">
          <p className="mb-3 text-[11.5px] font-medium uppercase tracking-[0.18em] text-primary">
            {t("eyebrow")}
          </p>
          <h2 className="text-[34px] font-semibold leading-tight tracking-tight md:text-[42px]">
            {t("title")}
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-secondary">
            {t("description")}
          </p>
        </div>

        <dl className="mt-10 grid grid-cols-2 border-y border-border md:grid-cols-4">
          {modelEvidence.map((item) => (
            <div
              key={item.key}
              className="border-border px-4 py-7 first:pl-0 md:border-r md:last:border-r-0"
            >
              <dd className="text-[30px] font-semibold tracking-tight text-primary md:text-[36px]">
                {item.value}
              </dd>
              <dt className="mt-1 text-[13px] font-medium">
                {t(`metrics.${item.key}.label`)}
              </dt>
              <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
                {t(`metrics.${item.key}.description`)}
              </p>
            </div>
          ))}
        </dl>

        <div className="mt-6 flex flex-col gap-4 text-[13px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>{t("source")}</p>
          <Link
            href="/research"
            className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
          >
            {t("cta")}
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
