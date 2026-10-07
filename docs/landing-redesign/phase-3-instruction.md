Mình đã verify commit `5e440299dd285040e633b037cd0bf02d64d5a1c0` trên `redesign/landing-storytelling-page`.

**Phase 2: PASS.** Branch hiện `ahead main = 4`, `behind = 0`, và Vercel preview của commit Hero đã chuyển sang **READY**. `Hero` vẫn là Server Component; `HeroMotionController` là client island riêng; H1/copy không đổi; scroll chỉ điều khiển CSS variables; reduced-motion pause video và bỏ parallax; 4 floating cards đã được thay bằng neural signals; navbar hero state được scope bằng `:has()` nên không ảnh hưởng các marketing page khác.

Có 2 cleanup nhỏ nên làm ở đầu Phase 3:

```css
body:has(
  .story-atmosphere[data-active-scene="hero"]
)
[data-navbar-brand] {
  color: white;
}
```

Hiện bạn đã gắn `data-navbar-brand` nhưng chưa style nó khi Hero active, nên brand text có khả năng vẫn giữ màu foreground tối.

Và thêm:

```tsx
aria-hidden="true"
```

cho 4 `.hero-signal`, vì đây là decorative duplicates của product signals, tránh screen reader đọc thêm nội dung không cần thiết. `hero-filament__spark` hiện cũng chưa có CSS; hoặc xóa element đó, hoặc để lại cho phase polish sau.

---

# Phase 3 — Principle Constellation + Intelligence System

Đây là phase chúng ta bắt đầu giải quyết đúng vấn đề ban đầu của landing:

> Xóa cảm giác “section = hàng card vuông”, và biến content thành một **hệ thống trực quan liên tục**.

Phase 3 sẽ redesign hai section:

```text
EvidenceStrip
      ↓
Principle Constellation

Features
      ↓
Intelligence System
```

Story lúc này sẽ trở thành:

```text
Brain awakens
      ↓
signal filament
      ↓
4 product principles emerge
      ↓
signals converge
      ↓
Lumivox intelligence core
      ↓
6 capabilities orbit around it
```

Không đổi translation/copy.

---

## 1. Hero → Principles transition

Bây giờ mới dùng `StoryLine`.

Trong `evidence-strip.tsx`:

```tsx
import StoryLine from "./story/story-line";
```

Root đổi thành:

```tsx
<section
  data-landing-scene="principles"
  aria-label={t("label")}
  className="principle-constellation relative isolate overflow-hidden"
>
  <StoryLine />

  ...
</section>
```

CSS:

```css
.principle-constellation {
  min-height: 34rem;

  color: var(--landing-pearl);

  background:
    linear-gradient(
      180deg,
      var(--landing-void) 0%,
      #09150e 68%,
      var(--background) 100%
    );
}
```

Như vậy filament của Hero không bị “cắt” bởi một border section như hiện tại.

Xóa:

```text
border-y
border-border
bg-surface
```

khỏi EvidenceStrip.

---

# 2. EvidenceStrip → constellation field

Không dùng:

```text
grid-cols-4
border-r
```

nữa.

Markup nên thành:

```tsx
<div className="principle-constellation__field mx-auto max-w-310 px-6">
  <div
    aria-hidden="true"
    className="principle-constellation__core"
  />

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
        <span
          aria-hidden="true"
          className="principle-node__signal"
        >
          <Icon className="size-4" />
        </span>

        <span className="principle-node__text">
          {t(`items.${key}`)}
        </span>
      </li>
    ))}
  </ul>
</div>
```

Không có card background.

Không rounded box.

Không shadow container.

---

## 3. Constellation visual

Core:

```css
.principle-constellation__field {
  position: relative;
  min-height: 34rem;
}

.principle-constellation__core {
  position: absolute;
  left: 50%;
  top: 50%;

  width: 9px;
  height: 9px;

  border-radius: 9999px;

  background: var(--landing-mint);

  transform: translate(-50%, -50%);

  box-shadow:
    0 0 0 8px rgb(131 184 149 / 0.06),
    0 0 42px rgb(131 184 149 / 0.48);
}
```

Connections:

```css
.principle-constellation__connections {
  position: absolute;
  inset: 0;

  width: 100%;
  height: 100%;

  fill: none;
  stroke: rgb(236 240 237 / 0.11);
  stroke-width: 1;
}
```

