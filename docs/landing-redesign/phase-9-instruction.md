Mình đã verify Phase 8 trên commit:

`648ec7be442ca2d2dacf60a0648874ebfd98f718` — `perf(landing): harden responsive motion and accessibility`

### Kết luận Phase 8

**Source/architecture: PASS. Verification evidence: CHƯA PASS hoàn toàn.**

Các thay đổi code quan trọng đều đúng: `StoryReveal` không còn render content với `opacity: 0`; Hero video chỉ có source ở desktop + `no-preference`; mobile Hero không scrub; reduced-motion reset đúng; `StoryAtmosphere` đã dùng persistent visibility map; Playwright spec cover `/en`, `/vi`, desktop/mobile, overflow, FAQ keyboard, no-JS và reduced-motion. Branch hiện `ahead main = 10`, `behind = 0`.

Nhưng `phase-8-hardening.md` tự ghi rõ rằng `npm ci`, lint, unit test, build, Playwright và Lighthouse **chưa thực thi được** vì file `lightningcss.win32-x64-msvc.node` bị Windows lock. Ngoài ra preview Vercel của chính commit Phase 8 hiện tại vẫn là **BUILDING / pending**, chưa phải READY. Vì vậy mình không thể gọi Phase 8 là fully verified theo hard gate chúng ta đã đặt ra.

Điều này **không ngăn chúng ta bắt đầu Phase 9**, nhưng Phase 9 sẽ là merge-readiness phase và bắt buộc phải đóng hết debt verification này trước khi merge sang `product-release`.

# Phase 9 — Final Polish & Merge Readiness

Phase này tuyệt đối không redesign thêm. Mục tiêu là đưa branch từ “landing đã hoàn thiện về design” thành “branch đủ sạch và đủ evidence để merge”.

1. **Đóng verification debt của Phase 8 trước.** Trên Windows, trước tiên đóng tất cả `npm run dev`, Next.js, Playwright và các Node process đang giữ native module. Sau đó trong `apps/web` xóa dependency tree bị partial và cài lại:

```powershell
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force

Remove-Item node_modules -Recurse -Force
Remove-Item .next -Recurse -Force -ErrorAction SilentlyContinue

npm cache verify
npm ci
```

Nếu Windows vẫn trả `EPERM` trên `lightningcss...node`, reboot máy rồi chạy `npm ci` trước khi mở dev server/editor task.

Sau khi dependency tree sạch:

```bash
npm run lint
npm run test:unit
npm run build
```

Sau khi Phase 9 preview Vercel READY:

```bash
npx playwright test tests/landing-story.spec.ts --project=chromium
```

Tất cả phải PASS.

2. **Biến `StoryReveal` thành Server Component hoàn toàn.** Hiện nó đã không animate nữa nhưng vẫn có `"use client"`, import `motion`, và render `motion.div`. Nghĩa là chúng ta đang hydrate component chỉ để render một wrapper tĩnh.

Đổi thành:

```tsx
import type { ReactNode } from "react";

type StoryRevealProps = {
  children: ReactNode;
  className?: string;
};

export default function StoryReveal({
  children,
  className,
}: StoryRevealProps) {
  return (
    <div
      data-landing-motion="decorative"
      className={className}
    >
      {children}
    </div>
  );
}
```

Sau đó xóa các props chết ở callsites:

```tsx
<StoryReveal delay={0.08} distance={18}>
```

thành:

```tsx
<StoryReveal>
```

Đặc biệt kiểm tra `hero.tsx`, `research-evidence.tsx`, `trust-section.tsx`, `cta.tsx` và bất cứ landing component nào còn truyền `delay`, `distance`, `once`.

Đây là cleanup mình đánh giá rất đáng làm: content tiếp tục SSR/no-JS-safe mà giảm client hydration.

3. **Audit `StoryMotionProvider`.** Sau khi `StoryReveal` không còn là Motion component, tìm toàn branch:

```bash
rg "motion\\.|<motion|MotionConfig" apps/web/components/landing
```

Nếu `MotionConfig` chỉ còn tồn tại trong `story-motion-provider.tsx` và không có Motion element nào cần config đó nữa, hãy bỏ provider khỏi `LandingStoryShell` và xóa `story-motion-provider.tsx`.

Giữ package `motion`, vì chúng ta vẫn dùng:

```ts
useScroll
useMotionValueEvent
useReducedMotion
```

trong Hero/Journey controllers.

Không gỡ dependency `motion`.

4. **Revert dependency drift không liên quan.** Hiện branch đổi:

```json
"@types/react": "^19"
```

thành:

```json
"@types/react": "^19.3.0"
```

Redesign không cần thay đổi này. Đưa nó về:

```json
"@types/react": "^19"
```

rồi chạy `npm install`/`npm ci` phù hợp để `package-lock.json` đồng bộ.

`motion: ^14.0.0` thì giữ lại — đó là dependency có chủ đích.

