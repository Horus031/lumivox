import { useTranslations } from "next-intl";

import { faqs } from "@/lib/constants";

export default function FAQ() {
  const t = useTranslations("landing.faq");

  return (
    <section
      data-landing-scene="resolution"
      id="faq"
      className="quiet-resolution relative isolate"
    >
      <div className="quiet-resolution__inner mx-auto max-w-310 px-6">
        <header className="quiet-resolution__heading">
          <p>{t("eyebrow")}</p>
          <h2>{t("title")}</h2>
        </header>
        <div className="quiet-resolution__questions">
          {faqs.map((f, index) => (
            <details key={f.key} className="resolution-item">
              <summary className="resolution-item__summary">
                <span aria-hidden="true" className="resolution-item__index">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3>{t(`items.${f.key}.question`)}</h3>
                <span aria-hidden="true" className="resolution-item__toggle">
                  <i />
                  <i />
                </span>
              </summary>
              <div className="resolution-item__answer">
                <p>{t(`items.${f.key}.answer`)}</p>
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
