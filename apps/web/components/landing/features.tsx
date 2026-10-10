import Image from "next/image";
import { useTranslations } from "next-intl";

import { features } from "@/lib/constants";

import IntelligenceController from "./story/intelligence-controller";

export default function Features() {
  const t = useTranslations("landing.features");

  return (
    <section
      data-landing-scene="intelligence"
      id="features"
      className="relative py-24"
    >
      <div className="max-w-310 mx-auto px-6">
        <div className="max-w-2xl mx-auto text-center mb-14">
          <p className="text-[11.5px] font-medium tracking-[0.18em] text-primary uppercase mb-3">
            {t("eyebrow")}
          </p>
          <h2 className="text-[34px] md:text-[42px] font-semibold tracking-tight leading-tight">
            {t("title.before")}{" "}
            <span className="italic text-secondary">{t("title.accent")}</span>{" "}
            {t("title.after")}
          </h2>
          <p className="mt-4 text-secondary text-[15.5px] leading-relaxed">
            {t("subtitle")}
          </p>
        </div>

        <div data-intelligence-system className="intelligence-system">
          <IntelligenceController />

          <div className="intelligence-system__stage">
            <div aria-hidden="true" className="intelligence-core">
              <div className="intelligence-core__halo" />

              <div className="intelligence-core__center">
                <Image src="/logo.png" alt="" width={52} height={52} />
              </div>

              {features.map((feature, index) => {
                const Icon = feature.icon;

                return (
                  <div
                    key={feature.key}
                    data-intelligence-node={feature.key}
                    data-node-position={index}
                    className="intelligence-node"
                  >
                    <Icon className="size-5" />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="intelligence-system__chapters">
            {features.map((feature, index) => (
              <article
                key={feature.key}
                data-intelligence-feature={feature.key}
                className="intelligence-chapter"
              >
                <span
                  aria-hidden="true"
                  className="intelligence-chapter__index"
                >
                  {String(index + 1).padStart(2, "0")}
                </span>

                <h3>{t(`items.${feature.key}.title`)}</h3>

                <p>{t(`items.${feature.key}.desc`)}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
