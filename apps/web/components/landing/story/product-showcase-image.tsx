import Image, { getImageProps } from "next/image";

import analyticsLight from "@/public/showcase/light/landing-analytics-light.webp";
import analyticsDark from "@/public/showcase/dark/landing-analytics-dark.webp";
import focusLight from "@/public/showcase/light/landing-focus-light.webp";
import focusDark from "@/public/showcase/dark/landing-focus-dark.webp";
import roomsLight from "@/public/showcase/light/landing-room-light.webp";
import roomsDark from "@/public/showcase/dark/landing-room-dark.webp";

export const showcaseImages = {
  analytics: { light: analyticsLight, dark: analyticsDark },
  focus: { light: focusLight, dark: focusDark },
  rooms: { light: roomsLight, dark: roomsDark },
};

export type ShowcaseProduct = keyof typeof showcaseImages;

export default function ProductShowcaseImage({
  product,
  alt,
  sizes,
}: {
  product: ShowcaseProduct;
  alt: string;
  sizes: string;
}) {
  const images = showcaseImages[product];
  const { props: darkProps } = getImageProps({
    src: images.dark,
    alt,
    fill: true,
    sizes,
  });

  return (
    <picture className="product-showcase-picture">
      <source
        data-showcase-theme-source
        media="not all"
        srcSet={darkProps.srcSet}
        sizes={sizes}
      />
      <Image
        src={images.light}
        alt={alt}
        fill
        sizes={sizes}
        loading="lazy"
        className="object-contain"
      />
    </picture>
  );
}
