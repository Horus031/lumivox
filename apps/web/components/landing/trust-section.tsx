import { ArrowRight, BrainCircuit, Database, Eye, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import StoryReveal from "./story/story-reveal";
import TrustPipeline from "./story/trust-pipeline";

const items = [
  { key: "purpose", icon: Database },
  { key: "assistance", icon: BrainCircuit },
  { key: "transparency", icon: Eye },
  { key: "control", icon: ShieldCheck },
] as const;

export default function TrustSection() {
  const t = useTranslations("landing.trust");

  return (
    <section
      data-landing-scene="trust"
      className="transparent-core relative isolate"
    >
      <div className="transparent-core__inner mx-auto max-w-310 px-6">
        <StoryReveal>
          <header className="transparent-core__heading">
            <p className="mb-3 text-[11.5px] font-medium uppercase tracking-[0.18em] text-primary">
              {t("eyebrow")}
            </p>
            <h2>{t("title")}</h2>
            <p className="mt-4 text-[15px] leading-relaxed text-secondary">
              {t("description")}
            </p>
          </header>
        </StoryReveal>

        <div className="transparent-core__layout">
          <div className="transparent-core__diagram">
            <TrustPipeline />
          </div>
          <StoryReveal>
            <div className="transparent-core__principles">
              {items.map(({ key, icon: Icon }, index) => (
                <article key={key} className="trust-principle">
                  <span aria-hidden="true" className="trust-principle__index">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <div className="trust-principle__title">
                      <Icon aria-hidden="true" />
                      <h3>{t(`items.${key}.title`)}</h3>
                    </div>
                    <p>{t(`items.${key}.description`)}</p>
                  </div>
                </article>
              ))}
            </div>
          </StoryReveal>
        </div>
        <Link href="/privacy" className="transparent-core__cta group">
          <span>{t("cta")}</span>
          <ArrowRight aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
