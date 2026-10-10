Mình đã verify commit Phase 3 `57755bd5c16a55b91151ee0cf36bed62ebbefaad`.

**Phase 3: PASS về source/architecture.** Branch chỉ thêm đúng những phần mong đợi: `EvidenceStrip` đã thành constellation, `Features` đã thành sticky intelligence system, `IntelligenceController` vẫn là client island nhỏ, cả 6 feature title/description tiếp tục SSR trong DOM, mobile đã bỏ sticky dài, Hero cleanup `aria-hidden`, navbar brand và filament đều được xử lý.

Có một điểm chưa thể đóng 100% ở infrastructure: Vercel deployment `dpl_HsMu...` của commit này tại lúc mình kiểm tra vẫn đang ở trạng thái **BUILDING**, GitHub status vẫn `pending`. Không có dấu hiệu source failure; bạn có thể tiếp tục Phase 4, nhưng trước khi merge redesign về staging/main thì deployment này hoặc commit kế tiếp bắt buộc phải thành `READY`.

Một điểm nhỏ trong `IntelligenceController`: callback hiện dùng `entries.find(entry => entry.isIntersecting)`. Với layout hiện tại central activation band khá hẹp nên thực tế ổn, nhưng khi hai chapter chạm activation region cùng lúc có thể chọn theo thứ tự entry. Không phải blocker; mình sẽ cho xử lý cùng controller Phase 4 theo pattern deterministic hơn.

# Phase 4 — Plan → Focus → Understand Journey

Bây giờ landing đang có:

```text
Brain awakening
      ↓
Principle constellation
      ↓
Intelligence system
```

Nhưng `HowItWorks` phía dưới vẫn đang là 3 card SaaS bình thường. Phase 4 sẽ biến đoạn này thành một **continuous learning journey**:

```text
CAPTURE
   │
   ▼
PLAN
   │
   ▼
FOCUS
   │
   ▼
OBSERVE
   │
   ▼
UNDERSTAND
```

Copy hiện tại vẫn giữ nguyên:

- Capture your intentions
- Enter calm focus
- Learn from your patterns

Chúng ta chỉ thay cách kể.

---

## 1. Architecture mới

Desktop:

```text
┌─────────────────────────────────────────────────┐
│                                                 │
│  01 Capture             ┌────────────────────┐  │
│  text...                │                    │  │
│                         │   persistent       │  │
│                         │   visual stage     │  │
│  02 Focus               │                    │  │
│  text...                │ task → timer →     │  │
│                         │ analytics          │  │
│                         │                    │  │
│  03 Patterns            └────────────────────┘  │
│  text...                        sticky          │
│                                                 │
└─────────────────────────────────────────────────┘
```

Mobile:

```text
heading

01 Capture
[mini visual]

02 Focus
[mini visual]

03 Patterns
[mini visual]
```

Không sticky trên mobile.

---

# 2. Tạo `learning-journey-controller.tsx`

Tạo:

```text
apps/web/components/landing/story/learning-journey-controller.tsx
```

```tsx
"use client";

import {
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
} from "motion/react";
import { useEffect, useRef } from "react";

export default function LearningJourneyController() {
  const trackRef = useRef<HTMLSpanElement>(null);
  const reduceMotion = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: trackRef,
    offset: ["start end", "end start"],
  });

  useEffect(() => {
    const root =
      trackRef.current?.closest<HTMLElement>(
        "[data-learning-journey]",
      );

    if (!root) return;

    const chapters = Array.from(
      root.querySelectorAll<HTMLElement>(
        "[data-journey-step]",
      ),
    );

    const visible = new Map<Element, number>();

    const activate = (step: string) => {
      if (root.dataset.activeStep === step) return;

      root.dataset.activeStep = step;

      chapters.forEach((chapter) => {
        chapter.toggleAttribute(
          "data-active",
          chapter.dataset.journeyStep === step,
        );
      });

      window.dispatchEvent(
        new CustomEvent("landing:journey-change", {
          detail: { step },
        }),
      );
    };

    const firstStep = chapters[0]?.dataset.journeyStep;

    if (firstStep) activate(firstStep);

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            visible.set(entry.target, entry.intersectionRatio);
          } else {
            visible.delete(entry.target);
          }
        });

        const active = [...visible.entries()]
          .sort((a, b) => b[1] - a[1])[0]?.[0] as
          | HTMLElement
          | undefined;

        const step = active?.dataset.journeyStep;

        if (step) activate(step);
      },
      {
        rootMargin: "-35% 0px -35% 0px",
        threshold: [0, 0.25, 0.5, 0.75],
      },
    );

    chapters.forEach((chapter) => observer.observe(chapter));

    return () => observer.disconnect();
  }, []);

  useMotionValueEvent(scrollYProgress, "change", (value) => {
    if (reduceMotion) return;

    const root =
      trackRef.current?.closest<HTMLElement>(
        "[data-learning-journey]",
      );

    if (!root) return;

    root.style.setProperty(
      "--journey-progress",
      String(Math.min(Math.max(value, 0), 1)),
    );
  });

  return (
    <span
      ref={trackRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
    />
  );
}
```

