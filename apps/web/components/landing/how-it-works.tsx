import { useTranslations } from "next-intl";

import { steps } from "@/lib/constants";

import LearningJourneyController from "./story/learning-journey-controller";
import JourneyVisualStage, {
  JourneyIllustration,
} from "./story/journey-visual-stage";

export default function HowItWorks() {
  const t = useTranslations("landing.howItWorks");

  return (
    <section
      id="how"
      data-landing-scene="workflow"
      data-learning-journey
      className="learning-journey relative isolate overflow-hidden"
    >
      <LearningJourneyController />
      <div className="mx-auto max-w-310 px-6">
        <header className="learning-journey__heading">
          <p className="text-[11.5px] font-medium tracking-[0.18em] text-primary uppercase mb-3">
            {t("eyebrow")}
          </p>

          <h2 className="text-[34px] md:text-[42px] font-semibold tracking-tight leading-tight">
            {t("title")}
          </h2>
        </header>

        <div className="learning-journey__layout">
          <div className="learning-journey__chapters">
            {steps.map((step) => {
              const Icon = step.icon;

              return (
                <article
                  key={step.key}
                  data-journey-step={step.key}
                  className="journey-chapter"
                >
                  <div className="journey-chapter__meta">
                    <span>{step.n}</span>
                    <span className="journey-chapter__rule" />
                    <Icon aria-hidden="true" className="size-4" />
                  </div>

                  <h3>{t(`steps.${step.key}.title`)}</h3>

                  <p>{t(`steps.${step.key}.desc`)}</p>
                  <div
                    aria-hidden="true"
                    className={`journey-mobile-visual journey-mobile-visual--${step.key}`}
                  >
                    <JourneyIllustration step={step.key} />
                  </div>
                </article>
              );
            })}
          </div>

          <JourneyVisualStage />
        </div>
      </div>
    </section>
  );
}
