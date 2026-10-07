Mình đã verify commit Phase 4 `b36b998e02ac03f5a6e4d825141fc666ee680fad`.

**Phase 4: PASS hoàn toàn.** Vercel preview hiện đã chuyển sang **READY** và GitHub Vercel status là `success`. `HowItWorks` không còn card grid; desktop có chapters + sticky visual stage; mobile có illustration riêng từng step; `useScroll` chỉ cập nhật `--journey-progress`; reduced-motion khóa progress về static state; và `IntelligenceController` cũng đã được sửa sang visibility-map deterministic. Việc bạn dùng `overflow: clip` thay vì `overflow: hidden` cho `.learning-journey` cũng là lựa chọn đúng vì không phá sticky ancestor.

Một cleanup rất nhỏ, không cần block: `JourneyIllustration` hiện nhận `step: string`; sau này có thể đổi thành union `"capture" | "focus" | "patterns"` để TypeScript bắt typo tốt hơn.

# Phase 5 — Persistent Product Showcase

Đây là section quan trọng cuối cùng ở nửa giữa landing vẫn còn layout SaaS truyền thống:

```text
text | screenshot
screenshot | text
text | screenshot
```

Phase này sẽ biến nó thành một **Product Theater** duy nhất:

```text
                  persistent Lumivox viewport
             ┌───────────────────────────────┐
Analytics →  │                               │
             │        product screen         │
Focus     →  │       changes in place        │
             │                               │
Rooms     →  │                               │
             └───────────────────────────────┘
```

Khi user scroll:

```text
Analytics
    ↓
Focus
    ↓
Study Rooms
```

screenshot không “xuất hiện thành ba block riêng” nữa; nó chuyển cảnh trong cùng một viewport.

Điều này sẽ tạo cảm giác như đang xem một product demo cinematic.

---

## 1. Tạo Product Showcase Controller

Tạo:

```text
apps/web/components/landing/story/product-showcase-controller.tsx
```

```tsx
"use client";

import { useEffect, useRef } from "react";

export default function ProductShowcaseController() {
  const anchorRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const root = anchorRef.current?.closest<HTMLElement>(
      "[data-product-story]",
    );

    if (!root) return;

    const chapters = Array.from(
      root.querySelectorAll<HTMLElement>("[data-product-chapter]"),
    );

    const visuals = Array.from(
      root.querySelectorAll<HTMLElement>("[data-product-visual]"),
    );

    const visible = new Map<Element, number>();

    const activate = (product: string) => {
      if (root.dataset.activeProduct === product) return;

      root.dataset.activeProduct = product;

      chapters.forEach((chapter) => {
        chapter.toggleAttribute(
          "data-active",
          chapter.dataset.productChapter === product,
        );
      });

      visuals.forEach((visual) => {
        visual.toggleAttribute(
          "data-active",
          visual.dataset.productVisual === product,
        );
      });

      window.dispatchEvent(
        new CustomEvent("landing:product-change", {
          detail: { product },
        }),
      );
    };

    const first = chapters[0]?.dataset.productChapter;

    if (first) activate(first);

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            visible.set(entry.target, entry.intersectionRatio);
          } else {
            visible.delete(entry.target);
          }
        });

        const active = [...visible.entries()].sort(
          (a, b) =>
            b[1] - a[1] ||
            chapters.indexOf(a[0] as HTMLElement) -
              chapters.indexOf(b[0] as HTMLElement),
        )[0]?.[0] as HTMLElement | undefined;

        const product = active?.dataset.productChapter;

        if (product) activate(product);
      },
      {
        rootMargin: "-34% 0px -38% 0px",
        threshold: [0, 0.25, 0.5, 0.75],
      },
    );

    chapters.forEach((chapter) => observer.observe(chapter));

    return () => observer.disconnect();
  }, []);

  return (
    <span
      ref={anchorRef}
      aria-hidden="true"
      className="pointer-events-none absolute size-px opacity-0"
    />
  );
}
```

Không `useScroll()`.

Không scrub screenshot.

Section này dùng **event-driven transitions**.

