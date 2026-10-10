Mình đã verify commit Phase 6:

`b0ea69bbd9d81d9a38badbd054f405c6816c8d0b` — `feat(landing): build evidence and transparency scenes`

**Phase 6: PASS về source/architecture.** Branch hiện `ahead main = 8`, `behind = 0`. Research metrics vẫn lấy trực tiếp từ `modelEvidence`, không đổi `70,379 / 6,643 / 76.9% / 0.751`, không xuất hiện efficacy claim mới; `/research` và `/privacy` vẫn giữ nguyên; Trust đã bỏ 2×2 cards; Product Theater cũng đã có initial analytics state từ SSR nên progressive enhancement ổn.

Vercel của commit này tại thời điểm mình kiểm tra vẫn đang **BUILDING / pending**, chưa có dấu hiệu error. Vì source review sạch nên mình không coi đây là blocker để sang phase kế tiếp, nhưng commit Phase 7 hoặc chính deployment này phải về `READY` trước khi chúng ta coi redesign đủ điều kiện merge.

Có một cleanup semantic nhỏ nên sửa ngay đầu Phase 7: trong `ResearchEvidence`, `<dl>` hiện có `dd` trước `dt` và một `<p>` nằm cùng cấp. Nên đổi thành `dt → dd`, đồng thời đưa description vào `dd` để HTML/a11y đúng nghĩa.

# Phase 7 — Quiet Resolution + Final Convergence

Đây là phase kết thúc **storytelling layer** của landing.

Hai section cuối hiện tại là:

```text
FAQ
↓
CTA
```

nhưng visual vẫn là:

```text
accordion rows
↓
green rounded rectangle
```

Trong khi toàn bộ phía trên đã thành một hệ thống:

```text
Awaken
→ Principles
→ Intelligence
→ Journey
→ Product
→ Evidence
→ Trust
```

Phase này phải kết thúc bằng:

```text
Trust
   ↓
Quiet Resolution
   ↓
Final Convergence
```

Tức user đã hiểu product, thấy evidence, hiểu giới hạn và quyền kiểm soát, sau đó những thắc mắc cuối được giải quyết nhẹ nhàng trước khi đi đến quyết định.

---

## 1. Cleanup Evidence semantics trước

Trong `research-evidence.tsx`, thay phần metric từ:

```tsx
<dd>{item.value}</dd>
<dt>{...}</dt>
<p>{...}</p>
```

thành:

```tsx
<div
  key={item.key}
  data-evidence-position={index}
  className="evidence-metric"
>
  <dt>{t(`metrics.${item.key}.label`)}</dt>

  <dd>
    <span className="evidence-metric__value">
      {item.value}
    </span>

    <span className="evidence-metric__description">
      {t(`metrics.${item.key}.description`)}
    </span>
  </dd>
</div>
```

CSS đổi selector tương ứng:

```css
.evidence-metric__value {
  display: block;

  font-size: 3.6rem;
  font-weight: 600;
  line-height: 1;

  color: var(--landing-forest);
}

.dark .evidence-metric__value {
  color: var(--landing-mint);
}

.evidence-metric dt {
  font-size: 12px;
  font-weight: 600;
}

.evidence-metric__description {
  display: block;

  margin-top: 0.45rem;

  font-size: 10.5px;
  line-height: 1.55;

  color: var(--text-muted);
}
```

Không đổi data.

---

# Part A — FAQ → Quiet Resolution

FAQ không cần trở thành “một animation showcase” khác.

Đây phải là đoạn page **chậm lại**.

Concept:

```text
             STILL CURIOUS?

       A few quiet answers
       before you begin.

01 ─ Is Lumivox free?                 +
02 ─ Is this an AI coach?             +
03 ─ What happens to my data?         +
04 ─ Can I study with friends?        +
```

Khi mở:

```text
03 ─ What happens to my data?         ×

     Answer text expands here with
     generous breathing space.
```

Không container card.

Không rounded accordion.

Không border box bao section.

---

## 2. Rewrite FAQ root

Hiện:

```tsx
<section
  data-landing-scene="resolution"
  id="faq"
  className="py-24"
>
```

đổi thành:

```tsx
<section
  data-landing-scene="resolution"
  id="faq"
  className="quiet-resolution relative isolate"
>
```

Structure:

