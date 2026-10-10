import { useTranslations } from "next-intl";
import ProductShowcaseImage, {
  showcaseImages,
  type ShowcaseProduct,
} from "./product-showcase-image";

const products = [
  {
    key: "analytics",
  },
  {
    key: "focus",
  },
  {
    key: "rooms",
  },
] as const;

export function ProductShowcaseMobileVisual({
  product,
  alt,
}: {
  product: ShowcaseProduct;
  alt: string;
}) {
  const image = showcaseImages[product].light;

  return (
    <div
      className="product-chapter__mobile-visual"
      style={{ aspectRatio: `${image.width} / ${image.height}` }}
    >
      <ProductShowcaseImage
        product={product}
        alt={alt}
        sizes="(max-width: 767px) calc(100vw - 48px), 720px"
      />
    </div>
  );
}

export default function ProductShowcaseStage() {
  const t = useTranslations("landing.showcase");

  return (
    <div className="product-stage">
      <div aria-hidden="true" className="product-stage__aura" />

      <div className="product-stage__frame">
        <div aria-hidden="true" className="product-stage__chrome">
          <div className="product-stage__traffic">
            <span />
            <span />
            <span />
          </div>

          <div className="product-stage__address">lumivox</div>
        </div>

        <div className="product-stage__viewport">
          {products.map((product) => (
            <figure
              key={product.key}
              aria-hidden={product.key !== "analytics"}
              data-product-visual={product.key}
              data-active={product.key === "analytics" ? "" : undefined}
              className="product-stage__visual"
            >
              <ProductShowcaseImage
                product={product.key}
                alt={t(`${product.key}.imageAlt`)}
                sizes="(min-width: 1280px) 680px, 58vw"
              />
            </figure>
          ))}
        </div>
      </div>

      <div aria-hidden="true" className="product-stage__index">
        <span data-product-index="analytics">01</span>
        <span data-product-index="focus">02</span>
        <span data-product-index="rooms">03</span>

        <span className="product-stage__index-total">/03</span>
      </div>
    </div>
  );
}
