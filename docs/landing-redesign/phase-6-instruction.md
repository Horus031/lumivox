Mình đã verify Phase 5 trên commit `6c0c922bbbe94c4dd993b90ab2c7a65e7bce28b0`.

**Phase 5: PASS.** Branch hiện `ahead main = 7`, `behind = 0`. Vercel preview của commit này đã **READY** và GitHub Vercel status là **success**. Showcase đã bỏ hoàn toàn 3 alternating rows; desktop dùng một persistent stage, controller là client island nhỏ dựa trên `IntersectionObserver`, mobile bỏ sticky, copy/alt vẫn SSR và inactive desktop visuals được đồng bộ `aria-hidden`.

Có đúng **một cleanup nhỏ** mình muốn mang sang đầu Phase 6: trước hydration, chưa element nào có `data-active`, nên product screenshot desktop có thể blank trong khoảnh khắc đầu tiên hoặc nếu JS không chạy. Hãy đặt initial state `analytics` ngay từ server markup, rồi controller chỉ tiếp quản sau hydration.

Cụ thể ở root:

```tsx
<section
  data-landing-scene="product"
  data-product-story
  data-active-product="analytics"
  ...
>
```

Analytics chapter:

```tsx
<article
  data-product-chapter="analytics"
  data-active
  ...
>
```

Analytics figure:

```tsx
<figure
  data-product-visual="analytics"
  data-active
  aria-hidden="false"
  ...
>
```

Các figure khác giữ `aria-hidden="true"`.

Như vậy Product Theater là progressive enhancement thật sự.

---

# Phase 6 — Evidence Chamber + Transparent Core

Đây là phase dành cho:

```text
ResearchEvidence
TrustSection
```

Hiện cả hai vẫn còn rất “dashboard/SaaS”:

```text
Research:
heading
4-column metrics
source row

Trust:
copy | 2x2 card grid
```

Trong khi nửa trên page giờ đã có visual language riêng.

Phase 6 sẽ kể:

```text
actual product
     ↓
EVIDENCE
"What supports these signals?"
     ↓
TRANSPARENCY
"What happens to my data and how much should I trust AI?"
```

Điểm quan trọng nhất của phase này:

> **Không được làm các research number trông giống efficacy claims.**

Các số hiện tại phải tiếp tục được hiểu đúng là **model/dataset evaluation evidence**, không phải “Lumivox giúp học tốt hơn 76.9%”.

Các giá trị source-of-truth hiện tại là:

```text
70,379   Task snapshots
6,643    Unique tasks
76.9%    Held-out test recall
0.751    Held-out ROC-AUC
```

Và copy hiện tại đã nói rất đúng:

> Every number below comes from the held-out test evaluation, not from a student-outcome claim.

Giữ nguyên.

---

# Part A — ResearchEvidence → Evidence Chamber

## 1. Bỏ bordered metric grid

Trong `research-evidence.tsx`, bỏ:

```text
border-y
bg-surface

grid-cols-2
md:grid-cols-4

md:border-r
```

Section root:

```tsx
<section
  data-landing-scene="evidence"
  id="evidence"
  className="evidence-chamber relative isolate overflow-hidden"
>
```

---

# 2. Layout mới

Concept:

```text
       MODEL EVALUATION

       Research-backed
       behavioral intelligence

              0.751
             ROC-AUC
            ╱       ╲
      70,379         76.9%
     snapshots       recall
            ╲       ╱
              6,643
               tasks

     Native task-risk model v2
        View methodology →
```

Không phải dashboard.

Nó là **scientific instrument / evidence chamber**.

Markup:

```tsx
<div className="evidence-chamber__inner mx-auto max-w-310 px-6">
  <header className="evidence-chamber__heading">
    ...
  </header>

  <div className="evidence-orbit">
    <div
      aria-hidden="true"
      className="evidence-orbit__field"
    />

    <svg
      aria-hidden="true"
      className="evidence-orbit__connections"
      viewBox="0 0 1000 560"
    >
      ...
    </svg>

    <dl className="evidence-orbit__metrics">
      {modelEvidence.map((item, index) => (
        ...
      ))}
    </dl>

    <div className="evidence-orbit__core">
      <span>MODEL</span>
      <strong>v2</strong>
    </div>
  </div>

  <footer className="evidence-chamber__source">
    ...
  </footer>
</div>
```

---

# 3. Header

Giữ nguyên translations:

