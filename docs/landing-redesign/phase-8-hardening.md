# Phase 8 - Responsive / Performance / A11y Hardening

## Baseline

Phase 8 keeps Phase 0 as the historical comparison point.

| Route | Device | Perf | LCP | CLS | TBT |
|---|---:|---:|---:|---:|---:|
| `/en` | Mobile | 95 | 3.0s | 0 | 50ms |
| `/en` | Desktop | 92 | 1.2s | 0 | 190ms |
| `/vi` | Mobile | 74 | 4.9s | 0 | 170ms |
| `/vi` | Desktop | 98 | 0.6s | 0.001 | 140ms |

## Hardening Applied

- `StoryReveal` now renders readable SSR/no-JS content by using `initial={false}` and removing the pre-hydration opacity/translate state.
- Hero video now uses a media-scoped `<source>` and `preload="metadata"`, so mobile and reduced-motion contexts keep the static poster instead of selecting the MP4.
- `HeroMotionController` now disables scroll scrub below `768px`, resets hero CSS variables for mobile/reduced-motion, and scopes the reduced-motion video lookup to the hero root.
- `StoryAtmosphere` now tracks a persistent visibility map across observer callbacks, matching the deterministic section-selection pattern used by the other landing controllers.
- Mobile GPU cost is reduced by lowering atmosphere orb blur, removing permanent orb `will-change`, tightening grid density, and lowering large aura/halo blur.
- Added `apps/web/tests/landing-story.spec.ts` to cover `/en` and `/vi` desktop/mobile visibility and overflow, native FAQ keyboard behavior, no-JS critical content visibility, and reduced-motion video source behavior.

## Performance Runs

Lighthouse reruns are not recorded yet because the local dependency install is blocked by a locked native file:

```text
npm ci
EPERM: operation not permitted, unlink
D:\lumivox-proj\apps\web\node_modules\lightningcss-win32-x64-msvc\lightningcss.win32-x64-msvc.node
```

The same `EPERM` occurred both inside the managed sandbox and when rerun outside the sandbox. A repair attempt with `npm install --no-package-lock --ignore-scripts` also failed after the partial install, so the local CLI entrypoints for lint/build/test are unavailable until the lock is released and `npm ci` can complete.

| Route | Device | Run 1 | Run 2 | Run 3 | Median |
|---|---:|---:|---:|---:|---:|
| `/en` | Mobile | blocked | blocked | blocked | blocked |
| `/en` | Desktop | blocked | blocked | blocked | blocked |
| `/vi` | Mobile | blocked | blocked | blocked | blocked |
| `/vi` | Desktop | blocked | blocked | blocked | blocked |

## Verification Status

| Command | Status |
|---|---|
| `npm ci` | Blocked by `EPERM` on `lightningcss.win32-x64-msvc.node` |
| `npm run lint` | Blocked because partial `npm ci` removed `.bin` entrypoints |
| `npm run test:unit` | Not run because dependency install is incomplete |
| `npm run build` | Not run because dependency install is incomplete |
| `npx playwright test tests/landing-story.spec.ts --project=chromium` | Not run because dependency install is incomplete |

## Pending Manual Audit

Run the viewport matrix after the dependency lock is released and the app can build or serve locally:

| Viewport | Routes |
|---|---|
| `390x844` | `/en`, `/vi` |
| `430x932` | `/en`, `/vi` |
| `768x1024` | `/en`, `/vi` |
| `1024x768` | `/en`, `/vi` |
| `1280x800` | `/en`, `/vi` |
| `1440x900` | `/en`, `/vi` |
| `1920x1080` | `/en`, `/vi` |

Audit focus: Hero H1/signals, Intelligence nodes, Journey mobile visuals, Product Theater copy over screenshots, Evidence mobile layout, Trust pipeline, FAQ Vietnamese wrapping, Convergence, and horizontal overflow.
