"use client";

import { Check, Languages } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePathname, useRouter } from "@/i18n/navigation";
import { Button } from "./ui/button";

const languages = [
  { value: "en", flag: "\u{1F1FA}\u{1F1F8}", label: "English" },
  { value: "vi", flag: "\u{1F1FB}\u{1F1F3}", label: "Ti\u1EBFng Vi\u1EC7t" },
] as const;

export function LanguageSwitcher() {
  const locale = useLocale();
  const t = useTranslations("common");
  const router = useRouter();
  const pathname = usePathname();
  const currentLanguage =
    languages.find((language) => language.value === locale) ?? languages[0];

  function handleChange(nextLocale: string) {
    router.replace(pathname, {
      locale: nextLocale,
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild aria-label={t("language")}>
        <Button variant={"outline"}>
          <Languages /> {currentLanguage.flag}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-48">
        <DropdownMenuLabel>{t("language")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {languages.map((language) => (
          <DropdownMenuItem
            key={language.value}
            onClick={() => handleChange(language.value)}
            className="rounded-lg py-2"
          >
            <span className="text-base leading-none">{language.flag}</span>
            <span>{language.label}</span>
            {language.value === locale && (
              <Check className="ml-auto size-4 text-primary" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