```tsx
<div className="quiet-resolution__inner mx-auto max-w-310 px-6">
  <header className="quiet-resolution__heading">
    <p>{t("eyebrow")}</p>

    <h2>{t("title")}</h2>
  </header>

  <div className="quiet-resolution__questions">
    {faqs.map((faq, index) => (
      ...
    ))}
  </div>
</div>
```

---

# 3. FAQ heading

Không center toàn bộ nữa.

Một layout hơi editorial sẽ nối tốt hơn với Trust.

```css
.quiet-resolution {
  padding-block:
    clamp(7rem, 12vw, 11rem);
}

.quiet-resolution__inner {
  display: grid;

  grid-template-columns:
    minmax(15rem, 0.6fr)
    minmax(0, 1.4fr);

  gap:
    clamp(4rem, 10vw, 10rem);
}

.quiet-resolution__heading {
  position: sticky;

  top: 8rem;

  align-self: start;
}

.quiet-resolution__heading > p {
  font-size: 11px;
  font-weight: 500;

  text-transform: uppercase;
  letter-spacing: 0.18em;

  color: var(--landing-emerald);
}

.quiet-resolution__heading h2 {
  max-width: 20rem;

  margin-top: 0.9rem;

  font-size:
    clamp(2.25rem, 4.5vw, 4.25rem);

  font-weight: 600;

  line-height: 0.99;
  letter-spacing: -0.045em;
}
```

Chỉ heading sticky, không phải cả FAQ.

---

# 4. FAQ rows

Giữ native `<details>`.

Đây là lựa chọn tốt hơn client accordion về accessibility, SSR và JS cost.

```tsx
<details
  key={f.key}
  className="resolution-item"
>
  <summary className="resolution-item__summary">
    <span
      aria-hidden="true"
      className="resolution-item__index"
    >
      {String(index + 1).padStart(2, "0")}
    </span>

    <h3>
      {t(`items.${f.key}.question`)}
    </h3>

    <span
      aria-hidden="true"
      className="resolution-item__toggle"
    >
      <i />
      <i />
    </span>
  </summary>

  <div className="resolution-item__answer">
    <p>{t(`items.${f.key}.answer`)}</p>
  </div>
</details>
```

Không dùng dấu `"+"` text nữa.

Dùng hai hairline để tạo plus icon.

---

# 5. FAQ styling

```css
.quiet-resolution__questions {
  border-top:
    1px solid
    color-mix(
      in oklab,
      var(--foreground) 10%,
      transparent
    );
}

.resolution-item {
  border-bottom:
    1px solid
    color-mix(
      in oklab,
      var(--foreground) 10%,
      transparent
    );
}

.resolution-item__summary {
  display: grid;

  grid-template-columns:
    2.5rem 1fr 2rem;

  align-items: center;

  gap: 1rem;

  min-height: 6rem;

  cursor: pointer;

  list-style: none;
}

.resolution-item__summary::-webkit-details-marker {
  display: none;
}
```

Index:

```css
.resolution-item__index {
  font-family: var(--font-mono);

  font-size: 9px;

  color: var(--text-muted);
}
```

Question:

```css
.resolution-item h3 {
  font-size:
    clamp(1.05rem, 1.7vw, 1.35rem);

  font-weight: 500;

  line-height: 1.45;

  letter-spacing: -0.025em;
}
```

---

# 6. FAQ toggle

```css
.resolution-item__toggle {
  position: relative;

  width: 24px;
  height: 24px;

  justify-self: end;
}

.resolution-item__toggle i {
  position: absolute;

  left: 50%;
  top: 50%;

  width: 12px;
  height: 1px;

  background: currentColor;

  transform:
    translate(-50%, -50%);

  transition:
    transform 350ms
    var(--landing-ease-out);
}

.resolution-item__toggle i:last-child {
  transform:
    translate(-50%, -50%)
    rotate(90deg);
}

.resolution-item[open]
.resolution-item__toggle i:last-child {
  transform:
    translate(-50%, -50%)
    rotate(0deg);
}
```

Không circle.

Không button-like affordance.

---

# 7. Answer

```css
.resolution-item__answer {
  display: grid;

  grid-template-columns:
    2.5rem 1fr 2rem;

  gap: 1rem;

  padding-bottom: 2.25rem;
}

.resolution-item__answer p {
  grid-column: 2;

  max-width: 41rem;

  font-size: 14px;

  line-height: 1.85;

  color: var(--text-secondary);
}
```

Không cần JS animation chiều cao.

Native open/close là đủ.

