import { ArrowRight } from "lucide-react";
import Image from "next/image";
import { Suspense } from "react";
import { useTranslations } from "next-intl";

import { LanguageSwitcher } from "@/components/language-switcher";
import { Link } from "@/i18n/navigation";

export default function NavBar() {
  const t = useTranslations("landing.nav");
  const common = useTranslations("common");

  return (
    <header className="fixed w-full top-0 z-40 bg-transparent backdrop-blur-2xl">
      <div className="max-w-310 mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="size-8 rounded-lg flex items-center justify-center">
            <Image
              src={"/logo.png"}
              alt="lumivox-logo"
              width={48}
              height={48}
            />
          </div>
          <span className="font-semibold tracking-tight text-[15px]">
            {common("appName")}
          </span>
        </Link>
        <nav className="hidden md:flex items-center gap-7 text-[13.5px] text-secondary">
          <a
            href="#features"
            className="hover:text-foreground transition-colors"
          >
            {t("features")}
          </a>
          <a href="#how" className="hover:text-foreground transition-colors">
            {t("howItWorks")}
          </a>
          <a
            href="#analytics"
            className="hover:text-foreground transition-colors"
          >
            {t("analytics")}
          </a>
          <a
            href="#pricing"
            className="hover:text-foreground transition-colors"
          >
            {t("pricing")}
          </a>
          <a href="#faq" className="hover:text-foreground transition-colors">
            {t("faq")}
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <Suspense fallback={null}>
            <LanguageSwitcher />
          </Suspense>
          <Link
            href="/auth/login"
            className="hidden sm:inline-flex items-center h-9 px-3 rounded-md text-[13px] font-medium text-secondary hover:text-foreground transition-colors"
          >
            {t("signIn")}
          </Link>
          <Link
            href="/auth/sign-up"
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md bg-primary text-primary-foreground text-[13px] font-medium hover:bg-primary/90 transition-colors"
          >
            {t("getStarted")} <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </div>
    </header>
  );
}
