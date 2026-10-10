Mình đã verify Phase 7 trên commit:

`2a4b8e93fbc3b658d725b77f524deac2ea32ecf6` — `feat(landing): build quiet resolution and final convergence`

**Phase 7: PASS hoàn toàn.** Branch hiện `ahead main = 9`, `behind = 0`. Vercel preview của đúng commit này đã chuyển sang **READY**, GitHub Vercel status là **success**.

Về code, tất cả acceptance gates quan trọng đều đạt: FAQ vẫn là native `<details>/<summary>` và không còn generic accordion cards; CTA đã bỏ rounded green panel để thành full-width convergence environment; `ConvergenceVisual` là Server Component thuần CSS; không thêm client controller mới; `/auth/sign-up`, `/features`, FAQ copy và CTA copy vẫn nguyên; và cleanup semantic của Evidence đã đúng `dt → dd`.

Có một phát hiện quan trọng cho Phase 8: `StoryReveal` hiện vẫn SSR ra `opacity: 0` + translate, nên HTML có content nhưng **nếu JavaScript không chạy thì những nội dung được wrap bởi `StoryReveal` sẽ không nhìn thấy**. Đây sẽ là ưu tiên số một của hardening.

# Phase 8 — Responsive / Performance / A11y Hardening

Phase này **không thêm visual effect mới**. Mục tiêu là chứng minh landing hiện tại đẹp nhưng vẫn production-safe trên EN/VI, mobile/desktop, reduced-motion và no-JS.

Baseline chính thức để so sánh vẫn là Phase 0:

| Route | Device | Perf | LCP | CLS | TBT |
|---|---|---:|---:|---:|---:|
| `/en` | Mobile | 95 | 3.0s | 0 | 50ms |
| `/en` | Desktop | 92 | 1.2s | 0 | 190ms |
| `/vi` | Mobile | 74 | 4.9s | 0 | 170ms |
| `/vi` | Desktop | 98 | 0.6s | 0.001 | 140ms |

Đặc biệt `/vi` mobile vẫn là route cần bảo vệ nhất.

1. **Fix `StoryReveal` để no-JS luôn readable.** Hiện tại `initial={{ opacity: 0, y: distance }}` là rủi ro lớn nhất. Trong hardening phase, mình khuyến nghị ưu tiên robustness hơn generic fade-up: đổi `StoryReveal` thành `initial={false}` và bỏ trạng thái visually-hidden trước hydration. Nếu muốn giữ component để không phải sửa imports hàng loạt:

```tsx
export default function StoryReveal({
  children,
  className,
}: StoryRevealProps) {
  return (
    <motion.div
      data-landing-motion="decorative"
      className={className}
      initial={false}
    >
      {children}
    </motion.div>
  );
}
```

