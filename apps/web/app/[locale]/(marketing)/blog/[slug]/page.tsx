import type { Metadata } from "next";
import Image from "next/image";
import { notFound, permanentRedirect } from "next/navigation";

import { JsonLd } from "@/components/seo/json-ld";
import { Link } from "@/i18n/navigation";
import {
  blogPosts,
  getBlogLanguagePaths,
  getBlogPost,
  getBlogPostBySlug,
  getBlogTranslation,
} from "@/lib/blog/posts";
import { isMarketingLocale } from "@/lib/marketing/locale";
import { createArticleStructuredData } from "@/lib/seo/article-structured-data";
import { createLocalizedMetadata } from "@/lib/seo/localized-metadata";

type PageProps = { params: Promise<{ locale: string; slug: string }> };

const copy = {
  en: {
    home: "Home",
    blog: "Blog",
    by: "By",
    published: "Published",
    updated: "Updated",
    editorialTitle: "Editorial note",
    editorialText:
      "This article was prepared by the Lumivox project team. AI-assisted drafting may be used, with factual claims and project-specific details reviewed before publication.",
  },
  vi: {
    home: "Trang chủ",
    blog: "Blog",
    by: "Bởi",
    published: "Đăng ngày",
    updated: "Cập nhật",
    editorialTitle: "Ghi chú biên tập",
    editorialText:
      "Bài viết được chuẩn bị bởi nhóm dự án Lumivox. Quá trình soạn thảo có thể dùng AI hỗ trợ; các dữ kiện và chi tiết riêng của dự án được rà soát trước khi xuất bản.",
  },
} as const;

export function generateStaticParams() {
  return blogPosts.map((post) => ({
    locale: post.locale,
    slug: post.slug,
  }));
}

function resolvePost(locale: "en" | "vi", slug: string) {
  const exactPost = getBlogPost(locale, slug);
  if (exactPost) return exactPost;

  const sourcePost = getBlogPostBySlug(slug);
  const translation = sourcePost
    ? getBlogTranslation(sourcePost, locale)
    : undefined;

  if (translation) {
    permanentRedirect(`/${locale}/blog/${translation.slug}`);
  }

  notFound();
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isMarketingLocale(locale)) notFound();
  const post = resolvePost(locale, slug);

  return createLocalizedMetadata({
    locale,
    pathname: `/blog/${post.slug}`,
    title: post.title,
    description: post.description,
    languagePaths: getBlogLanguagePaths(post),
    image: post.image,
    imageAlt: post.imageAlt,
    article: {
      publishedTime: post.publishedAt,
      modifiedTime: post.modifiedAt,
      authors: ["Lumivox"],
    },
  });
}

function formatDate(value: string, locale: "en" | "vi") {
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "vi-VN", {
    dateStyle: "medium",
    timeZone: "Asia/Bangkok",
  }).format(new Date(value));
}

export default async function BlogPostPage({ params }: PageProps) {
  const { locale, slug } = await params;
  if (!isMarketingLocale(locale)) notFound();
  const post = resolvePost(locale, slug);
  const t = copy[locale];
  const Content = (await post.load()).default;

  return (
    <>
      <JsonLd data={createArticleStructuredData(post)} />
      <article className="mx-auto max-w-310 px-6 pb-24 pt-28 md:pb-32 md:pt-36">
        <div className="mx-auto max-w-4xl">
          <nav aria-label="Breadcrumb" className="text-[12px] text-secondary">
            <ol className="flex flex-wrap items-center gap-2">
              <li><Link href="/" className="hover:text-foreground">{t.home}</Link></li>
              <li aria-hidden="true">/</li>
              <li><Link href="/blog" className="hover:text-foreground">{t.blog}</Link></li>
              <li aria-hidden="true">/</li>
              <li className="truncate text-foreground" aria-current="page">{post.title}</li>
            </ol>
          </nav>

          <header className="mt-8">
            <h1 className="text-[40px] font-semibold leading-[1.1] tracking-tight md:text-[58px]">
              {post.title}
            </h1>
            <p className="mt-5 max-w-3xl text-[17px] leading-8 text-secondary">
              {post.description}
            </p>
            <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-secondary">
              <span>
                {t.by}{" "}
                <Link href="/about" className="font-medium text-foreground underline underline-offset-4">
                  Lumivox
                </Link>
              </span>
              <span>{t.published} <time dateTime={post.publishedAt}>{formatDate(post.publishedAt, locale)}</time></span>
              <span>{t.updated} <time dateTime={post.modifiedAt}>{formatDate(post.modifiedAt, locale)}</time></span>
            </div>
          </header>

          <div className="relative mt-10 aspect-[16/9] overflow-hidden rounded-lg border border-border bg-surface">
            <Image
              src={post.image}
              alt={post.imageAlt}
              fill
              priority
              sizes="(min-width: 1024px) 896px, 100vw"
              className="object-cover"
            />
          </div>

          <div className="mx-auto mt-12 max-w-3xl text-[16px]">
            <Content />
          </div>

          <footer className="mx-auto mt-14 max-w-3xl border-t border-border pt-8 text-[13px] leading-6 text-secondary">
            <p className="font-medium text-foreground">{t.editorialTitle}</p>
            <p className="mt-2">{t.editorialText}</p>
          </footer>
        </div>
      </article>
    </>
  );
}