Khác Phase 3:

- `IntersectionObserver` chọn state;
- `useScroll()` chỉ điều khiển một progress line;
- không dùng scroll listener thủ công;
- không update React state mỗi frame.

---

# 3. Rewrite `how-it-works.tsx`

Import controller:

```tsx
import LearningJourneyController from "./story/learning-journey-controller";
```

Root:

```tsx
<section
  id="how"
  data-landing-scene="workflow"
  data-learning-journey
  className="learning-journey relative isolate overflow-hidden"
>
  <LearningJourneyController />
```

Bỏ hoàn toàn:

```text
bg-elevated/40
border-y
grid md:grid-cols-3
rounded-2xl cards
```

Heading vẫn SSR và giữ copy hiện tại.

Structure chính:

```tsx
<div className="mx-auto max-w-310 px-6">
  <header className="learning-journey__heading">
    <p className="...">
      {t("eyebrow")}
    </p>

    <h2 className="...">
      {t("title")}
    </h2>
  </header>

  <div className="learning-journey__layout">
    <div className="learning-journey__chapters">
      {steps.map((step) => {
        const Icon = step.icon;

        return (
          <article
            key={step.key}
            data-journey-step={step.key}
            className="journey-chapter"
          >
            <div className="journey-chapter__meta">
              <span>{step.n}</span>
              <span className="journey-chapter__rule" />
              <Icon
                aria-hidden="true"
                className="size-4"
              />
            </div>

            <h3>
              {t(`steps.${step.key}.title`)}
            </h3>

            <p>
              {t(`steps.${step.key}.desc`)}
            </p>
          </article>
        );
      })}
    </div>

    <JourneyVisualStage />
  </div>
</div>
```

Nhưng `JourneyVisualStage` không cần thành Client Component.

---

# 4. Tạo visual stage Server Component

Tạo:

```text
apps/web/components/landing/story/journey-visual-stage.tsx
```

Nó chỉ render markup, state được CSS đọc từ:

```text
[data-learning-journey][data-active-step="capture"]
[data-active-step="focus"]
[data-active-step="patterns"]
```

Ví dụ:

```tsx
export default function JourneyVisualStage() {
  return (
    <div
      aria-hidden="true"
      className="journey-stage"
    >
      <div className="journey-stage__field" />

      <div className="journey-stage__progress">
        <span />
      </div>

      <div className="journey-scene journey-scene--capture">
        {/* task / goal visual */}
      </div>

      <div className="journey-scene journey-scene--focus">
        {/* timer visual */}
      </div>

      <div className="journey-scene journey-scene--patterns">
        {/* analytics visual */}
      </div>
    </div>
  );
}
```

Điều quan trọng: **không cần SVG morph phức tạp**.

Ba illustration chồng lên nhau, opacity/scale crossfade có kiểm soát sẽ đẹp và ổn định hơn.

---

# 5. Capture visual

Visual đầu tiên thể hiện:

```text
Goal
 │
 ├─ Task
 ├─ Task
 └─ Task
```

Không làm nó giống Kanban UI thật.

Dùng abstract nodes:

```tsx
<div className="journey-capture__goal">
  <span className="journey-node-dot" />
</div>

<div className="journey-capture__task journey-capture__task--one" />
<div className="journey-capture__task journey-capture__task--two" />
<div className="journey-capture__task journey-capture__task--three" />

<svg ...>
  {/* subtle hairline connections */}
</svg>
```

Goal ở giữa/top, task nodes lan xuống.

Look giống neural planning map, không giống card UI.

---

# 6. Focus visual

Center visual:

```tsx
<div className="journey-focus__ring">
  <div className="journey-focus__inner">
    <span className="journey-focus__time">
      25:00
    </span>

    <span className="journey-focus__label">
      FOCUS
    </span>
  </div>
</div>
```

Ring dùng CSS conic gradient:

