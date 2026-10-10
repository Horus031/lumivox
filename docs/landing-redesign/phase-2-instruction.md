Mình đã verify Phase 1 trên `redesign/landing-storytelling-page`.

**Phase 1: PASS.** Commit foundation `677fdd8…` và commit baseline `45b9a016…` đều có Vercel preview **READY**. Branch hiện `ahead main = 3`, `behind = 0`. `motion@^14.0.0`, `MotionConfig`, `StoryReveal`, `StoryLine`, ambient scene states, reduced-motion CSS và baseline performance đều đã vào đúng chỗ. Baseline mới cũng khá tốt: `/en` mobile 95 / LCP 3.0s, `/vi` mobile 74 / LCP 4.9s — ta sẽ dùng chúng làm guardrail.

Có một cleanup nhỏ: nếu bạn không chủ ý nâng `@types/react` từ `^19` → `^19.3.0`, hãy trả nó về `^19` trong phase này.

# Phase 2 — Hero Awakening Scene

Đây là phase đầu tiên **thực sự thay đổi visual**.

Mục tiêu:

> Khi mở Lumivox, người dùng không thấy “một hero có video background”, mà thấy **một intelligence system đang thức dậy**.

Chúng ta sẽ làm bốn việc cùng nhau:

**Hero typography → cinematic**  
**4 floating cards → neural annotations**  
**Scroll → hero exit choreography**  
**Hero → Principles → continuous filament transition**

Không đổi H1/copy SEO.

---

## 1. Giữ `Hero` là Server Component

Không thêm `"use client"` vào `hero.tsx`.

Thay vào đó tạo:

```text
apps/web/components/landing/story/hero-motion-controller.tsx
```

Component này chỉ điều khiển CSS variables theo scroll.

```tsx
"use client";

import {
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
} from "motion/react";
import { useEffect, useRef } from "react";

export default function HeroMotionController() {
  const targetRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: targetRef,
    offset: ["start start", "end start"],
  });

  useEffect(() => {
    const root = targetRef.current?.parentElement;

    if (!root) return;

    if (reduceMotion) {
      root.style.setProperty("--hero-content-y", "0px");
      root.style.setProperty("--hero-content-opacity", "1");
      root.style.setProperty("--hero-video-scale", "1.05");
      root.style.setProperty("--hero-video-y", "0px");
      root.style.setProperty("--hero-signals-opacity", "1");
      root.style.setProperty("--hero-signals-y", "0px");
      root.style.setProperty("--hero-filament-opacity", "1");
    }
  }, [reduceMotion]);

  useMotionValueEvent(scrollYProgress, "change", (value) => {
    if (reduceMotion) return;

    const root = targetRef.current?.parentElement;

    if (!root) return;

    const progress = Math.min(Math.max(value, 0), 1);

    root.style.setProperty(
      "--hero-content-y",
      `${progress * -44}px`,
    );

    root.style.setProperty(
      "--hero-content-opacity",
      `${Math.max(0, 1 - progress * 1.35)}`,
    );

    root.style.setProperty(
      "--hero-video-scale",
      `${1.06 - progress * 0.08}`,
    );

    root.style.setProperty(
      "--hero-video-y",
      `${progress * -18}px`,
    );

    root.style.setProperty(
      "--hero-signals-opacity",
      `${Math.max(0, 1 - progress * 1.7)}`,
    );

    root.style.setProperty(
      "--hero-signals-y",
      `${progress * -22}px`,
    );

    root.style.setProperty(
      "--hero-filament-opacity",
      `${Math.min(1, progress * 2.2 + 0.2)}`,
    );
  });

  return (
    <div
      ref={targetRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
    />
  );
}
```

Đây là một trong số rất ít nơi trong landing mà scroll-linked motion là hợp lý.

Không dùng nó cho mọi section.

---

# 2. Restructure Hero

Hero root:

```tsx
<section
  data-landing-scene="hero"
  data-landing-hero
  className="landing-hero relative isolate mt-16 min-h-[calc(100svh-4rem)] overflow-hidden"
>
```

Thêm:

```tsx
<HeroMotionController />
```

ngay bên trong section.

Định nghĩa các variables mặc định trong CSS:

```css
.landing-hero {
  --hero-content-y: 0px;
  --hero-content-opacity: 1;

  --hero-video-scale: 1.06;
  --hero-video-y: 0px;

  --hero-signals-opacity: 1;
  --hero-signals-y: 0px;

  --hero-filament-opacity: 0.2;
}
```

---

# 3. Background video thành cinematic layer

Đổi video thành:

```tsx
<video
  data-hero-video
  src="/hero-brain-loop.mp4"
  poster="/landing-hero.webp"
  autoPlay
  loop
  muted
  playsInline
  preload="auto"
  className="landing-hero__video absolute inset-0 size-full object-cover"
/>
```

