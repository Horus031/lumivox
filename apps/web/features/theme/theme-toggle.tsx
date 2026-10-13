"use client";

import { useEffect, useId, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";

export function ThemeToggle({ disabled = false }: { disabled?: boolean }) {
  const { theme, setTheme } = useTheme();
  const t = useTranslations("settings.theme");
  const id = useId();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  if (!mounted) return <div aria-hidden="true" className="h-touch w-full animate-pulse rounded-md bg-muted sm:h-control" />;
  const options = [{ value: "light", icon: Sun }, { value: "dark", icon: Moon }, { value: "system", icon: Monitor }] as const;

  return (
    <fieldset disabled={disabled} className="grid min-w-0 grid-cols-3 gap-2">
      <legend className="sr-only">{t("label")}</legend>
      {options.map(({ value, icon: Icon }) => (
        <label key={value} className="min-w-0 cursor-pointer">
          <input type="radio" name={id} value={value} checked={theme === value} onChange={() => setTheme(value)} className="peer sr-only" />
          <span className="flex h-touch min-w-0 flex-col items-center justify-center gap-1 rounded-md border border-border bg-background px-2 text-caption font-medium text-foreground transition-colors hover:bg-muted peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-checked:hover:bg-primary/90 peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-disabled:cursor-not-allowed peer-disabled:opacity-50 sm:h-control sm:flex-row sm:gap-2 sm:text-label">
            <Icon className="size-icon shrink-0" aria-hidden="true" />
            <span>{t(value)}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
