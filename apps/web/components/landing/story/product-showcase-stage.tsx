import Image from "next/image";
import { useTranslations } from "next-intl";

const products = [
  {
    key: "analytics",
    src: "/landing-analytics.jpg",
  },
  {
    key: "focus",
    src: "/landing-focus.jpg",
  },
  {
    key: "rooms",
    src: "/landing-room.jpg",
  },
] as const;

export function ProductShowcaseMobileVisual({
  src,
  alt,
}: {
  src: string;
  alt: string;
}) {
  return (
    <div className="product-chapter__mobile-visual">
      <Image src={src} alt={alt} fill sizes="100vw" className="object-cover" />
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
              className="product-stage__visual"
            >
              <Image
                src={product.src}
                alt={t(`${product.key}.imageAlt`)}
                fill
                sizes="(min-width: 1024px) 64vw, 100vw"
                className="object-cover"
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