```tsx
<header className="evidence-chamber__heading">
  <p className="evidence-chamber__eyebrow">
    {t("eyebrow")}
  </p>

  <h2>
    {t("title")}
  </h2>

  <p className="evidence-chamber__description">
    {t("description")}
  </p>
</header>
```

CSS:

```css
.evidence-chamber {
  padding-block:
    clamp(7rem, 12vw, 11rem);

  background:
    linear-gradient(
      180deg,
      var(--background),
      color-mix(
        in oklab,
        var(--landing-forest) 4%,
        var(--background)
      ) 48%,
      var(--background)
    );
}

.evidence-chamber__heading {
  max-width: 50rem;
  margin-inline: auto;
  text-align: center;
}

.evidence-chamber__heading h2 {
  margin-top: 0.75rem;

  font-size:
    clamp(2.4rem, 5vw, 4.8rem);

  font-weight: 600;
  line-height: 0.98;

  letter-spacing: -0.05em;
}

.evidence-chamber__description {
  max-width: 44rem;

  margin: 1.5rem auto 0;

  font-size: 14.5px;
  line-height: 1.85;

  color: var(--text-secondary);
}
```

---

# 4. Evidence orbit

```css
.evidence-orbit {
  position: relative;

  width:
    min(64rem, calc(100vw - 3rem));

  aspect-ratio: 16 / 9;

  margin:
    clamp(4rem, 8vw, 7rem)
    auto 0;
}
```

Field:

```css
.evidence-orbit__field {
  position: absolute;

  left: 50%;
  top: 50%;

  width: 58%;
  aspect-ratio: 1;

  border-radius: 50%;

  background:
    radial-gradient(
      circle,
      rgb(51 125 77 / 0.08),
      transparent 66%
    );

  transform:
    translate(-50%, -50%);
}
```

---

# 5. Central model core

```tsx
<div
  aria-hidden="true"
  className="evidence-orbit__core"
>
  <span>MODEL</span>
  <strong>v2</strong>
</div>
```

```css
.evidence-orbit__core {
  position: absolute;

  left: 50%;
  top: 50%;

  display: grid;
  place-content: center;

  width: 112px;
  aspect-ratio: 1;

  border:
    1px solid rgb(51 125 77 / 0.16);

  border-radius: 50%;

  background:
    color-mix(
      in oklab,
      var(--background) 88%,
      transparent
    );

  text-align: center;

  transform:
    translate(-50%, -50%);

  box-shadow:
    0 0 0 18px rgb(51 125 77 / 0.025),
    0 24px 80px rgb(25 65 38 / 0.08);
}

.evidence-orbit__core span {
  font-family: var(--font-mono);
  font-size: 8px;

  letter-spacing: 0.18em;

  color: var(--text-muted);
}

.evidence-orbit__core strong {
  margin-top: 4px;

  font-size: 24px;

  font-weight: 600;

  color: var(--landing-emerald);
}
```

`MODEL v2` chỉ là decorative identifier, không phải claim mới.

---

# 6. Metric nodes

Markup:

```tsx
<div
  key={item.key}
  data-evidence-position={index}
  className="evidence-metric"
>
  <dd>{item.value}</dd>

  <dt>
    {t(`metrics.${item.key}.label`)}
  </dt>

  <p>
    {t(`metrics.${item.key}.description`)}
  </p>
</div>
```

CSS:

```css
.evidence-metric {
  position: absolute;

  width: 13rem;

  text-align: center;
}

.evidence-metric dd {
  font-size:
    clamp(2rem, 4vw, 3.8rem);

  font-weight: 600;

  line-height: 1;

  letter-spacing: -0.045em;

  color: var(--landing-forest);
}

.dark .evidence-metric dd {
  color: var(--landing-mint);
}

.evidence-metric dt {
  margin-top: 0.65rem;

  font-size: 12px;
  font-weight: 600;
}

.evidence-metric p {
  margin-top: 0.45rem;

  font-size: 10.5px;
  line-height: 1.55;

  color: var(--text-muted);
}
```

Positions:

```css
.evidence-metric[data-evidence-position="0"] {
  left: 4%;
  top: 15%;
}

.evidence-metric[data-evidence-position="1"] {
  right: 4%;
  top: 15%;
}

.evidence-metric[data-evidence-position="2"] {
  left: 8%;
  bottom: 12%;
}

.evidence-metric[data-evidence-position="3"] {
  right: 8%;
  bottom: 12%;
}
```

---

# 7. Connections

Không cần SVG animation.

