import { useTranslations } from "next-intl";

import { stats } from "@/lib/constants";

export default function Stats() {
  const t = useTranslations("landing.stats");

  return (
    <section className="py-20 border-y border-border bg-linear-to-b from-accent-soft/40 to-transparent">
      <div className="max-w-310 mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8">
        {stats.map((s) => (
          <div key={s.key} className="text-center">
            <p className="text-[34px] md:text-[40px] font-semibold tracking-tight bg-gradient-hero bg-clip-text text-transparent">
              {s.v}
            </p>
            <p className="mt-1 text-[13px] text-secondary">
              {t(`items.${s.key}`)}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
