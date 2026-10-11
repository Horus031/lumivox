"use client";

import { ArrowLeft, ArrowRight, LoaderCircle, MailCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "@/i18n/navigation";

export function ForgotPasswordForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const locale = useLocale();
  const t = useTranslations("auth.forgotPassword");
  const authT = useTranslations("auth");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/${locale}/auth/update-password`,
      });
      if (error) throw error;
      setSuccess(true);
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : authT("errors.generic"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      {success ? (
        <div role="status" className="flex flex-col gap-6">
          <MailCheck className="size-9 text-primary" strokeWidth={1.5} aria-hidden="true" />
          <header className="auth-form-heading">
            <h1>{t("successTitle")}</h1>
            <p>{t("successDescription")}</p>
          </header>
          <p className="text-sm leading-7 text-muted-foreground">{t("successBody")}</p>
        </div>
      ) : (
        <>
          <header className="auth-form-heading">
            <h1>{t("title")}</h1>
            <p>{t("description")}</p>
          </header>
          <form onSubmit={handleForgotPassword} aria-busy={isLoading}>
            <div className="flex flex-col gap-6">
              <div className="grid gap-2">
                <Label htmlFor="email">{authT("fields.email")}</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  required
                  disabled={isLoading}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              {error && <p role="alert" className="auth-form-error">{error}</p>}
              <Button type="submit" className="auth-submit w-full" disabled={isLoading}>
                {isLoading ? t("submitting") : t("submit")}
                {isLoading ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}
              </Button>
            </div>
          </form>
        </>
      )}
      <Link href="/auth/login" className="flex items-center justify-center gap-2 text-sm underline-offset-4 hover:underline">
        <ArrowLeft size={16} aria-hidden="true" />{authT("backToLogin")}
      </Link>
    </div>
  );
}
