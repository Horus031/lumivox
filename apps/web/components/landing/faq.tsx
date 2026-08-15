import { useTranslations } from "next-intl";

import { faqs } from "@/lib/constants";

export default function FAQ() {
  const t = useTranslations("landing.faq");

  return (
    <section id="faq" className="py-24">
      <div className="max-w-215 mx-auto px-6">
        <div className="text-center mb-12">
          <p className="text-[11.5px] font-medium tracking-[0.18em] text-primary uppercase mb-3">
            {t("eyebrow")}
          </p>
          <h2 className="text-[34px] md:text-[42px] font-semibold tracking-tight">
            {t("title")}
          </h2>
        </div>
        <div className="divide-y divide-border border-y border-border">
          {faqs.map((f) => (
            <details key={f.key} className="group py-5">
              <summary className="flex items-center justify-between cursor-pointer list-none">
                <h3 className="text-[15.5px] font-medium pr-6">
                  {t(`items.${f.key}.question`)}
                </h3>
                <span className="size-7 rounded-full border border-border flex items-center justify-center text-secondary group-open:rotate-45 transition-transform">
                  +
                </span>
              </summary>
              <p className="mt-3 text-[14px] text-secondary leading-relaxed">
                {t(`items.${f.key}.answer`)}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