Ta đã có khá nhiều motion phía trên; cuối trang nên bớt chuyển động.

---

# 8. FAQ hover/focus

```css
.resolution-item__summary {
  transition:
    color 300ms
    var(--landing-ease-out);
}

.resolution-item__summary:hover {
  color: var(--landing-emerald);
}

.resolution-item__summary:focus-visible {
  outline:
    2px solid
    color-mix(
      in oklab,
      var(--landing-emerald) 45%,
      transparent
    );

  outline-offset: 6px;
}
```

Không remove focus outline nếu chưa có replacement.

---

# 9. Mobile FAQ

Heading không sticky:

```css
@media (max-width: 767px) {
  .quiet-resolution__inner {
    display: block;
  }

  .quiet-resolution__heading {
    position: static;

    margin-bottom: 3.5rem;
  }

  .quiet-resolution__heading h2 {
    max-width: 25rem;
  }

  .resolution-item__summary {
    grid-template-columns:
      2rem 1fr 1.5rem;

    min-height: 5.5rem;
  }

  .resolution-item__answer {
    grid-template-columns:
      2rem 1fr 1.5rem;
  }
}
```

---

# Part B — CTA → Final Neural Convergence

CTA hiện tại là một rounded green rectangle.

Đây là pattern cuối cùng còn phá narrative.

Ta sẽ bỏ hoàn toàn container kiểu:

```text
rounded-lg
border
bg-primary/70
```

Final CTA phải giống Hero được “khép lại”, nhưng không lặp lại Hero.

Concept:

```text
                     ·
                  ·  │  ·
             ·────── ○ ──────·
                  ·  │  ·
                     ·

            Ready when you are.

      Build a calmer study rhythm...

        [ Start free → ]   Explore features

              ✓ ...  · ✓ ... · ✓ ...
```

Tất cả neural paths từ story như hội tụ về một điểm.

---

# 10. CTA root

```tsx
<section
  data-landing-scene="convergence"
  className="final-convergence relative isolate overflow-hidden"
>
```

Không nested rounded panel.

Structure:

```tsx
<div className="final-convergence__field">
  <ConvergenceVisual />
</div>

<div className="final-convergence__content mx-auto max-w-310 px-6">
  <StoryReveal>
    ...
  </StoryReveal>
</div>
```

---

# 11. Tạo `convergence-visual.tsx`

Path:

```text
apps/web/components/landing/story/convergence-visual.tsx
```

Server Component, không JS.

```tsx
export default function ConvergenceVisual() {
  return (
    <div
      aria-hidden="true"
      data-landing-motion="decorative"
      className="convergence-visual"
    >
      <div className="convergence-visual__halo" />

      <div className="convergence-visual__ring convergence-visual__ring--outer" />
      <div className="convergence-visual__ring convergence-visual__ring--inner" />

      <span className="convergence-visual__core" />

      <span className="convergence-visual__ray convergence-visual__ray--top" />
      <span className="convergence-visual__ray convergence-visual__ray--right" />
      <span className="convergence-visual__ray convergence-visual__ray--bottom" />
      <span className="convergence-visual__ray convergence-visual__ray--left" />

      <span className="convergence-visual__star convergence-visual__star--one" />
      <span className="convergence-visual__star convergence-visual__star--two" />
      <span className="convergence-visual__star convergence-visual__star--three" />
      <span className="convergence-visual__star convergence-visual__star--four" />
    </div>
  );
}
```

Không canvas.

Không particles loop.

---

# 12. Final section background

```css
.final-convergence {
  min-height:
    min(58rem, 92svh);

  display: grid;
  place-items: center;

  padding-block:
    clamp(8rem, 14vw, 13rem);

  color: var(--landing-pearl);

  background:
    radial-gradient(
      ellipse at 50% 52%,
      #0e2517 0%,
      #08140d 40%,
      var(--landing-void) 74%
    );
}
```

Không phải rectangular panel nữa.

Section itself là environment.

---

# 13. Convergence field

```css
.final-convergence__field {
  position: absolute;
  inset: 0;

  display: grid;
  place-items: center;
}

.convergence-visual {
  position: relative;

  width:
    min(46rem, 76vw);

  aspect-ratio: 1;

  opacity: 0.8;
}
```

Halo:

```css
.convergence-visual__halo {
  position: absolute;

  inset: 20%;

  border-radius: 50%;

  background:
    radial-gradient(
      circle,
      rgb(51 125 77 / 0.22),
      transparent 68%
    );

  filter: blur(36px);
}
```

