const productionUrl = "https://www.lumivox.it.com";

export const siteConfig = {
  name: "Lumivox",

  url: (process.env.SITE_URL ?? productionUrl).replace(/\/+$/, ""),

  defaultTitle: "Lumivox – AI Study Planner & Focus Analytics",

  defaultDescription:
    "Lumivox is an AI-powered study and productivity platform that helps students plan tasks, improve focus, understand learning habits, and receive personalized recommendations.",
} as const;

export const isSearchIndexingEnabled =
  process.env.SEO_INDEXING_ENABLED === "true";