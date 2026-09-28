import { ArrowUpRight } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";

import { Link } from "@/i18n/navigation";
import { getBlogPosts } from "@/lib/blog/posts";
import { isMarketingLocale } from "@/lib/marketing/locale";
import { createLocalizedMetadata } from "@/lib/seo/localized-metadata";

type PageProps = { params: Promise<{ locale: string }> };

const copy = {
  en: {
    eyebrow: "Learning notes",
    title: "Practical guides for planning, focus, and study behavior",
    description:
      "Evidence-aware guides for building realistic study plans, creating repeatable focus routines, and learning from your own behavioral patterns.",
    metadataTitle: "Study Planning & Focus Guides",
    metadataDescription:
      "Practical Lumivox guides on study planning, focus sessions, behavioral analytics, and building more measurable study habits.",
    read: "Read guide",
    clusters: {
      planning: "Planning",
      focus: "Focus",
      behavior: "Behavior",
    },
  },
  vi: {
    eyebrow: "Ghi chú học tập",
    title: "Hướng dẫn thực tế về lập kế hoạch, tập trung và hành vi học",
    description:
      "Các hướng dẫn có cân nhắc bằng chứng để xây dựng kế hoạch thực tế, duy trì nhịp tập trung và học từ mô thức hành vi của chính bạn.",
    metadataTitle: "Hướng dẫn lập kế hoạch & tập trung học",
    metadataDescription:
      "Hướng dẫn thực tế từ Lumivox về lập kế hoạch học tập, phiên tập trung, phân tích hành vi và xây dựng thói quen có thể đo lường hơn.",
    read: "Đọc hướng dẫn",
    clusters: {
      planning: "Lập kế hoạch",
      focus: "Tập trung",
      behavior: "Hành vi",
    },
  },
} as const;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isMarketingLocale(locale)) notFound();
  const t = copy[locale];

  return createLocalizedMetadata({
    locale,
    pathname: "/blog",
    title: t.metadataTitle,
    description: t.metadataDescription,
  });
}

export default async function BlogIndexPage({ params }: PageProps) {
  const { locale } = await params;
  if (!isMarketingLocale(locale)) notFound();
  const t = copy[locale];
  const posts = getBlogPosts(locale);

  return (
    <div className="mx-auto max-w-310 px-6 pb-24 pt-32 md:pb-32 md:pt-40">
      <header className="max-w-3xl border-b border-border pb-12">
        <p className="text-[12px] font-semibold uppercase text-primary">
          {t.eyebrow}
        </p>
        <h1 className="mt-4 text-[42px] font-semibold leading-[1.08] tracking-tight md:text-[58px]">
          {t.title}
        </h1>
        <p className="mt-5 max-w-2xl text-[16px] leading-7 text-secondary">
          {t.description}
        </p>
      </header>

      <div className="mt-12 grid gap-6 lg:grid-cols-3">
        {posts.map((post) => (
          <article
            key={post.id}
            className="overflow-hidden rounded-lg border border-border bg-surface"
          >
            <div className="relative aspect-[16/9] overflow-hidden border-b border-border">
              <Image
                src={post.image}
                alt={post.imageAlt}
                fill
                sizes="(min-width: 1024px) 33vw, 100vw"
                className="object-cover"
              />
            </div>
            <div className="p-6">
              <p className="text-[11px] font-semibold uppercase text-primary">
                {t.clusters[post.cluster]}
              </p>
              <h2 className="mt-3 text-[21px] font-semibold leading-7">
                <Link href={`/blog/${post.slug}`} className="hover:text-primary">
                  {post.title}
                </Link>
              </h2>
              <p className="mt-3 text-[14px] leading-6 text-secondary">
                {post.excerpt}
              </p>
              <Link
                href={`/blog/${post.slug}`}
                className="mt-6 inline-flex items-center gap-1.5 text-[13px] font-medium text-primary"
              >
                {t.read} <ArrowUpRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
