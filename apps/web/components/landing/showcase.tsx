import { Check } from "lucide-react";
import { useTranslations } from "next-intl";

export default function Showcase() {
  const t = useTranslations("landing.showcase");
  const analyticsItems = [
    "peakHours",
    "energy",
    "rewards",
  ] as const;
  const focusModes = ["pomodoro", "deepWork", "custom", "reading"] as const;

  return (
    <section id="analytics" className="py-24">
      <div className="max-w-310 mx-auto px-6 space-y-24">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <p className="text-[11.5px] font-medium tracking-[0.18em] text-primary uppercase mb-3">
              {t("analytics.eyebrow")}
            </p>
            <h3 className="text-[30px] md:text-[36px] font-semibold tracking-tight leading-tight">
              {t("analytics.title")}
            </h3>
            <p className="mt-4 text-secondary text-[15px] leading-relaxed">
              {t("analytics.desc")}
            </p>
            <ul className="mt-6 space-y-3 text-[14px]">
              {analyticsItems.map((item) => (
                <li
                  key={item}
                  className="flex items-center gap-2.5 text-secondary"
                >
                  <span className="size-5 rounded-full bg-success/15 text-success flex items-center justify-center">
                    <Check className="size-3" strokeWidth={3} />
                  </span>
                  {t(`analytics.items.${item}`)}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="lg:order-2">
            <p className="text-[11.5px] font-medium tracking-[0.18em] text-primary uppercase mb-3">
              {t("focus.eyebrow")}
            </p>
            <h3 className="text-[30px] md:text-[36px] font-semibold tracking-tight leading-tight">
              {t("focus.title")}
            </h3>
            <p className="mt-4 text-secondary text-[15px] leading-relaxed">
              {t("focus.desc")}
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {focusModes.map((mode) => (
                <span
                  key={mode}
                  className="px-3 py-1.5 rounded-full border border-border bg-surface text-[12.5px] text-secondary"
                >
                  {t(`focus.modes.${mode}`)}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <p className="text-[11.5px] font-medium tracking-[0.18em] text-primary uppercase mb-3">
              {t("rooms.eyebrow")}
            </p>
            <h3 className="text-[30px] md:text-[36px] font-semibold tracking-tight leading-tight">
              {t("rooms.title")}
            </h3>
            <p className="mt-4 text-secondary text-[15px] leading-relaxed">
              {t("rooms.desc")}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
