"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Laptop, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

const ThemeSwitcher = ({ compact = false }: { compact?: boolean }) => {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme } = useTheme();
  const t = useTranslations("settings.theme");
  const commonT = useTranslations("common");

  // useEffect only runs on the client, so now we can safely show the UI
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <span aria-hidden="true" className={compact ? "inline-block size-touch lg:size-control" : "inline-block size-touch sm:size-control"} />;
  }

  const ICON_SIZE = 16;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={compact ? "ghost" : "outline"} size="icon" aria-label={commonT("theme")} title={commonT("theme")} className={compact ? "sm:size-touch lg:size-control" : undefined}>
          {theme === "light" ? (
            <Sun
              key="light"
            />
          ) : theme === "dark" ? (
            <Moon
              key="dark"
            />
          ) : (
            <Laptop
              key="system"
            />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-40" align="end">
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(e) => setTheme(e)}
        >
          <DropdownMenuRadioItem className={compact ? "min-h-touch gap-2 lg:min-h-control" : "flex gap-2"} value="light">
            <Sun size={ICON_SIZE} />{" "}
            <span>{t("light")}</span>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem className={compact ? "min-h-touch gap-2 lg:min-h-control" : "flex gap-2"} value="dark">
            <Moon size={ICON_SIZE} />{" "}
            <span>{t("dark")}</span>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem className={compact ? "min-h-touch gap-2 lg:min-h-control" : "flex gap-2"} value="system">
            <Laptop size={ICON_SIZE} />{" "}
            <span>{t("system")}</span>
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export { ThemeSwitcher };
