"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="h-10 w-full rounded-xl border bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900" />
    );
  }

  const options = [
    {
      value: "light",
      label: "Light",
      icon: Sun,
    },
    {
      value: "dark",
      label: "Dark",
      icon: Moon,
    },
    {
      value: "system",
      label: "System",
      icon: Monitor,
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-2 rounded-2xl bg-background p-1 ">
      {options.map((option) => {
        const Icon = option.icon;
        const isActive = theme === option.value;

        return (
          <Button
            variant={'outline'}
            key={option.value}
            type="button"
            onClick={() => setTheme(option.value)}
            className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition ${
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-foreground hover:bg-foreground/10 border-foreground"
            }`}
          >
            <Icon className="h-4 w-4" />
            <span className="hidden sm:inline">{option.label}</span>
          </Button>
        );
      })}
    </div>
  );
}