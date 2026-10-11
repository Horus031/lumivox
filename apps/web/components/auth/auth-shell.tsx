import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LanguageSwitcher } from "@/components/language-switcher";
import { AuthWatercolor } from "@/components/background/auth-watercolor";
import { AuthThemeToggle } from "./auth-theme-toggle";

export async function AuthShell({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("auth.shell");
  return (
    <main className="auth-shell">
      <div className="auth-backdrop" aria-hidden="true"><AuthWatercolor /></div>
      <header className="auth-header">
        <Link href="/" className="auth-brand" aria-label={t("home")}>
          <Image src="/logo.png" width={36} height={36} alt="" />
          <span>Lumivox</span>
        </Link>
        <div className="auth-preferences"><LanguageSwitcher /><AuthThemeToggle /></div>
      </header>
      <div className="auth-layout">
        <section className="auth-introduction" aria-label="Lumivox">
          <p className="auth-eyebrow">{t("eyebrow")}</p>
          <p className="auth-wordmark">Lumivox<span aria-hidden="true">.</span></p>
          <p className="auth-statement">{t("statement")}</p>
          <div className="auth-intro-footer">
            <span>{t("signature")}</span>
            <Link href="/">{t("explore")}<ArrowUpRight size={16} aria-hidden="true" /></Link>
          </div>
        </section>
        <section className="auth-form-region">
          <div className="auth-form-content">{children}</div>
          <p className="auth-legal">
            <Link href="/privacy">{t("privacy")}</Link>
            <span aria-hidden="true">/</span>
            <Link href="/terms">{t("terms")}</Link>
          </p>
        </section>
      </div>
    </main>
  );
}
