import {
  ArrowRight,
  BrainCircuit,
  CircleDollarSign,
  ShieldCheck,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import ConvergenceVisual from "./story/convergence-visual";
import StoryReveal from "./story/story-reveal";

export default function CTA() {
  const t = useTranslations("landing.cta");

  return (
    <section
      data-landing-scene="convergence"
      className="final-convergence relative isolate overflow-hidden"
    >
      <div className="final-convergence__field">
        <ConvergenceVisual />
      </div>
      <div className="final-convergence__content mx-auto max-w-310 px-6">
        <StoryReveal distance={18}>
          <div className="final-convergence__copy">
            <p className="final-convergence__eyebrow">Lumivox</p>
            <h2>{t("title")}</h2>
            <p className="final-convergence__subtitle">{t("subtitle")}</p>
            <div className="final-convergence__actions">
              <Link
                href="/auth/sign-up"
                className="final-convergence__primary group"
              >
                {t("primaryCta")}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
              <Link
                href="/features"
                className="final-convergence__secondary"
              >
                {t("secondaryCta")}
              </Link>
            </div>
            <div className="final-convergence__proof">
              <span>
                <CircleDollarSign aria-hidden="true" /> {t("proof.explore")}
              </span>
              <span>
                <ShieldCheck aria-hidden="true" /> {t("proof.privacy")}
              </span>
              <span>
                <BrainCircuit aria-hidden="true" /> {t("proof.behavior")}
              </span>
            </div>
          </div>
        </StoryReveal>
      </div>
    </section>
  );
}