Chỉ static hairlines:

```css
.evidence-orbit__connections {
  position: absolute;
  inset: 0;

  width: 100%;
  height: 100%;

  fill: none;

  stroke:
    color-mix(
      in oklab,
      var(--landing-emerald) 15%,
      transparent
    );

  stroke-width: 1;
}
```

Có thể dùng 4 paths nối core đến metric positions.

---

# 8. Source line phải nổi bật về epistemic honesty

Footer:

```tsx
<footer className="evidence-chamber__source">
  <div>
    <span aria-hidden="true" />
    <p>{t("source")}</p>
  </div>

  <Link ...>
    {t("cta")}
    <ArrowRight ... />
  </Link>
</footer>
```

CSS:

```css
.evidence-chamber__source {
  display: flex;

  max-width: 55rem;

  margin: 3rem auto 0;

  align-items: center;
  justify-content: space-between;

  gap: 2rem;

  padding-top: 1.5rem;

  border-top:
    1px solid
    color-mix(
      in oklab,
      var(--foreground) 9%,
      transparent
    );
}

.evidence-chamber__source > div {
  display: flex;
  align-items: center;
  gap: 10px;
}

.evidence-chamber__source > div > span {
  width: 5px;
  height: 5px;

  border-radius: 50%;

  background: var(--landing-emerald);
}
```

---

# 9. Mobile evidence

Không orbit positioning trên mobile.

```css
@media (max-width: 767px) {
  .evidence-orbit {
    aspect-ratio: auto;

    width: auto;

    margin-top: 4rem;
  }

  .evidence-orbit__field,
  .evidence-orbit__connections,
  .evidence-orbit__core {
    display: none;
  }

  .evidence-orbit__metrics {
    display: grid;

    grid-template-columns:
      repeat(2, minmax(0, 1fr));

    gap: 2.5rem 1.5rem;
  }

  .evidence-metric {
    position: static;

    width: auto;
  }
}
```

Ở mobile 2×2 metrics là chấp nhận được vì đây là dữ liệu, không phải generic feature cards.

Không background card.

---

# Part B — TrustSection → Transparent Core

Sau Evidence Chamber, user cần câu trả lời:

> “Vậy dữ liệu đi đâu? AI tham gia ở đâu? Tôi còn quyền kiểm soát không?”

Thay vì 4 cards, chúng ta trực quan hóa nó thành một **transparent pipeline**.

---

# 10. Visual concept

Desktop:

```text
 Privacy and AI transparency

 Useful signals,
 with their limits visible.

                 DATA
                   │
             BEHAVIOR SIGNAL
                   │
               AI ASSIST
                   │
               DECISION
                   │
                  YOU

      Purpose          Assistance

      Transparency     Control
```

Core idea:

**User nằm ở cuối và vẫn giữ authority.**

Điều này rất phù hợp copy hiện tại:

> predictions should remain decision support.

---

# 11. Trust root

```tsx
<section
  data-landing-scene="trust"
  className="transparent-core relative isolate"
>
```

Không:

```text
border-y
bg-elevated/40
```

---

# 12. Layout

```tsx
<div className="transparent-core__inner mx-auto max-w-310 px-6">
  <header className="transparent-core__heading">
    ...
  </header>

  <div className="transparent-core__layout">
    <div className="transparent-core__diagram">
      ...
    </div>

    <div className="transparent-core__principles">
      ...
    </div>
  </div>

  <Link ...>
    {t("cta")}
  </Link>
</div>
```

---

# 13. Heading

```css
.transparent-core {
  padding-block:
    clamp(7rem, 11vw, 10rem);

  background:
    linear-gradient(
      180deg,
      transparent,
      rgb(25 65 38 / 0.035),
      transparent
    );
}

.transparent-core__heading {
  max-width: 46rem;
}

.transparent-core__heading h2 {
  font-size:
    clamp(2.4rem, 5vw, 4.7rem);

  font-weight: 600;

  line-height: 0.99;

  letter-spacing: -0.05em;
}
```

---

# 14. Transparent pipeline

Tạo:

```text
apps/web/components/landing/story/trust-pipeline.tsx
```

Không cần `"use client"`.

