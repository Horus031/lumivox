export const landingSceneIds = [
  "hero",
  "principles",
  "intelligence",
  "workflow",
  "product",
  "evidence",
  "trust",
  "resolution",
  "convergence",
] as const;

export type LandingSceneId = (typeof landingSceneIds)[number];

export const initialLandingScene: LandingSceneId = "hero";