Nodes:

```css
.principle-node {
  position: absolute;

  display: flex;
  align-items: center;
  gap: 12px;

  max-width: 14rem;

  color: rgb(236 240 237 / 0.72);
}

.principle-node__signal {
  display: flex;
  width: 34px;
  height: 34px;

  flex: none;

  align-items: center;
  justify-content: center;

  border: 1px solid rgb(236 240 237 / 0.11);
  border-radius: 9999px;

  background: rgb(255 255 255 / 0.025);

  color: var(--landing-mint);

  box-shadow:
    inset 0 0 18px rgb(131 184 149 / 0.05);
}

.principle-node__text {
  font-size: 13px;
  font-weight: 500;
  line-height: 1.45;

  letter-spacing: -0.01em;
}
```

Positions:

```css
.principle-node[data-node-position="0"] {
  left: 8%;
  top: 22%;
}

.principle-node[data-node-position="1"] {
  right: 8%;
  top: 22%;
}

.principle-node[data-node-position="2"] {
  left: 12%;
  bottom: 20%;
}

.principle-node[data-node-position="3"] {
  right: 12%;
  bottom: 20%;
}
```

Cảm giác mong muốn:

```text
     AI planning         Analytics
          \                /
           \              /
              • SIGNAL
           /              \
          /                \
      Privacy          EN / VI
```

Không phải 4 ô.

---

# 4. Mobile constellation

Không absolute positioning trên mobile.

```css
@media (max-width: 767px) {
  .principle-constellation {
    min-height: auto;
    padding-block: 6rem;
  }

  .principle-constellation__field {
    min-height: auto;
  }

  .principle-constellation__connections,
  .principle-constellation__core {
    display: none;
  }

  .principle-constellation__nodes {
    display: flex;
    flex-direction: column;
    gap: 2rem;

    border-left:
      1px solid rgb(131 184 149 / 0.18);

    margin-left: 17px;
  }

  .principle-node {
    position: relative !important;
    inset: auto !important;

    margin-left: -17px;

    max-width: none;
  }
}
```

Mobile lúc này trở thành một neural timeline.

---

# 5. Features → Intelligence System

Đây là phần lớn nhất của Phase 3.

Không còn:

```tsx
<div className="grid sm:grid-cols-2 lg:grid-cols-3">
```

Thay thành kiến trúc:

```text
                Intelligence System

┌───────────────────────┬──────────────────────┐
│                       │   01 Analytics       │
│      ○ AI Rec         │                      │
│                       │   02 AI Recommend    │
│   ○         ○         │                      │
│        LUMIVOX        │   03 Focus           │
│   ○         ○         │                      │
│                       │   04 Goals           │
│      ○ Rewards        │                      │
│                       │   ...                │
│  sticky visual core   │   scroll chapters    │
└───────────────────────┴──────────────────────┘
```

Visual stage sticky.

Content scroll bình thường.

---

# 6. Tạo Intelligence Controller

Tạo:

```text
apps/web/components/landing/story/intelligence-controller.tsx
```

```tsx
"use client";

import { useEffect, useRef } from "react";

export default function IntelligenceController() {
  const anchorRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const root =
      anchorRef.current?.closest<HTMLElement>(
        "[data-intelligence-system]",
      );

    if (!root) return;

    const chapters = Array.from(
      root.querySelectorAll<HTMLElement>(
        "[data-intelligence-feature]",
      ),
    );

    const nodes = Array.from(
      root.querySelectorAll<HTMLElement>(
        "[data-intelligence-node]",
      ),
    );

    function activate(feature: string) {
      root.dataset.activeFeature = feature;

      chapters.forEach((chapter) => {
        chapter.toggleAttribute(
          "data-active",
          chapter.dataset.intelligenceFeature === feature,
        );
      });

      nodes.forEach((node) => {
        node.toggleAttribute(
          "data-active",
          node.dataset.intelligenceNode === feature,
        );
      });

      window.dispatchEvent(
        new CustomEvent("landing:intelligence-change", {
          detail: { feature },
        }),
      );
    }

    if (chapters[0]?.dataset.intelligenceFeature) {
      activate(chapters[0].dataset.intelligenceFeature);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const active = entries.find(
          (entry) => entry.isIntersecting,
        );

        if (!active) return;

        const feature = (
          active.target as HTMLElement
        ).dataset.intelligenceFeature;

        if (feature) activate(feature);
      },
      {
        rootMargin: "-38% 0px -42% 0px",
        threshold: 0,
      },
    );

    chapters.forEach((chapter) =>
      observer.observe(chapter),
    );

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

Đây là event-driven scrolling, không phải scroll scrubbing.

Không `useScroll()`.

Không RAF.

Không scroll listener.

---

# 7. Rewrite `features.tsx`

Thêm:

```tsx
import Image from "next/image";

