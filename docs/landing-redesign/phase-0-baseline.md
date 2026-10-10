# Landing Storytelling Redesign — Phase 0 Baseline

Date: 7 October 2026
Base commit: e635c68efcdbaee60e25f25d4c609ae6d18d07c0
Branch: redesign/landing-storytelling-page

## Quality gates

- npm run lint: PASS
- npm run test:unit: PASS
- npm run build: PASS

## Production baseline

| Route | Device | Performance | LCP | CLS | TBT | FCP |
|---|---|---:|---:|---:|---:|---:|
| /en | Mobile | 95 | 3.0s | 0 | 50ms | 1.1s |
| /en | Desktop | 92 | 1.2s | 0 | 190ms | 0.3s |
| /vi | Mobile | 74 | 4.9s | 0 | 170ms | 3.0s |
| /vi | Desktop | 98 | 0.6s | 0.001 | 140ms | 0.3s |

## SEO invariants

- Home remains the owner of "AI study planner" / "ứng dụng học tập AI".
- Existing localized H1 intent is preserved.
- Existing metadata remains unchanged.
- Existing JSON-LD remains unchanged.
- Existing internal links remain available.
- No content is hidden from crawlers behind animation.