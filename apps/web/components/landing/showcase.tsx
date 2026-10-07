import { useTranslations } from "next-intl";
import ProductShowcaseController from "./story/product-showcase-controller";
import ProductShowcaseStage, {
  ProductShowcaseMobileVisual,
} from "./story/product-showcase-stage";

export default function Showcase() {
  const t = useTranslations("landing.showcase");
  const analyticsItems = ["peakHours", "energy", "rewards"] as const;
  const focusModes = ["pomodoro", "deepWork", "custom", "reading"] as const;

  return (
    <section
      data-landing-scene="product"
      data-product-story
      id="analytics"
      className="product-theater relative isolate"
    >
      <ProductShowcaseController />

      <div className="product-theater__story">
        <div className="product-theater__stage">
          <ProductShowcaseStage />
        </div>

        <div className="product-theater__chapters">
          <article data-product-chapter="analytics" className="product-chapter">
            <span className="product-chapter__index">01 / Analytics</span>

            <h3>{t("analytics.title")}</h3>

            <p>{t("analytics.desc")}</p>

            <ul className="product-chapter__signals">
              {analyticsItems.map((item) => (
                <li key={item}>
                  <span aria-hidden="true" />
                  {t(`analytics.items.${item}`)}
                </li>
              ))}
            </ul>
            <ProductShowcaseMobileVisual
              src="/landing-analytics.jpg"
              alt={t("analytics.imageAlt")}
            />
          </article>

          <article data-product-chapter="focus" className="product-chapter">
            <span className="product-chapter__index">02 / Focus</span>
            <h3>{t("focus.title")}</h3>
            <p>{t("focus.desc")}</p>
            <div className="product-chapter__modes">
              {focusModes.map((mode, index) => (
                <span key={mode}>
                  {index > 0 && <span aria-hidden="true">&middot; </span>}
                  {t(`focus.modes.${mode}`)}
                </span>
              ))}
            </div>
            <ProductShowcaseMobileVisual
              src="/landing-focus.jpg"
              alt={t("focus.imageAlt")}
            />
          </article>

          <article data-product-chapter="rooms" className="product-chapter">
            <span className="product-chapter__index">03 / Study rooms</span>
            <h3>{t("rooms.title")}</h3>
            <p>{t("rooms.desc")}</p>
            <ProductShowcaseMobileVisual
              src="/landing-room.jpg"
              alt={t("rooms.imageAlt")}
            />
          </article>
        </div>
      </div>
    </section>
  );
}