import IntelligenceController from "./story/intelligence-controller";
```

Giữ heading hiện tại.

Sau heading:

```tsx
<div
  data-intelligence-system
  className="intelligence-system"
>
  <IntelligenceController />

  <div className="intelligence-system__stage">
    <div
      aria-hidden="true"
      className="intelligence-core"
    >
      <div className="intelligence-core__halo" />

      <div className="intelligence-core__center">
        <Image
          src="/logo.png"
          alt=""
          width={52}
          height={52}
        />
      </div>

      {features.map((feature, index) => {
        const Icon = feature.icon;

        return (
          <div
            key={feature.key}
            data-intelligence-node={feature.key}
            data-node-position={index}
            className="intelligence-node"
          >
            <Icon className="size-5" />
          </div>
        );
      })}
    </div>
  </div>

  <div className="intelligence-system__chapters">
    {features.map((feature, index) => (
      <article
        key={feature.key}
        data-intelligence-feature={feature.key}
        className="intelligence-chapter"
      >
        <span
          aria-hidden="true"
          className="intelligence-chapter__index"
        >
          {String(index + 1).padStart(2, "0")}
        </span>

        <h3>
          {t(`items.${feature.key}.title`)}
        </h3>

        <p>
          {t(`items.${feature.key}.desc`)}
        </p>
      </article>
    ))}
  </div>
</div>
```

Tất cả six feature descriptions vẫn SSR trong DOM.

SEO không mất gì.

---

# 8. Intelligence stage layout

```css
.intelligence-system {
  position: relative;

  display: grid;

  grid-template-columns:
    minmax(0, 1.1fr)
    minmax(20rem, 0.9fr);

  gap: clamp(4rem, 8vw, 8rem);

  max-width: var(--landing-content-width);

  margin-inline: auto;
}
```

Stage:

```css
.intelligence-system__stage {
  position: relative;
}

@media (min-width: 1024px) {
  .intelligence-system__stage {
    position: sticky;

    top: 7rem;

    height: calc(100svh - 9rem);

    display: flex;
    align-items: center;
    justify-content: center;
  }
}
```

---

# 9. Lumivox core

```css
.intelligence-core {
  position: relative;

  width: min(32rem, 42vw);
  aspect-ratio: 1;

  border-radius: 9999px;
}

.intelligence-core__halo {
  position: absolute;
  inset: 17%;

  border-radius: inherit;

  background:
    radial-gradient(
      circle,
      rgb(51 125 77 / 0.16),
      transparent 68%
    );

  filter: blur(22px);
}

.intelligence-core::before,
.intelligence-core::after {
  content: "";

  position: absolute;

  border:
    1px solid rgb(25 65 38 / 0.11);

  border-radius: inherit;
}

.intelligence-core::before {
  inset: 9%;
}

.intelligence-core::after {
  inset: 26%;
}

