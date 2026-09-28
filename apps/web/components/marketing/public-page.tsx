import type { ReactNode } from "react";

type PublicPageHeaderProps = {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
};

export function PublicPageHeader({
  eyebrow,
  title,
  description,
  children,
}: PublicPageHeaderProps) {
  return (
    <header className="border-b border-border bg-surface pt-32 pb-16">
      <div className="mx-auto max-w-250 px-6">
        <p className="text-[11.5px] font-medium uppercase tracking-[0.18em] text-primary">
          {eyebrow}
        </p>
        <h1 className="mt-4 max-w-4xl text-[42px] font-semibold leading-[1.08] tracking-tight md:text-[58px]">
          {title}
        </h1>
        <p className="mt-6 max-w-3xl text-[17px] leading-relaxed text-secondary">
          {description}
        </p>
        {children}
      </div>
    </header>
  );
}

type ContentSectionProps = {
  number?: string;
  title: string;
  children: ReactNode;
};

export function ContentSection({ number, title, children }: ContentSectionProps) {
  return (
    <section className="grid gap-4 border-b border-border py-10 md:grid-cols-[11rem_1fr] md:gap-10">
      <div>
        {number && (
          <span className="font-mono text-[12px] text-muted-foreground">
            {number}
          </span>
        )}
        <h2 className="mt-2 text-[23px] font-semibold tracking-tight">
          {title}
        </h2>
      </div>
      <div className="max-w-3xl space-y-4 text-[15px] leading-7 text-secondary">
        {children}
      </div>
    </section>
  );
}

export function PublicPageBody({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-250 px-6 pb-24">{children}</div>;
}
