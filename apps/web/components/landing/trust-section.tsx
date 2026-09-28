import { BrainCircuit, Database, Eye, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";

const items = [
  { key: "purpose", icon: Database },
  { key: "assistance", icon: BrainCircuit },
  { key: "transparency", icon: Eye },
  { key: "control", icon: ShieldCheck },
] as const;

export default function TrustSection() {
  const t = useTranslations("landing.trust");

  return (
    <section className="border-y border-border bg-elevated/40 py-24">
      <div className="mx-auto max-w-310 px-6">
        <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="mb-3 text-[11.5px] font-medium uppercase tracking-[0.18em] text-primary">
              {t("eyebrow")}
            </p>
            <h2 className="text-[34px] font-semibold leading-tight tracking-tight md:text-[42px]">
              {t("title")}
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-secondary">
              {t("description")}
            </p>
            <Link
              href="/privacy"
              className="mt-6 inline-flex h-10 items-center justify-center rounded-lg border border-border px-4 text-[13px] font-medium hover:bg-surface"
            >
              {t("cta")}
            </Link>
          </div>

          <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2">
            {items.map(({ key, icon: Icon }) => (
              <article key={key} className="bg-surface p-6">
                <Icon className="size-5 text-primary" aria-hidden="true" />
                <h3 className="mt-4 text-[15px] font-semibold">
                  {t(`items.${key}.title`)}
                </h3>
                <p className="mt-2 text-[13px] leading-relaxed text-secondary">
                  {t(`items.${key}.description`)}
                </p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
