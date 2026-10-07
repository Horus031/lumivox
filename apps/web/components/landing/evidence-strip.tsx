import { BarChart3, BrainCircuit, Languages, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";

const items = [
  { key: "planning", icon: BrainCircuit },
  { key: "analytics", icon: BarChart3 },
  { key: "privacy", icon: ShieldCheck },
  { key: "languages", icon: Languages },
] as const;

export default function EvidenceStrip() {
  const t = useTranslations("landing.evidenceStrip");

  return (
    <section
      data-landing-scene="principles"
      aria-label={t("label")}
      className="border-y border-border bg-surface"
    >
      <div className="mx-auto grid max-w-310 grid-cols-2 px-6 md:grid-cols-4">
        {items.map(({ key, icon: Icon }) => (
          <div
            key={key}
            className="flex min-h-24 items-center gap-3 border-border py-5 odd:pr-4 even:pl-4 md:border-r md:px-5 md:last:border-r-0 md:first:pl-0"
          >
            <Icon className="size-5 shrink-0 text-primary" aria-hidden="true" />
            <span className="text-[13px] font-medium leading-snug">
              {t(`items.${key}`)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