CSS:

```css
.landing-hero__video {
  transform:
    translate3d(0, var(--hero-video-y), 0)
    scale(var(--hero-video-scale));

  transform-origin: center center;

  transition: filter 600ms var(--landing-ease-out);

  will-change: transform;
}
```

Không zoom mạnh.

Brain phải có cảm giác **lùi vào không gian khi scroll**, không phải camera bay tới/lùi quá mức.

---

# 4. Thay background overlays hiện tại

Hiện Hero có khá nhiều overlay:

- conic shimmer,
- radial gradient,
- linear fade,
- vignette,
- grid.

Mình muốn giảm xuống thành **4 layer có purpose rõ ràng**.

Sau video:

```tsx
<div className="landing-hero__veil absolute inset-0" />
<div className="landing-hero__halo absolute inset-0" />
<div className="landing-hero__grain absolute inset-0" />
<div className="landing-hero__edge absolute inset-0" />
```

CSS:

```css
.landing-hero__veil {
  background:
    linear-gradient(
      180deg,
      rgb(5 12 8 / 0.34) 0%,
      rgb(5 12 8 / 0.08) 38%,
      rgb(5 12 8 / 0.28) 70%,
      var(--background) 100%
    );
}

.landing-hero__halo {
  background:
    radial-gradient(
      ellipse at 50% 43%,
      transparent 10%,
      rgb(4 10 7 / 0.05) 42%,
      rgb(4 10 7 / 0.56) 100%
    );
}

.landing-hero__grain {
  opacity: 0.09;
  mix-blend-mode: soft-light;

  background-image:
    radial-gradient(
      circle at 24% 18%,
      white 0 0.5px,
      transparent 0.8px
    ),
    radial-gradient(
      circle at 68% 52%,
      white 0 0.5px,
      transparent 0.8px
    );

  background-size:
    19px 19px,
    27px 27px;
}

.landing-hero__edge {
  background:
    radial-gradient(
      ellipse at center,
      transparent 30%,
      rgb(3 9 5 / 0.52) 100%
    );
}
```

Điểm quan trọng:

**không có neon overlay khổng lồ.**

Brain video mới là hero artwork.

---

# 5. Redesign Hero typography

Xóa glass rectangle lớn đang nằm sau H1:

```text
rounded-[40px]
backdrop-blur-2xl
bg-white/10
```

Hero mới không cần “text card”.

Thay content wrapper thành khoảng:

```tsx
<div
  className="
    landing-hero__content
    relative z-20 mx-auto flex
    min-h-[calc(100svh-4rem)]
    max-w-310 flex-col items-center
    justify-center px-6
    pb-28 pt-24 text-center
  "
>
```

CSS:

```css
.landing-hero__content {
  opacity: var(--hero-content-opacity);

  transform:
    translate3d(
      0,
      var(--hero-content-y),
      0
    );

  will-change: transform, opacity;
}
```

---

## Badge

Không dùng pill glass lớn nữa.

Dùng:

```tsx
<StoryReveal>
  <div
    className="
      mb-7 inline-flex items-center
      gap-3 text-[11px]
      font-medium uppercase
      tracking-[0.22em]
      text-white/68
    "
  >
    <span className="h-px w-7 bg-white/30" />

    <span className="size-1.5 rounded-full bg-[#83b895] shadow-[0_0_16px_rgba(131,184,149,.8)]" />

    {t("badge")}

    <span className="h-px w-7 bg-white/30" />
  </div>
</StoryReveal>
```

Luxury hơn pill rất nhiều.

---

# 6. Headline

Giữ nguyên text.

Không thay H1 SEO.

```tsx
<StoryReveal delay={0.08} distance={18}>
  <h1
    className="
      max-w-[980px]
      text-balance
      text-[clamp(3rem,7.2vw,6.6rem)]
      font-semibold
      leading-[0.98]
      tracking-[-0.055em]
      text-white
      drop-shadow-[0_12px_44px_rgba(0,0,0,.42)]
    "
  >
    {t("title.before")}{" "}

    <span
      className="
        bg-gradient-to-r
        from-white
        via-[#d9eee0]
        to-[#89bd9a]
        bg-clip-text
        text-transparent
      "
    >
      {t("title.accent")}
    </span>

    {t("title.after")}
  </h1>
</StoryReveal>
```

Điểm mình muốn thay đổi lớn nhất ở Hero là **headline tự đứng trong không gian**, không cần cái hộp phía sau.

---

# 7. Subtitle

```tsx
<StoryReveal delay={0.16} distance={16}>
  <p
    className="
      mx-auto mt-8
      max-w-2xl
      text-[15.5px]
      leading-7
      text-white/66
      md:text-[17px]
    "
  >
    {t("subtitle")}
  </p>
</StoryReveal>
```

