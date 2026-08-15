import { plans } from "@/lib/constants";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";

type PlanFeatureList = string[];

export default function Pricing() {
  const t = useTranslations("landing.pricing");

  return (
    <section
      id="pricing"
      className="py-24 bg-elevated/40 border-y border-border"
    >
      <div className="max-w-310 mx-auto px-6">
        <div className="max-w-2xl text-center mx-auto mb-12">
          <p className="text-[11.5px] font-medium tracking-[0.18em] text-primary uppercase mb-3">
            {t("eyebrow")}
          </p>
          <h2 className="text-[34px] md:text-[42px] font-semibold tracking-tight leading-tight">
            {t("title")}
          </h2>
          <p className="mt-3 text-secondary text-[15px]">
            {t("subtitle")}
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-5">
          {plans.map((p) => {
            const features = t.raw(
              `plans.${p.key}.features`
            ) as PlanFeatureList;

            return (
              <div
                key={p.key}
                className={
                  "relative rounded-2xl border p-7 bg-surface transition-all " +
                  (p.highlighted
                    ? "border-primary shadow-lg lg:scale-[1.03]"
                    : "border-border hover:shadow-md")
                }
              >
                {p.highlighted && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-primary text-primary-foreground text-[11px] font-medium tracking-wide">
                    {t("popular")}
                  </span>
                )}
                <p className="text-[13px] font-medium text-secondary">
                  {t(`plans.${p.key}.name`)}
                </p>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-[36px] font-semibold tracking-tight">
                    {t(`plans.${p.key}.price`)}
                  </span>
                  <span className="text-[13px] text-muted-foreground">
                    {t(`plans.${p.key}.period`)}
                  </span>
                </div>
                <p className="mt-2 text-[13.5px] text-secondary">
                  {t(`plans.${p.key}.desc`)}
                </p>
                <ul className="mt-5 space-y-2.5 text-[13.5px]">
                  {features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-2 text-secondary"
                    >
                      <Check className="size-4 text-success shrink-0 mt-0.5" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/auth/sign-up"
                  className={
                    "mt-6 inline-flex w-full items-center justify-center h-10 rounded-lg text-[13.5px] font-medium transition-colors " +
                    (p.highlighted
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "border border-border text-foreground hover:bg-elevated")
                  }
                >
                  {t(`plans.${p.key}.cta`)}
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