```css
.journey-focus__ring {
  width: clamp(14rem, 24vw, 20rem);
  aspect-ratio: 1;
  border-radius: 50%;

  background:
    conic-gradient(
      from -90deg,
      var(--landing-emerald) 0deg,
      var(--landing-mint) 270deg,
      rgb(25 65 38 / 0.08) 270deg
    );

  padding: 1px;
}
```

Inner:

```css
.journey-focus__inner {
  width: 100%;
  height: 100%;

  display: grid;
  place-content: center;

  border-radius: inherit;

  background: var(--background);
}
```

Không animate timer countdown.

Đây chỉ là product metaphor.

---

# 7. Patterns visual

Không dựng chart card.

Dùng signal/wave field:

```text
                 ·
          ╭──────╯
      ╭───╯
──────╯                ───
```

Có thể dùng SVG path:

```tsx
<svg
  viewBox="0 0 560 320"
  className="journey-patterns__graph"
>
  <path
    className="journey-patterns__gridline"
    d="M40 80 H520 ..."
  />

  <path
    className="journey-patterns__signal"
    d="M40 245 C110 220 ..."
  />

  <circle ... />
  <circle ... />
  <circle ... />
</svg>
```

Một path thôi.

Không cần Recharts.

Không JS chart.

---

# 8. Stage visual states

Base:

```css
.journey-scene {
  position: absolute;
  inset: 0;

  display: grid;
  place-items: center;

  opacity: 0;
  transform: scale(0.96);

  transition:
    opacity 650ms var(--landing-ease-out),
    transform 900ms var(--landing-ease-cinematic);
}
```

Capture:

```css
[data-learning-journey][data-active-step="capture"]
.journey-scene--capture {
  opacity: 1;
  transform: scale(1);
}
```

Focus:

```css
[data-learning-journey][data-active-step="focus"]
.journey-scene--focus {
  opacity: 1;
  transform: scale(1);
}
```

Patterns tương tự.

Không slide cả screen trái/phải.

Crossfade + subtle scale là đủ.

---

# 9. Desktop layout

```css
.learning-journey {
  --journey-progress: 0;

  padding-block:
    var(--landing-scene-space);

  background:
    linear-gradient(
      180deg,
      transparent,
      rgb(25 65 38 / 0.025) 30%,
      transparent 100%
    );
}

.learning-journey__heading {
  max-width: 44rem;
}

.learning-journey__layout {
  display: grid;

  grid-template-columns:
    minmax(20rem, 0.82fr)
    minmax(0, 1.18fr);

  gap: clamp(4rem, 9vw, 9rem);

  margin-top: 4rem;
}
```

Chapters:

```css
.journey-chapter {
  min-height: 72vh;

  display: flex;
  flex-direction: column;
  justify-content: center;

  opacity: 0.28;

  transition:
    opacity 500ms var(--landing-ease-out),
    transform 700ms var(--landing-ease-cinematic);
}

.journey-chapter[data-active] {
  opacity: 1;
}
```

72vh ở đây hợp lý vì chỉ có 3 steps.

Không dùng 100vh mỗi step.

---

# 10. Sticky stage

```css
.journey-stage {
  position: sticky;

  top: 7rem;

  height: calc(100svh - 9rem);

  display: grid;
  place-items: center;

  overflow: hidden;
}
```

Stage field:

```css
.journey-stage__field {
  position: absolute;

  width: min(44rem, 54vw);
  aspect-ratio: 1;

  border-radius: 50%;

  background:
    radial-gradient(
      circle,
      rgb(51 125 77 / 0.08),
      transparent 68%
    );

  filter: blur(4px);
}
```

Không border container bao quanh visual.

Stage phải như đang lơ lửng trong page.

---

# 11. Vertical journey progress

Ở edge trái/phải của visual:

```tsx
<div className="journey-stage__progress">
  <span />
</div>
```

CSS:

```css
.journey-stage__progress {
  position: absolute;
  left: 0;
  top: 16%;

  width: 1px;
  height: 68%;

  background:
    rgb(25 65 38 / 0.08);
}

.journey-stage__progress span {
  display: block;

  width: 100%;
  height: 100%;

  transform:
    scaleY(var(--journey-progress));

  transform-origin: top;

  background:
    linear-gradient(
      to bottom,
      var(--landing-mint),
      var(--landing-champagne)
    );
}
```

Đây là phần duy nhất scrubbed liên tục.

---

# 12. Chapter typography

Meta:

