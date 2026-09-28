import type { MDXModule } from "mdx/types";

import { blogSlugs } from "./slugs";

export type BlogLocale = "en" | "vi";
export type BlogCluster = "planning" | "focus" | "behavior";

export type BlogPost = {
  id: "adaptive-study-plan" | "study-focus" | "study-analytics";
  locale: BlogLocale;
  slug: string;
  title: string;
  description: string;
  excerpt: string;
  cluster: BlogCluster;
  publishedAt: string;
  modifiedAt: string;
  image: string;
  imageAlt: string;
  load: () => Promise<MDXModule>;
};

export const blogPosts: readonly BlogPost[] = [
  {
    id: "adaptive-study-plan",
    locale: "en",
    slug: blogSlugs["adaptive-study-plan"].en,
    title: "How to Build a Study Plan That Adapts to Real Life",
    description:
      "Build a realistic study plan around deadlines, available time, priorities, and what your past study behavior tells you.",
    excerpt:
      "A practical framework for turning goals and deadlines into a study plan that can survive a real week.",
    cluster: "planning",
    publishedAt: "2026-09-28T08:00:00+07:00",
    modifiedAt: "2026-09-28T08:00:00+07:00",
    image: "/blog/adaptive-study-plan.jpg",
    imageAlt:
      "A flexible weekly study plan arranged around tasks, deadlines, and open buffer time",
    load: () => import("@/content/blog/adaptive-study-plan/en.mdx"),
  },
  {
    id: "adaptive-study-plan",
    locale: "vi",
    slug: blogSlugs["adaptive-study-plan"].vi,
    title: "Cách lập kế hoạch học tập linh hoạt và bám sát thực tế",
    description:
      "Xây dựng kế hoạch học tập thực tế dựa trên deadline, thời gian sẵn có, mức ưu tiên và dữ liệu từ chính thói quen học của bạn.",
    excerpt:
      "Một quy trình thực tế để biến mục tiêu và deadline thành kế hoạch có thể thích nghi với một tuần thật sự.",
    cluster: "planning",
    publishedAt: "2026-09-28T08:00:00+07:00",
    modifiedAt: "2026-09-28T08:00:00+07:00",
    image: "/blog/adaptive-study-plan.jpg",
    imageAlt:
      "Kế hoạch học tập tuần linh hoạt được sắp xếp theo nhiệm vụ, deadline và thời gian dự phòng",
    load: () => import("@/content/blog/adaptive-study-plan/vi.mdx"),
  },
  {
    id: "study-focus",
    locale: "en",
    slug: blogSlugs["study-focus"].en,
    title: "How to Focus While Studying Without Relying on Willpower",
    description:
      "Build a repeatable study-focus system with clear next actions, intentional session lengths, useful breaks, and distraction records.",
    excerpt:
      "Treat focus as a system you can shape, observe, and improve instead of a mood you must wait for.",
    cluster: "focus",
    publishedAt: "2026-09-28T08:00:00+07:00",
    modifiedAt: "2026-09-28T08:00:00+07:00",
    image: "/blog/study-focus.jpg",
    imageAlt:
      "A focused study desk with a timer, one open notebook, and distractions placed out of reach",
    load: () => import("@/content/blog/study-focus/en.mdx"),
  },
  {
    id: "study-focus",
    locale: "vi",
    slug: blogSlugs["study-focus"].vi,
    title: "Cách tập trung học mà không phụ thuộc vào ý chí",
    description:
      "Xây dựng hệ thống tập trung có thể lặp lại bằng hành động rõ ràng, phiên học có chủ đích, thời gian nghỉ thật và bản ghi xao nhãng.",
    excerpt:
      "Xem tập trung như một hệ thống có thể điều chỉnh và quan sát, thay vì cảm hứng phải chờ đợi.",
    cluster: "focus",
    publishedAt: "2026-09-28T08:00:00+07:00",
    modifiedAt: "2026-09-28T08:00:00+07:00",
    image: "/blog/study-focus.jpg",
    imageAlt:
      "Góc học tập tập trung với bộ đếm giờ, một cuốn sổ mở và thiết bị gây xao nhãng đặt xa",
    load: () => import("@/content/blog/study-focus/vi.mdx"),
  },
  {
    id: "study-analytics",
    locale: "en",
    slug: blogSlugs["study-analytics"].en,
    title: "Study Analytics: How to Learn From Your Own Study Patterns",
    description:
      "Understand useful study analytics, separate behavior from learning outcomes, and turn patterns into small experiments for your next week.",
    excerpt:
      "Learn what focus time, completion, deadlines, distractions, consistency, and reflection can actually tell you.",
    cluster: "behavior",
    publishedAt: "2026-09-28T08:00:00+07:00",
    modifiedAt: "2026-09-28T08:00:00+07:00",
    image: "/blog/study-analytics.jpg",
    imageAlt:
      "Study behavior charts comparing focus time, completed tasks, distractions, and weekly consistency",
    load: () => import("@/content/blog/study-analytics/en.mdx"),
  },
  {
    id: "study-analytics",
    locale: "vi",
    slug: blogSlugs["study-analytics"].vi,
    title:
      "Phân tích thói quen học tập: cách đọc mô thức học của chính bạn",
    description:
      "Hiểu dữ liệu học tập hữu ích, phân biệt hành vi với kết quả và biến mô thức quan sát được thành thử nghiệm nhỏ cho tuần tiếp theo.",
    excerpt:
      "Hiểu đúng điều thời gian tập trung, mức hoàn thành, deadline, xao nhãng, độ đều đặn và phản tư có thể cho bạn biết.",
    cluster: "behavior",
    publishedAt: "2026-09-28T08:00:00+07:00",
    modifiedAt: "2026-09-28T08:00:00+07:00",
    image: "/blog/study-analytics.jpg",
    imageAlt:
      "Biểu đồ hành vi học tập so sánh thời gian tập trung, nhiệm vụ hoàn thành, xao nhãng và độ đều đặn theo tuần",
    load: () => import("@/content/blog/study-analytics/vi.mdx"),
  },
];

export function getBlogPosts(locale: BlogLocale) {
  return blogPosts.filter((post) => post.locale === locale);
}

export function getBlogPost(locale: BlogLocale, slug: string) {
  return blogPosts.find(
    (post) => post.locale === locale && post.slug === slug,
  );
}

export function getBlogPostBySlug(slug: string) {
  return blogPosts.find((post) => post.slug === slug);
}

export function getBlogTranslation(post: BlogPost, locale: BlogLocale) {
  return blogPosts.find(
    (candidate) => candidate.id === post.id && candidate.locale === locale,
  );
}

export function getBlogLanguagePaths(post: BlogPost) {
  const english = getBlogTranslation(post, "en");
  const vietnamese = getBlogTranslation(post, "vi");

  if (!english || !vietnamese) {
    throw new Error(`Missing localized blog pair for ${post.id}`);
  }

  return {
    en: `/en/blog/${english.slug}`,
    vi: `/vi/blog/${vietnamese.slug}`,
  };
}