---

# 2. Tạo Product Stage

Tạo:

```text
apps/web/components/landing/story/product-showcase-stage.tsx
```

```tsx
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
```

Ba ảnh vẫn giữ alt hiện tại.

Không thêm asset mới.

---

# 3. Rewrite `Showcase`

Root:

```tsx
<section
  data-landing-scene="product"
  data-product-story
  id="analytics"
  className="product-theater relative isolate"
>
```

Import:

```tsx
import ProductShowcaseController from "./story/product-showcase-controller";
import ProductShowcaseStage from "./story/product-showcase-stage";
```

Không còn import `Image`.

Structure chính:

```tsx
<ProductShowcaseController />

<div className="product-theater__story">
  <div className="product-theater__stage">
    <ProductShowcaseStage />
  </div>

  <div className="product-theater__chapters">
    ...
  </div>
</div>
```

Điểm khác biệt với Intelligence System: stage lần này chiếm gần toàn viewport và chapters **overlay lên theater**, thay vì một grid 50/50.

---

# 4. Analytics chapter

```tsx
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
</article>
```

Không circular check badges nữa.

CSS signal:

```css
.product-chapter__signals li {
  display: flex;
  align-items: center;
  gap: 10px;

  font-size: 12.5px;
  line-height: 1.6;

  color: rgb(236 240 237 / 0.55);
}

.product-chapter__signals li > span {
  width: 4px;
  height: 4px;

  flex: none;

  border-radius: 999px;

  background: var(--landing-mint);

  box-shadow: 0 0 12px rgb(131 184 149 / 0.45);
}
```

---

# 5. Focus chapter

Không dùng pill buttons cho modes.

Dùng một monospace rail:

```tsx
<div className="product-chapter__modes">
  {focusModes.map((mode, index) => (
    <span key={mode}>
      {index > 0 && <span aria-hidden="true">·</span>}

      {t(`focus.modes.${mode}`)}
    </span>
  ))}
</div>
```

CSS:

```css
.product-chapter__modes {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;

  margin-top: 1.75rem;

  font-family: var(--font-mono);
  font-size: 10px;

  color: rgb(236 240 237 / 0.46);
}
```

---

# 6. Rooms chapter

Rooms có thể tối giản:

```tsx
<article data-product-chapter="rooms" className="product-chapter">
  <span className="product-chapter__index">03 / Study rooms</span>

  <h3>{t("rooms.title")}</h3>

  <p>{t("rooms.desc")}</p>
</article>
```

Không cần bịa thêm feature text.

---

# 7. Product Theater background

Section này nên là phần tối nhất sau Hero.

```css
.product-theater {
  color: var(--landing-pearl);

  background: linear-gradient(
    180deg,
    var(--background) 0%,
    #08110b 8rem,
    #07100b calc(100% - 8rem),
    var(--background) 100%
  );
}
```

Điều này tạo transition:

```text
Journey light
   ↓
dark product theater
   ↓
Evidence light
```

Về sau Phase 6 chúng ta sẽ làm transition sang research đẹp hơn nữa.

---

# 8. Overlapping story architecture

Đây là phần làm Product Showcase khác các section trước.

```css
.product-theater__story {
  position: relative;

  display: grid;

  grid-template-columns: 1fr;

  max-width: 100%;
}

.product-theater__stage,
.product-theater__chapters {
  grid-column: 1;
  grid-row: 1;
}
```

Stage:

```css
.product-theater__stage {
  position: sticky;

  top: 4rem;

  align-self: start;

  height: calc(100svh - 4rem);

  display: grid;
  place-items: center;

  overflow: hidden;
}
```

Chapters:

```css
.product-theater__chapters {
  position: relative;
  z-index: 10;

  width: min(28rem, 38vw);

  margin-left: max(2rem, calc((100vw - 77.5rem) / 2));

  padding-block: 22vh;
}
```

Mỗi chapter:

