import { ArrowRight, Check } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import HeroMotionController from "./story/hero-motion-controller";
import StoryReveal from "./story/story-reveal";

export default function Hero() {
  const t = useTranslations("landing.hero");
  const proofItems = ["freePlan", "noCard", "private"] as const;

  return (
    <section
      data-landing-scene="hero"
      data-landing-hero
      className="landing-hero landing-hero--light relative isolate min-h-[calc(100svh-4rem)] overflow-hidden"
    >
      <HeroMotionController />
      <div className="absolute inset-0 -z-10 bg-background">
        <video
          data-hero-video
          poster="/landing-hero.webp"
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          className="landing-hero__video absolute inset-0 size-full object-cover"
        >
          <source
            src="/hero-brain-loop.mp4"
            type="video/mp4"
            media="(min-width: 768px) and (prefers-reduced-motion: no-preference)"
          />
        </video>

        <div className="landing-hero__veil absolute inset-0" />
        <div className="landing-hero__halo absolute inset-0" />
        <div aria-hidden="true" className="landing-hero__readability absolute inset-0" />
        <div className="landing-hero__grain absolute inset-0" />
        <div className="landing-hero__edge absolute inset-0" />
      </div>

      <div className="landing-hero__content relative z-20 mx-auto flex min-h-[calc(100svh-4rem)] max-w-310 flex-col items-center justify-center px-6 pb-28 pt-24 text-center">
        <StoryReveal>
          <div className="landing-hero__badge mb-7 inline-flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.22em] text-white/68">
            <span className="h-px w-7 bg-white/30" />

            <span className="size-1.5 rounded-full bg-[#83b895] shadow-[0_0_16px_rgba(131,184,149,.8)]" />

            {t("badge")}

            <span className="h-px w-7 bg-white/30" />
          </div>
        </StoryReveal>

        <StoryReveal>
          <h1 className="max-w-[980px] text-balance text-[clamp(3rem,7.2vw,6.6rem)] font-semibold leading-[0.98] tracking-[-0.055em] text-white drop-shadow-[0_12px_44px_rgba(0,0,0,.42)]">
            {t("title.before")}{" "}
            <span className="bg-linear-to-r from-white via-[#d9eee0] to-[#89bd9a] bg-clip-text text-transparent">
              {t("title.accent")}
            </span>
            {t("title.after")}
          </h1>
        </StoryReveal>

        <StoryReveal>
          <p className="landing-hero__subtitle mx-auto mt-8 max-w-2xl text-[15.5px] font-medium leading-7 md:text-[17px]">
            {t("subtitle")}
          </p>
        </StoryReveal>

        <StoryReveal>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Link
              href="/auth/sign-up"
              className="landing-hero__primary group inline-flex items-center gap-2 h-12 px-6 rounded-full bg-white text-[#0d110f] text-[14.5px] font-medium hover:bg-white/90 transition-colors"
            >
              {t("primaryCta")}
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <a
              href="#how"
              className="landing-hero__secondary inline-flex items-center gap-2 h-12 px-6 rounded-full border border-white/16 bg-white/[0.045] backdrop-blur-md text-[14.5px] font-medium text-white hover:bg-white/15 transition-colors"
            >
              {t("secondaryCta")}
            </a>
          </div>
        </StoryReveal>

        <StoryReveal>
          <div className="landing-hero__proof mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11.5px] text-white/48">
            {proofItems.map((item, index) => (
              <span key={item} className="flex items-center gap-1.5">
                {index > 0 && (
                  <span aria-hidden="true" className="mr-3.5">
                    &middot;
                  </span>
                )}
                <Check className="size-3" /> {t(`proof.${item}`)}
              </span>
            ))}
          </div>
        </StoryReveal>
      </div>

      <div aria-hidden="true" className="hero-signal hero-signal--ai">
        <span className="hero-signal__dot" />
        <span className="hero-signal__line" />
        <div className="hero-signal__content">
          <span className="hero-signal__label">
            {t("floating.aiSuggested.title")}
          </span>
          <span className="hero-signal__meta">
            {t("floating.aiSuggested.subtitle")}
          </span>
        </div>
      </div>

      <div aria-hidden="true" className="hero-signal hero-signal--timer">
        <span className="hero-signal__dot" />
        <span className="hero-signal__line" />
        <div className="hero-signal__content">
          <span className="hero-signal__label">
            {t("floating.focusTimer.title")}
          </span>
          <span className="hero-signal__meta">
            {t("floating.focusTimer.subtitle")}
          </span>
        </div>
      </div>

      <div aria-hidden="true" className="hero-signal hero-signal--streak">
        <span className="hero-signal__dot" />
        <span className="hero-signal__line" />
        <div className="hero-signal__content">
          <span className="hero-signal__label">
            {t("floating.streak.title")}
          </span>
          <span className="hero-signal__meta">
            {t("floating.streak.subtitle")}
          </span>
        </div>
      </div>

      <div aria-hidden="true" className="hero-signal hero-signal--consistency">
        <span className="hero-signal__dot" />
        <span className="hero-signal__line" />
        <div className="hero-signal__content">
          <span className="hero-signal__label">
            {t("floating.consistency.title")}
          </span>
          <span className="hero-signal__meta">
            {t("floating.consistency.subtitle")}
          </span>
        </div>
      </div>

      <div
        aria-hidden="true"
        data-landing-motion="decorative"
        className="hero-filament"
      >
        <span className="hero-filament__origin" />
        <span className="hero-filament__beam" />
      </div>
    </section>
  );
}
