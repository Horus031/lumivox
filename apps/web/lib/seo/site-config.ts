const productionUrl = "https://www.lumivox.it.com";

export const siteConfig = {
  name: "Lumivox",

  url: (process.env.SITE_URL ?? productionUrl).replace(/\/+$/, ""),

  defaultTitle: "Lumivox – AI Study Planner for Students",

  defaultDescription:
    "Lumivox is an AI study planner for students that combines task planning, focus sessions, behavioral analytics, and personalized AI-assisted recommendations in one workspace.",
} as const;

export const isSearchIndexingEnabled =
  process.env.SEO_INDEXING_ENABLED === "true";