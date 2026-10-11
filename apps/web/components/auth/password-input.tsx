"use client";

import { Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function PasswordInput(props: Omit<ComponentProps<typeof Input>, "type">) {
  const [visible, setVisible] = useState(false);
  const t = useTranslations("auth.fields");
  const label = t(visible ? "hidePassword" : "showPassword");
  const Icon = visible ? EyeOff : Eye;
  return (
    <div className="relative">
      <Input {...props} type={visible ? "text" : "password"} className="pr-12" />
      <Button type="button" variant="ghost" size="icon"
        className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground"
        aria-label={label} title={label} aria-pressed={visible} aria-controls={props.id}
        disabled={props.disabled} onClick={() => setVisible((value) => !value)}>
        <Icon aria-hidden="true" />
      </Button>
    </div>
  );
}