Điều này sẽ bỏ generic reveal animation, nhưng Hero/Journey/Intelligence/Product/Atmosphere vẫn còn rất nhiều motion meaningful. Mình đánh giá trade-off này đáng giá. Đặc biệt H1, research evidence, trust và final CTA không nên phụ thuộc hydration để visible. Next.js pre-rendering cũng được thiết kế để HTML có thể hiển thị hữu ích trước JavaScript/hydration. [Next.js](https://nextjs.org/learn/pages-router/data-fetching-pre-rendering?utm_source=chatgpt.com)

Nếu bạn không muốn bỏ toàn bộ reveal, tối thiểu phải tháo `StoryReveal` khỏi mọi wrapper chứa `h1/h2/h3`, paragraph quan trọng, metrics hoặc CTA links. Nhưng mình nghiêng về giải pháp global ở trên vì đơn giản và ít bug hơn.

2. **Ngăn mobile tải Hero video.** Hiện Hero vẫn có:

```tsx
<video
  src="/hero-brain-loop.mp4"
  poster="/landing-hero.webp"
  autoPlay
  ...
  preload="auto"
/>
```

Đây là ứng viên rõ ràng nhất gây áp lực lên `/vi` mobile. Thay `src` trực tiếp bằng `<source media>`:

```tsx
<video
  data-hero-video
  poster="/landing-hero.webp"
  autoPlay
  loop
  muted
  playsInline
  preload="metadata"
  className="landing-hero__video absolute inset-0 size-full object-cover"
>
  <source
    src="/hero-brain-loop.mp4"
    type="video/mp4"
    media="(min-width: 768px) and (prefers-reduced-motion: no-preference)"
  />
</video>
```

Kết quả mong muốn là desktop vẫn cinematic, còn mobile và reduced-motion dùng poster tĩnh, không tải MP4 không cần thiết. Đây là tối ưu mình muốn làm **trước khi đo Lighthouse**, vì nếu không Phase 8 chỉ đang đo một bottleneck đã biết.

3. **Disable Hero scroll scrub trên mobile.** `HeroMotionController` hiện vẫn nhận scroll events từ Motion và ghi bảy CSS variables mỗi change. Desktop chấp nhận được; mobile không đáng.

Tạo helper reset:

```tsx
function resetHeroMotion(root: HTMLElement) {
  root.style.setProperty("--hero-content-y", "0px");
  root.style.setProperty("--hero-content-opacity", "1");
  root.style.setProperty("--hero-video-scale", "1.03");
  root.style.setProperty("--hero-video-y", "0px");
  root.style.setProperty("--hero-signals-opacity", "1");
  root.style.setProperty("--hero-signals-y", "0px");
  root.style.setProperty("--hero-filament-opacity", "1");
}
```

Trong controller giữ một ref:

```tsx
const allowScrubRef = useRef(true);

useEffect(() => {
  const media = window.matchMedia("(min-width: 768px)");

  const sync = () => {
    allowScrubRef.current = media.matches;

    const root = targetRef.current?.parentElement;

    if (root && !media.matches) {
      resetHeroMotion(root);
    }
  };

  sync();

  media.addEventListener("change", sync);

  return () => {
    media.removeEventListener("change", sync);
  };
}, []);
```

Sau đó:

```tsx
useMotionValueEvent(scrollYProgress, "change", (value) => {
  if (reduceMotion || !allowScrubRef.current) return;

  ...
});
```

Đồng thời scope video query vào Hero root thay vì:

```tsx
document.querySelector(...)
```

dùng:

```tsx
root.querySelector<HTMLVideoElement>("[data-hero-video]")
```

4. **Harden `StoryAtmosphere` observer.** Đây là technical debt mình đã nhắc từ Phase 1. Nó vẫn chỉ sort `entries` của callback hiện tại, không phải toàn bộ sections đang visible. Journey/Product/Intelligence đã dùng persistent visibility map đúng cách; hãy đưa Atmosphere về cùng pattern:

```tsx
const visible = new Map<Element, number>();

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
      .sort(
        (a, b) =>
          b[1] - a[1] ||
          sections.indexOf(a[0] as HTMLElement) -
            sections.indexOf(b[0] as HTMLElement),
      )[0]?.[0] as HTMLElement | undefined;

    const scene = active?.dataset.landingScene;

    if (!isLandingScene(scene)) return;

    setActiveScene((current) => {
      if (current === scene) return current;

      window.dispatchEvent(
        new CustomEvent("landing:scene-change", {
          detail: { scene },
        }),
      );

      return scene;
    });
  },
  {
    rootMargin: "-20% 0px -35% 0px",
    threshold: [0.1, 0.25, 0.5, 0.75],
  },
);
```

Như vậy atmosphere không flicker khi hai long sections overlap viewport.

5. **Giảm GPU cost trên mobile.** Hai fixed atmosphere orbs hiện có `blur(110px)` và permanent `will-change`. Thêm mobile override:

```css
@media (max-width: 767px) {
  .story-atmosphere__orb {
    filter: blur(56px);
    will-change: auto;
  }

  .story-atmosphere__grid {
    background-size: 56px 56px;
  }

  .product-stage__aura,
  .convergence-visual__halo {
    filter: blur(28px);
  }
}
```

Không cần bỏ atmosphere. Chỉ giảm cost ở viewport yếu hơn.

Với desktop có thể giữ `will-change`; mobile thì không nên giữ compositing hint vĩnh viễn cho các layer lớn.

6. **Thêm E2E regression riêng cho landing.** Repo đã có Playwright và hỗ trợ `PLAYWRIGHT_BASE_URL`, nên tạo:

```text
apps/web/tests/landing-story.spec.ts
```

Test tối thiểu nên cover EN + VI, desktop + mobile, no-JS và reduced-motion. Skeleton:

```tsx
import { expect, test } from "@playwright/test";

const routes = ["/en", "/vi"] as const;

for (const route of routes) {
  test(`${route} landing desktop`, async ({ page }) => {
    await page.setViewportSize({
      width: 1440,
      height: 900,
    });

    await page.goto(route);

    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator("#features")).toBeVisible();
    await expect(page.locator("#how")).toBeVisible();
    await expect(page.locator("#analytics")).toBeVisible();
    await expect(page.locator("#evidence")).toBeVisible();
    await expect(page.locator("#faq")).toBeVisible();

    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );

    expect(overflow).toBeLessThanOrEqual(1);
  });

  test(`${route} landing mobile`, async ({ page }) => {
    await page.setViewportSize({
      width: 390,
      height: 844,
    });

    await page.goto(route);

    await expect(page.locator("h1")).toBeVisible();

    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );

    expect(overflow).toBeLessThanOrEqual(1);
  });
}
```

Thêm test FAQ keyboard:

```tsx
test("FAQ works with keyboard", async ({ page }) => {
  await page.goto("/en");

  const summary = page.locator("#faq summary").first();

  await summary.focus();
  await page.keyboard.press("Enter");

  await expect(
    page.locator("#faq details").first(),
  ).toHaveAttribute("open", "");
});
```

No-JS test là gate quan trọng nhất:

```tsx
test("critical landing content remains visible without JS", async ({
  browser,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: {
      width: 1280,
      height: 900,
    },
  });

  const page = await context.newPage();

  await page.goto("/en");

  await expect(page.locator("h1")).toBeVisible();
  await expect(page.locator("#features h2")).toBeVisible();
  await expect(page.locator("#evidence h2")).toBeVisible();
  await expect(
    page.locator("[data-landing-scene='convergence'] h2"),
  ).toBeVisible();

  await context.close();
});
```

Và reduced motion:

```tsx
test("reduced motion keeps landing readable", async ({ page }) => {
  await page.emulateMedia({
    reducedMotion: "reduce",
  });

  await page.goto("/en");

  await expect(page.locator("h1")).toBeVisible();

  const video = page.locator("[data-hero-video]");

  const currentSrc = await video.evaluate(
    (element: HTMLVideoElement) => element.currentSrc,
  );

  expect(currentSrc).toBe("");
});
```

7. **Audit viewport matrix trước Lighthouse.** Test thủ công ít nhất ở `390×844`, `430×932`, `768×1024`, `1024×768`, `1280×800`, `1440×900` và một viewport rộng khoảng `1920×1080`, cho cả `/en` lẫn `/vi`. Kiểm tra Hero H1 không đè signals, Intelligence nodes không clip, Journey mobile visuals không overflow, Product Theater text không che phần quan trọng của screenshot, Evidence 2×2 mobile không va nhau, Trust horizontal pipeline không tràn, FAQ long Vietnamese text wrap đúng và Convergence không tạo horizontal scrollbar.

8. **Đo lại performance bằng cùng phương pháp Phase 0 và ghi thành Phase 8 report.** Chạy mỗi route/device ba lần và dùng median để giảm noise. Hard gate mình đề xuất như sau:

| Route | Hard gate Phase 8 | Target tốt |
|---|---|---|
| `/en` Mobile | Perf ≥ 90, LCP ≤ 3.5s, CLS ≤ .05 | Perf ≥ 95, LCP ≤ 3.0s |
| `/en` Desktop | Perf ≥ 87, LCP ≤ 1.7s, CLS ≤ .05 | giữ/gần baseline |
| `/vi` Mobile | không tệ hơn 74 / 4.9s | Perf ≥ 80, LCP ≤ 4.0s |
| `/vi` Desktop | Perf ≥ 93, LCP ≤ 1.1s | giữ gần 98 / 0.6s |

Với TBT, mình muốn **≤250ms ở tất cả bốn case**, tốt hơn nếu mobile vẫn dưới ~200ms.

Tạo:

```text
docs/landing-redesign/phase-8-hardening.md
```

và ghi cả baseline + kết quả ba runs + median + các optimization đã áp dụng. Đừng overwrite Phase 0 baseline; Phase 0 phải được giữ làm historical comparison.

Cuối cùng chạy đầy đủ:

```bash
cd apps/web

npm ci
npm run lint
npm run test:unit
npm run build

PLAYWRIGHT_BASE_URL=<preview-url> \
npx playwright test tests/landing-story.spec.ts --project=chromium
```