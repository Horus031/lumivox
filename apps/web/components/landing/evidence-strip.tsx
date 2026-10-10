import { BarChart3, BrainCircuit, Languages, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import StoryLine from "./story/story-line";

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
      className="principle-constellation principle-constellation--light relative isolate overflow-hidden"
    >
      <StoryLine />
      <div className="principle-constellation__field mx-auto max-w-310 px-6">
        <div aria-hidden="true" className="principle-constellation__core" />

        <svg
          aria-hidden="true"
          viewBox="0 0 1000 420"
          className="principle-constellation__connections"
        >
          <path d="M500 210 L230 110" />
          <path d="M500 210 L770 110" />
          <path d="M500 210 L250 320" />
          <path d="M500 210 L750 320" />
        </svg>

        <ul className="principle-constellation__nodes">
          {items.map(({ key, icon: Icon }, index) => (
            <li
              key={key}
              data-principle-node
              data-node-position={index}
              className="principle-node"
            >
              <span aria-hidden="true" className="principle-node__signal">
                <Icon className="size-4" />
              </span>

              <span className="principle-node__text">{t(`items.${key}`)}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