```css
.journey-chapter__meta {
  display: flex;
  align-items: center;
  gap: 12px;

  margin-bottom: 1.25rem;

  font-family: var(--font-mono);

  font-size: 10px;

  letter-spacing: 0.18em;

  color: var(--landing-emerald);
}
```

Rule:

```css
.journey-chapter__rule {
  width: 34px;
  height: 1px;

  background:
    color-mix(
      in oklab,
      var(--landing-emerald) 35%,
      transparent
    );
}
```

Title:

```css
.journey-chapter h3 {
  max-width: 30rem;

  font-size:
    clamp(2rem, 3.7vw, 3.4rem);

  font-weight: 600;

  line-height: 1.02;

  letter-spacing: -0.045em;
}
```

Description:

```css
.journey-chapter p {
  max-width: 31rem;

  margin-top: 1.25rem;

  font-size: 14.5px;

  line-height: 1.85;

  color: var(--text-secondary);
}
```

---

# 13. Mobile

Ở `<1024px`:

```css
@media (max-width: 1023px) {
  .learning-journey__layout {
    display: block;
  }

  .journey-chapter {
    min-height: auto;

    padding-block: 3.5rem;

    opacity: 1;
  }

  .journey-stage {
    position: relative;

    top: auto;

    height: 23rem;

    margin-top: 2rem;
  }

  .journey-stage__progress {
    display: none;
  }
}
```

Nhưng có vấn đề: một stage duy nhất nằm sau cả three chapters trên mobile thì narrative không đẹp.

Mình khuyến nghị desktop stage chỉ hiện ở desktop:

```css
@media (max-width: 1023px) {
  .learning-journey__stage-desktop {
    display: none;
  }
}
```

Và mỗi chapter có một mini visual:

```tsx
<div
  aria-hidden="true"
  className={`journey-mobile-visual journey-mobile-visual--${step.key}`}
/>
```

Nếu bạn muốn giữ implementation Phase 4 gọn hơn, có thể chưa tạo mini illustration riêng mà dùng icon/orb abstraction.

Không copy sticky desktop xuống mobile.

---

# 14. Transition từ Intelligence → Journey

Phần intelligence kết thúc nên nhẹ dần.

Có thể thêm bottom filament:

```css
.intelligence-system::after {
  content: "";

  position: absolute;

  left: 50%;
  bottom: -7rem;

  width: 1px;
  height: 7rem;

  background:
    linear-gradient(
      to bottom,
      rgb(51 125 77 / 0.18),
      transparent
    );
}
```

Và Journey có upper signal origin:

```css
.learning-journey::before {
  content: "";

  position: absolute;

  left: 50%;
  top: 0;

  width: 5px;
  height: 5px;

  border-radius: 50%;

  background: var(--landing-emerald);

  transform: translate(-50%, -50%);

  box-shadow:
    0 0 22px rgb(51 125 77 / 0.3);
}
```

Nhờ vậy sections không bị cảm giác “cắt trang”.

---

# 15. Phase 3 observer cleanup

Trong `IntelligenceController`, có thể thay callback:

```tsx
const active = entries.find(
  (entry) => entry.isIntersecting,
);
```

bằng deterministic state map giống Journey controller.

Không bắt buộc, nhưng mình khuyến nghị xử lý luôn.

---

# 16. Reduced motion

```css
@media (prefers-reduced-motion: reduce) {
  .journey-scene,
  .journey-chapter {
    transition: none !important;
  }

  .journey-stage__progress span {
    transform: none !important;
  }
}
```

Trong controller nếu reduce motion:

```tsx
root.style.setProperty(
  "--journey-progress",
  "1",
);
```

Hoặc để progress static.

Quan trọng là không có scrubbed movement.

---

## Không làm trong Phase 4

Chưa động `Showcase`.

Chưa redesign research/trust.

Không thêm hình mới.

Không thêm WebGL.

Không GSAP.

Không scroll snapping.

Không pin toàn page.

Không đổi translation.

---

## Phase 4 acceptance gate

| Gate | Requirement |
|---|---|
| HowItWorks | Không còn 3 cards |
| Story | Capture → Focus → Patterns rõ ràng |
| Desktop | Text scroll + visual stage sticky |
| Stage | Visual crossfade/morph nhẹ theo active step |
| Progress | Chỉ một progress line scrub theo scroll |
| Mobile | Không sticky dài |
| SSR | 3 title/description vẫn server-rendered |
| Controller | Client island riêng |
| Performance | Không RAF/custom scroll handler |
| Reduced motion | Không scrubbed transform |
| SEO | Copy/metadata/H1 không đổi |
| Build | lint/test/build pass |