```css
.product-chapter {
  min-height: 78vh;

  display: flex;
  flex-direction: column;
  justify-content: center;

  opacity: 0.22;

  transform: translate3d(0, 24px, 0);

  transition:
    opacity 650ms var(--landing-ease-out),
    transform 850ms var(--landing-ease-cinematic);
}

.product-chapter[data-active] {
  opacity: 1;

  transform: translate3d(0, 0, 0);
}
```

---

# 9. Text readability

Vì text overlay lên screenshot, stage cần left-side cinematic veil:

```css
.product-stage::after {
  content: "";

  position: absolute;
  inset: 0;

  pointer-events: none;

  background: linear-gradient(
    90deg,
    #07100b 0%,
    rgb(7 16 11 / 0.94) 18%,
    rgb(7 16 11 / 0.55) 37%,
    transparent 62%
  );
}
```

Screenshot vẫn nhìn rõ phần phải.

Text đọc rõ phần trái.

Không đặt text vào glass card.

---

# 10. Product stage

```css
.product-stage {
  position: relative;

  width: min(78rem, calc(100vw - 4rem));

  aspect-ratio: 16 / 10;
}
```

Frame:

```css
.product-stage__frame {
  position: absolute;
  inset: 6% 3%;

  overflow: hidden;

  border: 1px solid rgb(236 240 237 / 0.1);

  border-radius: 18px;

  background: #0a0e0c;

  box-shadow:
    0 50px 120px rgb(0 0 0 / 0.42),
    0 0 0 1px rgb(255 255 255 / 0.02);
}
```

Đây là một trong số ít nơi rounded rectangle phù hợp vì nó **thực sự đại diện browser/product viewport**, không phải generic content card.

---

# 11. Browser chrome

```css
.product-stage__chrome {
  height: 42px;

  display: flex;
  align-items: center;

  gap: 16px;

  padding-inline: 16px;

  border-bottom: 1px solid rgb(236 240 237 / 0.07);

  background: rgb(255 255 255 / 0.025);
}
```

Traffic lights:

```css
.product-stage__traffic {
  display: flex;
  gap: 5px;
}

.product-stage__traffic span {
  width: 5px;
  height: 5px;

  border-radius: 50%;

  background: rgb(236 240 237 / 0.24);
}
```

Không đỏ/vàng/xanh kiểu macOS.

Chúng chỉ là neutral system dots.

---

# 12. Screenshot viewport

```css
.product-stage__viewport {
  position: relative;

  height: calc(100% - 42px);

  overflow: hidden;
}

.product-stage__visual {
  position: absolute;
  inset: 0;

  margin: 0;

  opacity: 0;

  transform: scale(1.035) translate3d(0, 10px, 0);

  transition:
    opacity 650ms var(--landing-ease-out),
    transform 1100ms var(--landing-ease-cinematic);
}

.product-stage__visual[data-active] {
  z-index: 2;

  opacity: 1;

  transform: scale(1) translate3d(0, 0, 0);
}
```

Không blur transition.

Blur screenshot lớn khá tốn GPU và thường làm animation nhìn rẻ.

---

# 13. Product aura

```css
.product-stage__aura {
  position: absolute;

  left: 50%;
  top: 48%;

  width: 68%;
  aspect-ratio: 1;

  border-radius: 50%;

  background: radial-gradient(circle, rgb(51 125 77 / 0.17), transparent 68%);

  transform: translate(-50%, -50%);

  filter: blur(48px);
}
```

Chỉ một aura.

Không thêm particles.

---

# 14. Stage index

Bottom-right:

```css
.product-stage__index {
  position: absolute;

  right: 5%;
  bottom: 2%;

  z-index: 4;

  display: flex;
  align-items: baseline;

  font-family: var(--font-mono);

  font-size: 11px;

  color: rgb(236 240 237 / 0.38);
}
```

Các index:

```css
.product-stage__index > span:not(.product-stage__index-total) {
  display: none;

  color: var(--landing-mint);
}

[data-product-story][data-active-product="analytics"]
  [data-product-index="analytics"],
[data-product-story][data-active-product="focus"] [data-product-index="focus"],
[data-product-story][data-active-product="rooms"] [data-product-index="rooms"] {
  display: inline;
}
```

