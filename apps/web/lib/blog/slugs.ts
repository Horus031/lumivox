export const blogSlugs = {
  "adaptive-study-plan": {
    en: "how-to-build-a-study-plan",
    vi: "cach-lap-ke-hoach-hoc-tap",
  },
  "study-focus": {
    en: "how-to-focus-while-studying",
    vi: "cach-tap-trung-khi-hoc",
  },
  "study-analytics": {
    en: "study-analytics-learning-patterns",
    vi: "phan-tich-thoi-quen-hoc-tap",
  },
} as const;

export function getLocalizedBlogPath(pathname: string, locale: "en" | "vi") {
  const pair = Object.values(blogSlugs).find(({ en, vi }) =>
    pathname === `/blog/${en}` || pathname === `/blog/${vi}`,
  );

  return pair ? `/blog/${pair[locale]}` : undefined;
}