Rings:

```css
.convergence-visual__ring {
  position: absolute;

  left: 50%;
  top: 50%;

  border:
    1px solid
    rgb(131 184 149 / 0.1);

  border-radius: 50%;

  transform:
    translate(-50%, -50%);
}

.convergence-visual__ring--outer {
  width: 76%;
  aspect-ratio: 1;
}

.convergence-visual__ring--inner {
  width: 42%;
  aspect-ratio: 1;
}
```

Core:

```css
.convergence-visual__core {
  position: absolute;

  left: 50%;
  top: 50%;

  width: 8px;
  height: 8px;

  border-radius: 50%;

  background: var(--landing-mint);

  transform:
    translate(-50%, -50%);

  box-shadow:
    0 0 0 9px rgb(131 184 149 / 0.05),
    0 0 44px rgb(131 184 149 / 0.55);
}
```

---

# 14. Neural rays

Base:

```css
.convergence-visual__ray {
  position: absolute;

  left: 50%;
  top: 50%;

  background:
    linear-gradient(
      to right,
      transparent,
      rgb(131 184 149 / 0.25),
      transparent
    );

  transform-origin: center;
}
```

Horizontal:

```css
.convergence-visual__ray--left,
.convergence-visual__ray--right {
  width: 42%;
  height: 1px;
}
```

Vertical dùng rotation:

```css
.convergence-visual__ray--top,
.convergence-visual__ray--bottom {
  width: 42%;
  height: 1px;

  transform: rotate(90deg);
}
```

Bạn có thể positioning cụ thể bằng translate.

Điều quan trọng là các line **hội tụ vào core**, không tạo “tech HUD”.

---

# 15. Stars / nodes

```css
.convergence-visual__star {
  position: absolute;

  width: 3px;
  height: 3px;

  border-radius: 50%;

  background:
    rgb(214 193 161 / 0.7);

  box-shadow:
    0 0 12px
    rgb(214 193 161 / 0.35);
}
```

Chỉ 4–6 dots.

Không starfield dày.

---

# 16. CTA content

```tsx
<div className="final-convergence__content mx-auto max-w-310 px-6">
  <StoryReveal distance={18}>
    <div className="final-convergence__copy">
      <p className="final-convergence__eyebrow">
        LUMIVOX
      </p>

      <h2>{t("title")}</h2>

      <p className="final-convergence__subtitle">
        {t("subtitle")}
      </p>

      ...
    </div>
  </StoryReveal>
</div>
```

Mình **không khuyến nghị thêm translation mới** chỉ để có eyebrow.

Có thể dùng brand `"Lumivox"` như decorative/brand text.

Hoặc bỏ hoàn toàn eyebrow.

---

# 17. CTA typography

```css
.final-convergence__content {
  position: relative;
  z-index: 5;

  text-align: center;
}

.final-convergence__copy {
  max-width: 54rem;

  margin-inline: auto;
}

.final-convergence h2 {
  font-size:
    clamp(3rem, 7vw, 6.5rem);

  font-weight: 600;

  line-height: 0.94;

  letter-spacing: -0.055em;
}

.final-convergence__subtitle {
  max-width: 37rem;

  margin: 1.75rem auto 0;

  font-size:
    clamp(14.5px, 1.5vw, 17px);

  line-height: 1.75;

  color:
    rgb(236 240 237 / 0.62);
}
```

Lớn hơn CTA cũ đáng kể.

Đây là final statement của page.

---

# 18. CTA buttons

Primary:

```tsx
<Link
  href="/auth/sign-up"
  className="final-convergence__primary group"
>
  {t("primaryCta")}

  <ArrowRight ... />
</Link>
```

Secondary:

```tsx
<Link
  href="/features"
  className="final-convergence__secondary"
>
  {t("secondaryCta")}
</Link>
```

CSS:

```css
.final-convergence__actions {
  display: flex;
  flex-wrap: wrap;

  justify-content: center;

  gap: 0.75rem;

  margin-top: 2.5rem;
}

.final-convergence__primary,
.final-convergence__secondary {
  display: inline-flex;

  height: 3rem;

  align-items: center;
  justify-content: center;

  gap: 8px;

  padding-inline: 1.5rem;

  border-radius: 9999px;

  font-size: 13.5px;
  font-weight: 600;
}
```

