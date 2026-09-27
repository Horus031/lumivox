import Image from "next/image";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";

const currentYear = new Date().getFullYear();

export default function Footer() {
  const t = useTranslations("landing.footer");
  const common = useTranslations("common");

  return (
    <footer className="border-t border-border bg-surface">
      <div className="max-w-310 mx-auto px-6 py-12 grid md:grid-cols-4 gap-8">
        <div className="md:col-span-2">
          <div className="flex items-center gap-2 mb-3">
            <Image src="/logo.png" alt="" width={28} height={28} />
            <span className="font-semibold tracking-tight">
              {common("appName")}
            </span>
          </div>
          <p className="text-[13.5px] text-secondary max-w-sm leading-relaxed">
            {t("description")}
          </p>
        </div>
        <div>
          <p className="text-[12px] font-semibold tracking-wider uppercase text-muted-foreground mb-3">
            {t("product.title")}
          </p>
          <ul className="space-y-2 text-[13.5px] text-secondary">
            <li>
              <Link href="/features" className="hover:text-foreground">
                {t("product.features")}
              </Link>
            </li>
            <li>
              <Link href="/research" className="hover:text-foreground">
                {t("product.research")}
              </Link>
            </li>
            <li>
              <Link href="/auth/login" className="hover:text-foreground">
                {t("product.openApp")}
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="text-[12px] font-semibold tracking-wider uppercase text-muted-foreground mb-3">
            {t("project.title")}
          </p>
          <ul className="space-y-2 text-[13.5px] text-secondary">
            <li>
              <Link href="/about" className="hover:text-foreground">
                {t("project.about")}
              </Link>
            </li>
            <li>
              <Link href="/privacy" className="hover:text-foreground">
                {t("project.privacy")}
              </Link>
            </li>
            <li>
              <Link href="/terms" className="hover:text-foreground">
                {t("project.terms")}
              </Link>
            </li>
            <li>
              <Link href="/contact" className="hover:text-foreground">
                {t("project.contact")}
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border">
        <div className="max-w-310 mx-auto px-6 py-5 text-[12px] text-muted-foreground flex flex-col sm:flex-row gap-2 justify-between">
          <span>{t("copyright", { year: currentYear })}</span>
          <span>{t("madeWithCare")}</span>
        </div>
      </div>
    </footer>
  );
}