---

# 15. Chapter typography

```css
.product-chapter__index {
  margin-bottom: 1.25rem;

  font-family: var(--font-mono);

  font-size: 10px;

  text-transform: uppercase;

  color: var(--landing-mint);
}

.product-chapter h3 {
  max-width: 26rem;

  font-size: clamp(2.2rem, 4vw, 4.2rem);

  font-weight: 600;

  line-height: 0.98;

  letter-spacing: -0.045em;
}

.product-chapter p {
  max-width: 28rem;

  margin-top: 1.25rem;

  font-size: 14.5px;

  line-height: 1.85;

  color: rgb(236 240 237 / 0.58);
}
```

---

# 16. Mobile phải khác desktop

Dưới `1024px`, **không giữ persistent sticky viewport**.

Mobile trở về:

```text
Analytics text
Analytics screenshot

Focus text
Focus screenshot

Rooms text
Rooms screenshot
```

Nhưng visual styling vẫn cinematic, không phải layout cũ.

Cách sạch nhất là render một mobile screenshot bên trong từng chapter.

Trong article:

```tsx
<div className="product-chapter__mobile-visual">
  <Image
    ...
  />
</div>
```

Desktop:

```css
.product-chapter__mobile-visual {
  display: none;
}
```

Mobile:

```css
@media (max-width: 1023px) {
  .product-theater {
    padding-block: 7rem;
  }

  .product-theater__stage {
    display: none;
  }

  .product-theater__story {
    display: block;
  }

  .product-theater__chapters {
    width: auto;
    margin-inline: auto;

    max-width: 48rem;

    padding: 0 1.5rem;
  }

  .product-chapter {
    min-height: auto;

    padding-block: 4rem;

    opacity: 1;

    transform: none;
  }

  .product-chapter__mobile-visual {
    position: relative;

    display: block;

    aspect-ratio: 4 / 3;

    margin-top: 2.25rem;

    overflow: hidden;

    border: 1px solid rgb(236 240 237 / 0.1);

    border-radius: 14px;
  }
}
```

Next/Image sẽ reuse cache nên việc cùng URL xuất hiện desktop/mobile không đáng ngại.

---

# 17. Accessibility

Desktop stage screenshots có thể giữ alt hiện tại.

Nhưng vì cả 3 ảnh tồn tại cùng lúc dù chỉ một ảnh visible, mình khuyến nghị controller đồng bộ `aria-hidden`:

Trong `activate()`:

```tsx
visuals.forEach((visual) => {
  const isActive = visual.dataset.productVisual === product;

  visual.toggleAttribute("data-active", isActive);

  visual.setAttribute("aria-hidden", String(!isActive));
});
```

Markup initial:

```tsx
<figure
  aria-hidden={product.key !== "analytics"}
  ...
>
```

Như vậy assistive technology cũng chỉ thấy product visual đang active.

Mobile image trong chapter vẫn có alt bình thường.

---

# 18. Reduced motion

```css
@media (prefers-reduced-motion: reduce) {
  .product-stage__visual,
  .product-chapter {
    transition: none !important;
  }

  .product-stage__visual {
    transform: none !important;
  }

  .product-chapter {
    transform: none !important;
  }
}
```

Active state vẫn đổi.

Chỉ transition bị bỏ.

---

## Phase 5 acceptance gate

| Gate        | Requirement                           |
| ----------- | ------------------------------------- |
| Old layout  | Không còn 3 alternating rows          |
| Desktop     | Một persistent product viewport       |
| Analytics   | Giữ đầy đủ description + 3 signals    |
| Focus       | Giữ description + 4 modes             |
| Rooms       | Giữ title/description                 |
| State       | Scroll chapter đổi screenshot         |
| Motion      | Crossfade + subtle scale, không blur  |
| Mobile      | Không sticky                          |
| Images      | Alt text vẫn có                       |
| SEO         | Text vẫn SSR                          |
| Performance | Không new JS animation loop           |
| A11y        | Inactive desktop visual `aria-hidden` |
| Build       | lint/test/build pass                  |
