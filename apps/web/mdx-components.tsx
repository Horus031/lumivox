import type { MDXComponents } from "mdx/types";

export function useMDXComponents(
  components: MDXComponents,
): MDXComponents {
  return {
    h2: ({ children }) => (
      <h2 className="mt-12 text-2xl font-semibold tracking-tight">
        {children}
      </h2>
    ),

    h3: ({ children }) => (
      <h3 className="mt-8 text-xl font-semibold">
        {children}
      </h3>
    ),

    p: ({ children }) => (
      <p className="mt-4 leading-7 text-secondary">
        {children}
      </p>
    ),

    ul: ({ children }) => (
      <ul className="mt-4 list-disc space-y-2 pl-6 text-secondary">
        {children}
      </ul>
    ),

    ol: ({ children }) => (
      <ol className="mt-4 list-decimal space-y-2 pl-6 text-secondary">
        {children}
      </ol>
    ),

    blockquote: ({ children }) => (
      <blockquote className="mt-6 border-l-2 border-primary pl-5 text-[17px] leading-8 text-foreground">
        {children}
      </blockquote>
    ),

    hr: () => <hr className="my-10 border-border" />,

    a: ({ href, children }) => (
      <a
        href={href}
        className="font-medium text-primary underline underline-offset-4"
      >
        {children}
      </a>
    ),

    ...components,
  };
}