Primary:

```css
.final-convergence__primary {
  background: var(--landing-pearl);

  color: var(--landing-obsidian);
}
```

Secondary:

```css
.final-convergence__secondary {
  border:
    1px solid
    rgb(236 240 237 / 0.15);

  color:
    rgb(236 240 237 / 0.72);

  background:
    rgb(255 255 255 / 0.025);
}
```

Một chút pill ở **CTA control** là đúng semantics; khác với dùng pill/card làm toàn layout.

---

# 19. Proof row

Giữ nguyên 3 translation hiện tại:

```tsx
<div className="final-convergence__proof">
  <span>
    <CircleDollarSign ... />
    {t("proof.explore")}
  </span>

  ...
</div>
```

Nhưng visual:

```css
.final-convergence__proof {
  display: flex;
  flex-wrap: wrap;

  justify-content: center;

  gap:
    0.75rem 1.5rem;

  margin-top: 2rem;

  font-size: 11px;

  color:
    rgb(236 240 237 / 0.4);
}

.final-convergence__proof span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.final-convergence__proof svg {
  width: 12px;
  height: 12px;

  color: var(--landing-mint);
}
```

Không badges.

---

# 20. Trust → FAQ → CTA continuity

Trust kết thúc hiện có central connector.

FAQ có thể bắt đầu bằng:

```css
.quiet-resolution::before {
  content: "";

  position: absolute;

  left: 50%;
  top: 0;

  width: 1px;
  height: 5rem;

  background:
    linear-gradient(
      to bottom,
      rgb(51 125 77 / 0.12),
      transparent
    );
}
```

FAQ → CTA:

```css
.quiet-resolution::after {
  content: "";

  position: absolute;

  left: 50%;
  bottom: 0;

  width: 1px;
  height: 6rem;

  background:
    linear-gradient(
      to bottom,
      transparent,
      rgb(131 184 149 / 0.16)
    );
}
```

CTA core nằm đúng center để line visually hội tụ vào đó.

---

# 21. Không cần controller mới

Phase 7 tốt nhất **không thêm client component mới**.

FAQ native `<details>`.

Convergence visual CSS-only.

StoryReveal đủ cho content entrance.

Điều này rất quan trọng vì chúng ta đã có đủ motion islands:

```text
Hero
Intelligence
Journey
Product
Atmosphere
```

Đừng biến cuối trang thành một JS animation stack khác.

---

# 22. Reduced motion

Không infinite rotation/ring animation ngay từ đầu, nên gần như không cần xử lý gì.

Nếu bạn thêm breathing animation cho core thì **mình khuyên không thêm**.

Core đứng yên vẫn đủ đẹp.

Nếu có transition:

```css
@media (prefers-reduced-motion: reduce) {
  .resolution-item__toggle i,
  .final-convergence__primary svg {
    transition: none !important;
  }
}
```

---

# 23. Mobile Final Convergence

```css
@media (max-width: 767px) {
  .final-convergence {
    min-height: auto;

    padding-block:
      8rem;
  }

  .convergence-visual {
    width: 145vw;

    opacity: 0.55;
  }

  .final-convergence h2 {
    font-size:
      clamp(2.7rem, 12vw, 4.5rem);
  }

  .final-convergence__actions {
    flex-direction: column;

    align-items: stretch;

    max-width: 22rem;

    margin-inline: auto;

    margin-top: 2.25rem;
  }

  .final-convergence__primary,
  .final-convergence__secondary {
    width: 100%;
  }
}
```

Không horizontal overflow:

```css
.final-convergence {
  overflow: clip;
}
```

---

## Phase 7 acceptance gate

| Gate | Requirement |
|---|---|
| FAQ | Không còn generic accordion styling |
| Semantics | Vẫn native `<details>/<summary>` |
| FAQ copy | Không thay đổi |
| FAQ desktop | Editorial split layout |
| FAQ mobile | Heading không sticky |
| CTA | Không còn rounded green container |
| CTA environment | Full-width convergence scene |
| CTA copy | Không đổi title/subtitle/proof |
| Links | `/auth/sign-up` và `/features` giữ nguyên |
| Convergence visual | CSS/SVG/server-only, không canvas |
| JS | Không client controller mới |
| Motion | Không infinite animation |
| Evidence cleanup | `dt → dd` semantics đúng |
| SEO | Metadata/H1/JSON-LD không đổi |
| Build | lint/test/build pass |