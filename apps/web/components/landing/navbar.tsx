import { ArrowRight } from "lucide-react";
import Image from "next/image";
import { Suspense } from "react";
import { useTranslations } from "next-intl";

import { LanguageSwitcher } from "@/components/language-switcher";
import { Link } from "@/i18n/navigation";
import { ThemeSwitcher } from "@/features/theme/theme-switcher";

export default function NavBar() {
  const t = useTranslations("landing.nav");
  const common = useTranslations("common");

  return (
    <header className="marketing-navbar fixed top-0 z-40 w-full backdrop-blur-xl">
      <div className="max-w-310 mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
        <Link href="/" className="flex shrink-0 items-center gap-2 rounded-md">
          <div className="size-8 rounded-lg flex items-center justify-center">
            <Image
              src={"/logo.png"}
              alt="lumivox-logo"
              width={48}
              height={48}
            />
          </div>
          <span className="font-semibold text-foreground tracking-tight text-[15px]">
            {common("appName")}
          </span>
        </Link>
        <nav className="hidden lg:flex items-center gap-7 text-[13.5px]">
          <Link
            href="/features"
            className="marketing-navbar__link rounded-sm transition-colors"
          >
            {t("features")}
          </Link>
          <Link
            href="/#how"
            className="marketing-navbar__link rounded-sm transition-colors"
          >
            {t("howItWorks")}
          </Link>
          <Link
            href="/research"
            className="marketing-navbar__link rounded-sm transition-colors"
          >
            {t("research")}
          </Link>
          <Link
            href="/blog"
            className="marketing-navbar__link rounded-sm transition-colors"
          >
            {t("blog")}
          </Link>
          <Link
            href="/about"
            className="marketing-navbar__link rounded-sm transition-colors"
          >
            {t("about")}
          </Link>
        </nav>
        <div className="marketing-navbar__controls flex shrink-0 items-center gap-1.5 sm:gap-2">
          <Suspense fallback={null}>
            <LanguageSwitcher />

            <div className="marketing-navbar__theme-control flex">
              <ThemeSwitcher />
            </div>
          </Suspense>
          <Link
            href="/auth/login"
            className="marketing-navbar__link marketing-navbar__sign-in hidden sm:inline-flex items-center h-9 px-3 rounded-md text-[13px] font-medium transition-colors"
          >
            {t("signIn")}
          </Link>
          <Link
            data-navbar-primary
            href="/auth/sign-up"
            className="marketing-navbar__primary inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md text-[13px] font-medium transition-colors"
          >
            {t("getStarted")} <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </div>
    </header>
  );
}
