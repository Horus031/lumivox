"use client";

import { ArrowLeft, ArrowRight, LoaderCircle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/auth/password-input";
import { Label } from "@/components/ui/label";
import { Link } from "@/i18n/navigation";

export function UpdatePasswordForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const locale = useLocale();
  const t = useTranslations("auth.updatePassword");
  const authT = useTranslations("auth");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      router.push(`/${locale}/dashboard`);
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : authT("errors.generic"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <header className="auth-form-heading">
        <h1>{t("title")}</h1>
        <p>{t("description")}</p>
      </header>
      <form onSubmit={handleUpdatePassword} aria-busy={isLoading}>
        <div className="flex flex-col gap-6">
          <div className="grid gap-2">
            <Label htmlFor="password">{t("newPassword")}</Label>
            <PasswordInput
              id="password"
              name="password"
              autoComplete="new-password"
              required
              disabled={isLoading}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <p role="alert" className="auth-form-error">{error}</p>}
          <Button type="submit" className="auth-submit w-full" disabled={isLoading}>
            {isLoading ? t("submitting") : t("submit")}
            {isLoading ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}
          </Button>
        </div>
      </form>
      <Link href="/auth/login" className="flex items-center justify-center gap-2 text-sm underline-offset-4 hover:underline">
        <ArrowLeft size={16} aria-hidden="true" />{authT("backToLogin")}
      </Link>
    </div>
  );
}