5. **Cleanup landing CSS nhưng không refactor lớn.** Không nên bây giờ chuyển toàn bộ landing CSS sang file mới vì sẽ tạo diff lớn ngay trước merge. Chỉ xóa dead tokens/selectors và merge các block rõ ràng bị thừa.

Đặc biệt tìm:

```bash
rg "landing-reveal-duration|landing-reveal-distance" apps/web
```

Nếu chỉ còn khai báo:

```css
--landing-reveal-duration
--landing-reveal-distance
```

mà không dùng nữa thì xóa.

Kiểm tra các selector cũ của card layouts Phase 0–6 không còn markup tương ứng. Nhưng chỉ xóa khi xác nhận bằng `rg`, không cleanup theo cảm tính.

6. **Final SEO invariant audit.** Điểm tốt là diff hiện tại **không có** `messages/en.json`, `messages/vi.json`, `public-content.ts`, structured-data hay metadata files. Page vẫn gọi:

```tsx
createLocalizedMetadata(...)
getLandingStructuredData(locale)
<JsonLd ... />
```

và chỉ thêm `LandingStoryShell`.

Trong Phase 9 hãy ghi evidence cụ thể rằng:

```text
/en H1:
An AI study planner for calmer, more measurable learning.

/vi H1:
Ứng dụng học tập AI cho việc học bình tĩnh và có thể đo lường hơn.
```

vẫn xuất hiện server-rendered.

Các anchors phải còn:

```text
#features
#how
#analytics
#evidence
#faq
```

Các internal links phải còn ít nhất:

```text
/auth/sign-up
/features
/research
/privacy
```

Và `JsonLd` vẫn nằm ngoài/bên cạnh story presentation logic, không bị client hóa.

7. **Final responsive audit thực tế.** Sau khi preview READY, kiểm tra cả `/en` và `/vi` trên `390×844`, `430×932`, `768×1024`, `1024×768`, `1280×800`, `1440×900`, `1920×1080`.

Ở Phase 9 không sửa aesthetic trừ khi có bug. Chỉ sửa các lỗi như text overflow, horizontal scrollbar, sticky che navbar, Vietnamese wrapping xấu, screenshot bị clip sai, focus outline mất hoặc CTA bị quá cao/thấp.

Đặc biệt kiểm tra thêm cả light và dark theme ở ít nhất mobile 390 và desktop 1440.

8. **Đo lại performance và hoàn tất report Phase 8.** Không tạo baseline mới rồi quên baseline cũ. Cập nhật `phase-8-hardening.md` bằng kết quả thực tế.

Chạy 3 lần mỗi case và lấy median:

| Route | Hard gate |
|---|---|
| `/en` mobile | Perf ≥ 90, LCP ≤ 3.5s, CLS ≤ .05 |
| `/en` desktop | Perf ≥ 87, LCP ≤ 1.7s, CLS ≤ .05 |
| `/vi` mobile | Không thấp hơn Perf 74 / LCP 4.9s |
| `/vi` desktop | Perf ≥ 93, LCP ≤ 1.1s |
| tất cả | TBT ≤ 250ms |

Nếu `/vi` mobile tốt hơn baseline thì càng tốt, nhưng hard rule ở Phase 9 là **không regression**.

Hero mobile hiện không chọn MP4 nữa nên đây là metric mình kỳ vọng cải thiện rõ nhất.

9. **Tạo final merge report.** Tạo:

```text
docs/landing-redesign/phase-9-merge-readiness.md
```

Nên có:

```md
# Landing Redesign — Merge Readiness

Base:
main <SHA>

Candidate:
redesign/landing-storytelling-page <SHA>

## Quality gates
- npm ci: PASS
- lint: PASS
- unit: PASS
- build: PASS
- landing Playwright: PASS
- Vercel: READY

## Performance
<Phase 0 vs final>

## Accessibility
- No-JS critical content: PASS
- Reduced motion: PASS
- FAQ keyboard: PASS
- Horizontal overflow EN/VI: PASS

## SEO invariants
- EN H1: PASS
- VI H1: PASS
- metadata unchanged: PASS
- JSON-LD unchanged: PASS
- internal links: PASS

## Responsive audit
<viewport matrix>

## Merge decision
READY / BLOCKED

Acceptance gate cuối cùng:

| Area | Phase 9 phải đạt |
|---|---|
| Branch | `behind main = 0` |
| Vercel | READY |
| Install | `npm ci` PASS |
| Lint | PASS |
| Unit | PASS |
| Build | PASS |
| Landing Playwright | PASS |
| No-JS | PASS |
| Reduced motion | PASS |
| EN/VI overflow | PASS |
| Performance | Không regression quá guardrail |
| SEO metadata | Unchanged |
| H1 ownership | Unchanged |
| JSON-LD | Unchanged |
| Client cleanup | StoryReveal không hydrate vô ích |
| Package drift | `@types/react` cleanup |
| Final report | Có merge decision rõ ràng |