Nhẹ hơn headline rất rõ.

---

# 8. CTA

CTA primary:

```text
white / pearl
```

Secondary:

```text
transparent hairline
```

Không quá rounded.

Khoảng:

```tsx
<StoryReveal delay={0.23}>
  <div className="mt-9 flex flex-wrap justify-center gap-3">
```

Primary:

```text
h-12 rounded-full px-6
bg-white text-[#0d110f]
```

Secondary:

```text
h-12 rounded-full
border-white/16 bg-white/[0.045]
backdrop-blur-md
```

Ở đây pill shape hợp lý vì là button, không phải mọi UI element.

---

# 9. Proof row

Proof row hiện khá tốt.

Chỉ thay visual:

```text
✓ Free plan
·
✓ No card
·
✓ Private
```

Không cần mỗi item thành badge.

Ví dụ:

```tsx
<div
  className="
    mt-8 flex flex-wrap
    items-center justify-center
    gap-x-5 gap-y-2
    text-[11.5px]
    text-white/48
  "
>
```

Icon check giảm còn `size-3`.

---

# 10. Floating cards → Neural Annotations

Đây là phần quan trọng nhất của redesign Hero.

Bỏ toàn bộ bốn:

```text
rounded-2xl
bg-background/12
backdrop-blur-xl
border
shadow-lg
```

Thay bằng signal annotation.

Ví dụ reusable markup:

```tsx
<div className="hero-signal hero-signal--ai">
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
```

CSS core:

```css
.hero-signal {
  position: absolute;
  z-index: 15;

  display: flex;
  align-items: center;
  gap: 10px;

  color: rgb(255 255 255 / 0.72);

  opacity: var(--hero-signals-opacity);

  transform:
    translate3d(
      0,
      var(--hero-signals-y),
      0
    );

  transition:
    opacity 300ms ease;

  will-change: transform, opacity;
}

.hero-signal__dot {
  width: 5px;
  height: 5px;

  flex: none;

  border-radius: 9999px;

  background: var(--landing-mint);

  box-shadow:
    0 0 0 4px rgb(131 184 149 / 0.08),
    0 0 18px rgb(131 184 149 / 0.7);
}

.hero-signal__line {
  width: clamp(28px, 4vw, 64px);
  height: 1px;

  background:
    linear-gradient(
      90deg,
      rgb(131 184 149 / 0.62),
      rgb(255 255 255 / 0.08)
    );
}

.hero-signal__content {
  display: flex;
  flex-direction: column;

  text-align: left;
}

.hero-signal__label {
  font-size: 11px;
  font-weight: 500;

  letter-spacing: 0.04em;
}

.hero-signal__meta {
  margin-top: 2px;

  font-size: 9.5px;

  color: rgb(255 255 255 / 0.38);
}
```

Positions:

```css
.hero-signal--ai {
  left: max(4vw, 2rem);
  top: 28%;
}

.hero-signal--timer {
  right: max(5vw, 2rem);
  top: 34%;
}

.hero-signal--streak {
  left: max(7vw, 3rem);
  bottom: 23%;
}

.hero-signal--consistency {
  right: max(7vw, 3rem);
  bottom: 21%;
}
```

Trên màn nhỏ:

```css
@media (max-width: 767px) {
  .hero-signal {
    display: none;
  }
}
```

Không cố nhồi annotation vào mobile.

---

# 11. Neural breathing

Signal không nên float lên xuống như card hiện tại.

Chỉ animate glow của dot rất nhẹ:

```css
@keyframes hero-signal-breathe {
  0%,
  100% {
    box-shadow:
      0 0 0 4px rgb(131 184 149 / 0.06),
      0 0 13px rgb(131 184 149 / 0.42);
  }

  50% {
    box-shadow:
      0 0 0 6px rgb(131 184 149 / 0.1),
      0 0 22px rgb(131 184 149 / 0.68);
  }
}

.hero-signal__dot {
  animation:
    hero-signal-breathe
    3.8s ease-in-out infinite;
}
```

Animation này `decorative`.

Reduced motion phải disable.

---

# 12. Hero exit filament

Ở bottom Hero:

```tsx
<div
  aria-hidden="true"
  data-landing-motion="decorative"
  className="hero-filament"
>
  <span className="hero-filament__origin" />
  <span className="hero-filament__beam" />
  <span className="hero-filament__spark" />
</div>
```

CSS:

```css
.hero-filament {
  position: absolute;

  left: 50%;
  bottom: 0;

  z-index: 20;

  height: 100px;
  width: 1px;

  opacity: var(--hero-filament-opacity);

  transform: translateX(-50%);
}

.hero-filament__beam {
  position: absolute;
  inset: 0;

  background:
    linear-gradient(
      to bottom,
      transparent,
      rgb(131 184 149 / 0.58)
    );
}

.hero-filament__origin {
  position: absolute;

  left: 50%;
  top: -5px;

  width: 5px;
  height: 5px;

  border-radius: 9999px;

  background: var(--landing-mint);

  transform: translateX(-50%);

  box-shadow:
    0 0 22px rgb(131 184 149 / 0.8);
}
```

Đây chính là “energy thread” sẽ được nối vào Principles trong Phase 3.

---

# 13. Hero entrance animation

Xóa toàn bộ:

```text
animate-fade-up
animation-delay
animate-float
```

khỏi Hero.

Dùng `StoryReveal` cho:

- badge;
- H1;
- subtitle;
- CTA;
- proof.

Sequence khoảng:

```text
0ms      badge
80ms     H1
160ms    subtitle
230ms    CTA
300ms    proof
```

Không dài hơn.

Hero phải có cảm giác ngay lập tức responsive, không chờ animation dài.

---

# 14. Navbar cinematic mode

Phase này chỉ chỉnh navbar trên landing page.

Không làm `/features`, `/research`, `/blog` thay đổi.

Trong navbar root:

```tsx
<header
  data-marketing-navbar
  className="..."
>
```

Nav link:

```tsx
data-navbar-link
```

Logo/name wrapper:

```tsx
data-navbar-brand
```

CTA primary:

```tsx
data-navbar-primary
```

Sau đó CSS:

```css
body:has([data-landing-story])
[data-marketing-navbar] {
  transition:
    background-color 500ms var(--landing-ease-out),
    border-color 500ms var(--landing-ease-out),
    color 500ms var(--landing-ease-out);
}
```

Khi Hero đang active:

```css
body:has(
  .story-atmosphere[data-active-scene="hero"]
)
[data-marketing-navbar] {
  border-color: transparent;

  background:
    linear-gradient(
      to bottom,
      rgb(5 10 7 / 0.64),
      transparent
    );

  backdrop-filter: none;
}
```

Navigation text Hero:

```css
body:has(
  .story-atmosphere[data-active-scene="hero"]
)
[data-navbar-link] {
  color: rgb(255 255 255 / 0.62);
}
```

Hover:

```css
color: white;
```

Sau Hero, navbar quay về style hiện tại.

Như vậy không cần thêm client state vào navbar.

---

# 15. Reduced motion Hero

Trong `HeroMotionController`, reduced-motion đã bỏ parallax.

Thêm CSS:

```css
@media (prefers-reduced-motion: reduce) {
  .landing-hero__video {
    transform: scale(1.05) !important;
  }

  .hero-signal {
    transform: none !important;
  }

  .hero-signal__dot {
    animation: none !important;
  }
}
```

Ngoài ra controller có thể pause video:

```tsx
useEffect(() => {
  if (!reduceMotion) return;

  const video =
    document.querySelector<HTMLVideoElement>(
      "[data-hero-video]",
    );

  video?.pause();
}, [reduceMotion]);
```

Poster vẫn giữ Hero đẹp.

---

# 16. Đừng redesign Principles trong phase này

EvidenceStrip vẫn giữ layout cũ.

Chỉ Hero filament kết thúc ở boundary của section.

Phase 3 chúng ta sẽ lấy điểm đó làm origin để biến EvidenceStrip thành constellation.

Điều này giúp mỗi phase vẫn review được riêng.

---

## Sau khi implement

Chạy:

```bash
cd apps/web

npm run lint
npm run test:unit
npm run build
```

Sau đó test desktop:

```text
1440 × 900
1280 × 800
1024 × 768
```

Mobile:

```text
390 × 844
430 × 932
```

Cần đặc biệt kiểm tra:

- headline không bị clipping;
- brain vẫn là focal point;
- CTA nhìn rõ;
- annotation không đè H1;
- không horizontal overflow;
- scroll hero không giật;
- navbar đổi state mềm;
- reduced-motion không parallax;
- `/features` navbar vẫn y như trước.

---

## Phase 2 quality gate

| Gate | Requirement |
|---|---|
| H1 | Text không đổi |
| Copy | Không đổi |
| Hero | Không còn glass-box headline |
| Signals | 4 cards → neural annotations |
| Scroll | Brain recedes, content exits nhẹ |
| Transition | Central filament xuất hiện |
| Navbar | Cinematic chỉ trên landing hero |
| Mobile | Không render floating annotations |
| A11y | Reduced motion có static experience |
| Performance | Không canvas/WebGL/new video |
| Server boundary | `hero.tsx` vẫn Server Component |
| Build | lint/test/build pass |