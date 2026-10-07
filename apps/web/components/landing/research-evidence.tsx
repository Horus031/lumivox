import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { modelEvidence } from "@/lib/marketing/evidence";
import StoryReveal from "./story/story-reveal";

export default function ResearchEvidence() {
  const t = useTranslations("landing.researchEvidence");

  return (
    <section
      data-landing-scene="evidence"
      id="evidence"
      className="evidence-chamber relative isolate overflow-hidden"
    >
      <div className="evidence-chamber__inner mx-auto max-w-310 px-6">
        <StoryReveal>
          <header className="evidence-chamber__heading">
            <p className="evidence-chamber__eyebrow">{t("eyebrow")}</p>
            <h2>{t("title")}</h2>
            <p className="evidence-chamber__description">{t("description")}</p>
          </header>
        </StoryReveal>

        <StoryReveal>
          <div className="evidence-orbit">
            <div aria-hidden="true" className="evidence-orbit__field" />
            <svg
              aria-hidden="true"
              className="evidence-orbit__connections"
              viewBox="0 0 1000 560"
            >
              <path d="M500 280 L145 160" />
              <path d="M500 280 L855 160" />
              <path d="M500 280 L185 420" />
              <path d="M500 280 L815 420" />
            </svg>
            <dl className="evidence-orbit__metrics">
              {modelEvidence.map((item, index) => (
                <div
                  key={item.key}
                  data-evidence-position={index}
                  className="evidence-metric"
                >
                  <dd>{item.value}</dd>
                  <dt>{t(`metrics.${item.key}.label`)}</dt>
                  <p>{t(`metrics.${item.key}.description`)}</p>
                </div>
              ))}
            </dl>
            <div aria-hidden="true" className="evidence-orbit__core">
              <span>MODEL</span>
              <strong>v2</strong>
            </div>
          </div>
        </StoryReveal>

        <footer className="evidence-chamber__source">
          <div>
            <span aria-hidden="true" />
            <p>{t("source")}</p>
          </div>
          <Link
            href="/research"
            className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
          >
            {t("cta")}
            <ArrowRight className="size-4" />
          </Link>
        </footer>
      </div>
    </section>
  );
}
