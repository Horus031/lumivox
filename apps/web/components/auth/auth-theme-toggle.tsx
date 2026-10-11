"use client";

import { Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

export function AuthThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const t = useTranslations("auth.shell");
  return (
    <Button type="button" variant="ghost" size="icon" className="auth-theme-toggle"
      title={t("toggleTheme")} aria-label={t("toggleTheme")}
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
      <Moon className="dark:hidden" aria-hidden="true" />
      <Sun className="hidden dark:block" aria-hidden="true" />
    </Button>
  );
}