.intelligence-core__center {
  position: absolute;
  left: 50%;
  top: 50%;

  display: flex;

  width: 86px;
  height: 86px;

  align-items: center;
  justify-content: center;

  border:
    1px solid rgb(51 125 77 / 0.18);

  border-radius: 9999px;

  background:
    color-mix(
      in oklab,
      var(--surface) 82%,
      transparent
    );

  box-shadow:
    0 20px 70px rgb(25 65 38 / 0.14),
    inset 0 0 30px rgb(51 125 77 / 0.05);

  transform: translate(-50%, -50%);
}
```

Không glass card.

Nó là “core”.

---

# 10. Six capability nodes

Base:

```css
.intelligence-node {
  position: absolute;

  display: flex;

  width: 48px;
  height: 48px;

  align-items: center;
  justify-content: center;

  border:
    1px solid rgb(25 65 38 / 0.12);

  border-radius: 9999px;

  background: var(--background);

  color: var(--text-muted);

  opacity: 0.42;

  transition:
    opacity 500ms var(--landing-ease-out),
    color 500ms var(--landing-ease-out),
    transform 700ms var(--landing-ease-cinematic),
    box-shadow 500ms var(--landing-ease-out);
}
```

Active:

```css
.intelligence-node[data-active] {
  color: var(--landing-emerald);

  opacity: 1;

  transform:
    translate(var(--node-x), var(--node-y))
    scale(1.12);

  box-shadow:
    0 0 0 7px rgb(51 125 77 / 0.05),
    0 0 34px rgb(51 125 77 / 0.16);
}
```

Bạn có thể đặt 6 nodes theo hexagon:

```text
0 top
1 upper-right
2 lower-right
3 bottom
4 lower-left
5 upper-left
```

Không cần animation orbit liên tục.

**Tuyệt đối không quay vòng mãi.**

Luxury UI thường nhìn đắt hơn khi motion có mục đích.

---

# 11. Chapters không phải card

```css
.intelligence-chapter {
  min-height: 52vh;

  display: flex;
  flex-direction: column;
  justify-content: center;

  padding-block: 4rem;

  opacity: 0.34;

  transition:
    opacity 500ms var(--landing-ease-out),
    transform 700ms var(--landing-ease-cinematic);
}

.intelligence-chapter[data-active] {
  opacity: 1;
}

.intelligence-chapter__index {
  margin-bottom: 1rem;

  font-family: var(--font-mono);

  font-size: 10px;

  letter-spacing: 0.18em;

  color: var(--landing-emerald);
}

.intelligence-chapter h3 {
  max-width: 26rem;

  font-size:
    clamp(1.6rem, 2.5vw, 2.35rem);

  font-weight: 600;

  line-height: 1.08;

  letter-spacing: -0.035em;
}

.intelligence-chapter p {
  max-width: 31rem;

  margin-top: 1rem;

  font-size: 14px;

  line-height: 1.8;

  color: var(--text-secondary);
}
```

Không border.

Không rounded rectangle.

Không hover-lift.

---

# 12. Mobile Intelligence System

Mobile không sticky.

```css
@media (max-width: 1023px) {
  .intelligence-system {
    display: block;
  }

  .intelligence-system__stage {
    height: 24rem;

    display: flex;
    align-items: center;
    justify-content: center;
  }

  .intelligence-core {
    width: min(90vw, 25rem);
  }

  .intelligence-chapter {
    min-height: auto;

    padding-block: 2.25rem;

    opacity: 1;
  }
}
```

Không bắt mobile scroll qua 6 × 52vh.

---

# 13. Phase 2 cleanup cùng commit này

Fix brand:

```css
body:has(
  .story-atmosphere[data-active-scene="hero"]
)
[data-navbar-brand] {
  color: white;
}
```

Thêm:

```tsx
aria-hidden="true"
```

vào `.hero-signal`.

Và nếu `hero-filament__spark` chưa dùng:

```tsx
// remove
<span className="hero-filament__spark" />
```

Cho diff sạch.

---

# 14. Reduced motion

Trong reduced-motion:

```css
@media (prefers-reduced-motion: reduce) {
  .intelligence-node,
  .intelligence-chapter,
  .principle-node {
    transition: none !important;
  }

  .intelligence-node[data-active] {
    transform: none;
  }
}
```

Observer vẫn được phép đổi active state; chỉ motion bị tắt.

---

## Phase 3 quality gate

| Gate | Requirement |
|---|---|
| EvidenceStrip | Không còn 4-column bordered grid |
| Principles | 4 signals tạo constellation |
| Hero transition | Filament nối tự nhiên vào constellation |
| Features | Không còn six-card grid |
| Intelligence | Có central Lumivox core |
| Scroll | Chapter active → node active |
| Content | Cả 6 title + description vẫn SSR |
| Mobile | Không sticky dài, không absolute constellation |
| Motion | Không infinite orbit / scroll listener |
| A11y | Decorative visuals `aria-hidden` |
| SEO | Copy, H1, metadata, JSON-LD không đổi |
| Build | lint/test/build pass |