```tsx
import {
  BrainCircuit,
  Database,
  ShieldCheck,
  UserRound,
} from "lucide-react";

const stages = [
  {
    key: "data",
    label: "DATA",
    icon: Database,
  },
  {
    key: "model",
    label: "AI ASSIST",
    icon: BrainCircuit,
  },
  {
    key: "control",
    label: "YOU DECIDE",
    icon: UserRound,
  },
] as const;

export default function TrustPipeline() {
  return (
    <div
      aria-hidden="true"
      className="trust-pipeline"
    >
      {stages.map(({ key, label, icon: Icon }) => (
        <div
          key={key}
          className="trust-pipeline__stage"
        >
          <span className="trust-pipeline__node">
            <Icon />
          </span>

          <span className="trust-pipeline__label">
            {label}
          </span>
        </div>
      ))}

      <div className="trust-pipeline__line" />

      <ShieldCheck className="trust-pipeline__shield" />
    </div>
  );
}
```

Lưu ý: các label trên là decorative vì `aria-hidden`; không phải localized user content.

Nếu bạn muốn tuyệt đối không có English decorative label trên VI page, bỏ labels và chỉ giữ icons/nodes.

Mình nghiêng về **bỏ labels** hoặc chỉ dùng `01/02/03`.

---

# 15. Pipeline CSS

```css
.trust-pipeline {
  position: relative;

  display: flex;
  flex-direction: column;

  min-height: 34rem;

  align-items: center;
  justify-content: space-around;
}

.trust-pipeline__line {
  position: absolute;

  left: 50%;
  top: 12%;
  bottom: 12%;

  width: 1px;

  background:
    linear-gradient(
      to bottom,
      transparent,
      rgb(51 125 77 / 0.24) 18%,
      rgb(51 125 77 / 0.24) 82%,
      transparent
    );

  transform: translateX(-50%);
}

.trust-pipeline__stage {
  position: relative;
  z-index: 2;

  display: flex;
  flex-direction: column;

  align-items: center;
}

.trust-pipeline__node {
  display: grid;
  place-items: center;

  width: 72px;
  aspect-ratio: 1;

  border:
    1px solid rgb(51 125 77 / 0.14);

  border-radius: 50%;

  background: var(--background);

  color: var(--landing-emerald);

  box-shadow:
    0 0 0 10px
    color-mix(
      in oklab,
      var(--landing-emerald) 3%,
      transparent
    );
}

.trust-pipeline__node svg {
  width: 21px;
  height: 21px;
}
```

Last node/user có thể mạnh hơn:

```css
.trust-pipeline__stage:last-of-type
.trust-pipeline__node {
  border-color:
    rgb(51 125 77 / 0.28);

  box-shadow:
    0 0 0 12px rgb(51 125 77 / 0.04),
    0 0 38px rgb(51 125 77 / 0.12);
}
```

---

# 16. Four trust principles

Thay 2×2 card grid bằng vertical statements.

```tsx
<div className="transparent-core__principles">
  {items.map(({ key, icon: Icon }, index) => (
    <article
      key={key}
      className="trust-principle"
    >
      <span
        aria-hidden="true"
        className="trust-principle__index"
      >
        {String(index + 1).padStart(2, "0")}
      </span>

      <div>
        <div className="trust-principle__title">
          <Icon aria-hidden="true" />
          <h3>
            {t(`items.${key}.title`)}
          </h3>
        </div>

        <p>
          {t(`items.${key}.description`)}
        </p>
      </div>
    </article>
  ))}
</div>
```

CSS:

```css
.transparent-core__layout {
  display: grid;

  grid-template-columns:
    minmax(18rem, 0.8fr)
    minmax(0, 1.2fr);

  gap: clamp(4rem, 9vw, 9rem);

  margin-top: 5rem;
}

.trust-principle {
  display: grid;

  grid-template-columns:
    2rem 1fr;

  gap: 1.25rem;

  padding-block: 2rem;

  border-bottom:
    1px solid
    color-mix(
      in oklab,
      var(--foreground) 8%,
      transparent
    );
}

.trust-principle__index {
  padding-top: 3px;

  font-family: var(--font-mono);

  font-size: 9px;

  color: var(--text-muted);
}

.trust-principle__title {
  display: flex;
  align-items: center;

  gap: 10px;
}

.trust-principle__title svg {
  width: 17px;
  height: 17px;

  color: var(--landing-emerald);
}

.trust-principle h3 {
  font-size: 17px;
  font-weight: 600;

  letter-spacing: -0.02em;
}

.trust-principle p {
  max-width: 36rem;

  margin-top: 0.75rem;

  font-size: 13.5px;

  line-height: 1.75;

  color: var(--text-secondary);
}
```

Không cards.

