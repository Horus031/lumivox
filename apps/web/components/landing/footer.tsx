import { Sparkles } from "lucide-react";
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
            <div className="size-7 rounded-md bg-gradient-hero flex items-center justify-center">
              <Sparkles className="size-4 text-white" strokeWidth={2.5} />
            </div>
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
              <a href="#features" className="hover:text-foreground">
                {t("product.features")}
              </a>
            </li>
            <li>
              <a href="#analytics" className="hover:text-foreground">
                {t("product.analytics")}
              </a>
            </li>
            <li>
              <a href="#pricing" className="hover:text-foreground">
                {t("product.pricing")}
              </a>
            </li>
            <li>
              <Link href="/app" className="hover:text-foreground">
                {t("product.openApp")}
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="text-[12px] font-semibold tracking-wider uppercase text-muted-foreground mb-3">
            {t("company.title")}
          </p>
          <ul className="space-y-2 text-[13.5px] text-secondary">
            <li>
              <a href="#" className="hover:text-foreground">
                {t("company.about")}
              </a>
            </li>
            <li>
              <a href="#" className="hover:text-foreground">
                {t("company.privacy")}
              </a>
            </li>
            <li>
              <a href="#" className="hover:text-foreground">
                {t("company.terms")}
              </a>
            </li>
            <li>
              <a href="#" className="hover:text-foreground">
                {t("company.contact")}
              </a>
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