Không hover elevation.

---

# 17. Privacy CTA

CTA hiện tại là bordered rectangle.

Đổi thành text CTA:

```tsx
<Link
  href="/privacy"
  className="transparent-core__cta group"
>
  <span>{t("cta")}</span>

  <ArrowRight ... />
</Link>
```

Bạn cần thêm `ArrowRight` import.

CSS:

```css
.transparent-core__cta {
  display: inline-flex;
  align-items: center;
  gap: 8px;

  margin-top: 3rem;

  font-size: 13px;
  font-weight: 600;

  color: var(--landing-forest);
}

.dark .transparent-core__cta {
  color: var(--landing-mint);
}

.transparent-core__cta svg {
  width: 15px;
  height: 15px;

  transition:
    transform 300ms
    var(--landing-ease-out);
}

.transparent-core__cta:hover svg {
  transform: translateX(4px);
}
```

---

# 18. Evidence → Trust transition

Hai sections không nên có border ngăn.

Thêm cuối Evidence:

```css
.evidence-chamber::after {
  content: "";

  position: absolute;

  left: 50%;
  bottom: 0;

  width: 1px;
  height: 5rem;

  background:
    linear-gradient(
      to bottom,
      transparent,
      rgb(51 125 77 / 0.16)
    );
}
```

Trust:

```css
.transparent-core::before {
  content: "";

  position: absolute;

  left: 50%;
  top: 0;

  width: 5px;
  height: 5px;

  border-radius: 50%;

  background: var(--landing-emerald);

  transform:
    translate(-50%, -50%);

  box-shadow:
    0 0 18px rgb(51 125 77 / 0.22);
}
```

---

# 19. Mobile Trust

```css
@media (max-width: 767px) {
  .transparent-core__layout {
    display: block;

    margin-top: 3rem;
  }

  .trust-pipeline {
    min-height: auto;

    flex-direction: row;

    justify-content: space-between;

    padding-block: 2rem;

    margin-bottom: 3rem;
  }

  .trust-pipeline__line {
    left: 12%;
    right: 12%;
    top: 50%;

    width: auto;
    height: 1px;

    bottom: auto;

    transform: none;

    background:
      linear-gradient(
        to right,
        transparent,
        rgb(51 125 77 / 0.22),
        transparent
      );
  }

  .trust-pipeline__node {
    width: 54px;
  }
}
```

---

# 20. Motion

Phase 6 **không cần controller mới**.

Dùng `StoryReveal` rất chọn lọc:

- Evidence heading
- Evidence orbit wrapper
- Trust heading
- Trust principles container

Không wrap từng metric riêng với 4 delays.

Không animation number counting.

Không animated chart drawing.

Các con số khoa học nên cảm giác **stable**, không showy.

---

# 21. Product Stage progressive enhancement cleanup

Làm ở đầu commit Phase 6:

```tsx
<section
  data-product-story
  data-active-product="analytics"
>
```

Analytics chapter:

```tsx
data-active
```

Analytics desktop visual:

```tsx
data-active
aria-hidden="false"
```

Controller vẫn giữ logic cũ.

---

# 22. Không thay đổi evidence source

Không sửa:

```ts
apps/web/lib/marketing/evidence.ts
```

Không làm tròn lại:

```text
76.9%
0.751
```

Không đổi thành:

```text
77% success
75% accuracy
```

Không thêm câu như:

```text
Proven to improve student performance
Research-proven learning
Scientifically proven
```

Chúng sẽ vượt quá evidence hiện có.

---

## Phase 6 acceptance gate

| Gate | Requirement |
|---|---|
| Research | Không còn four-column bordered metric grid |
| Metrics | 70,379 / 6,643 / 76.9% / 0.751 giữ nguyên |
| Claims | Vẫn nói rõ held-out evaluation, không student-outcome claim |
| Evidence visual | Scientific/orbital, không dashboard cards |
| Trust | Không còn 2×2 card grid |
| Transparency | Có data → AI → user/control visual hierarchy |
| Copy | Không đổi trust/research translations |
| CTA | `/research` và `/privacy` vẫn tồn tại |
| SSR | Toàn bộ metric/trust copy vẫn server-rendered |
| JS | Không thêm controller nếu không cần |
| Mobile | Orbit trở thành readable 2×2; pipeline horizontal |
| A11y | Decorative diagrams `aria-hidden` |
| Product cleanup | Analytics visible ngay cả trước hydration |
| Build | lint/test/build pass |