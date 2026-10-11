"use client";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { PasswordInput } from "@/components/auth/password-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { trackSignUp } from "@/lib/analytics/events";

export function SignUpForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const locale = useLocale();
  const t = useTranslations("auth.register");
  const authT = useTranslations("auth");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    if (password !== repeatPassword) {
      setError(t("passwordMismatch"));
      setIsLoading(false);
      return;
    }

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/confirm?next=/onboarding`,
        },
      });
      if (error) throw error;

      trackSignUp("email");

      router.push(`/${locale}/auth/sign-up-success`);
    } catch (error: unknown) {
      setError(
        error instanceof Error ? error.message : authT("errors.generic"),
      );
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
          <form onSubmit={handleSignUp} aria-busy={isLoading}>
            <div className="flex flex-col gap-6">
              <div className="grid gap-2">
                <Label htmlFor="email">{authT("fields.email")}</Label>
                <Input
                  id="email"
                  type="email"
                  name="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  disabled={isLoading}
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <div className="flex items-center">
                  <Label htmlFor="password">{authT("fields.password")}</Label>
                </div>
                <PasswordInput
                  id="password"
                  name="password"
                  autoComplete="new-password"
                  disabled={isLoading}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <div className="flex items-center">
                  <Label htmlFor="repeat-password">
                    {authT("fields.repeatPassword")}
                  </Label>
                </div>
                <PasswordInput
                  id="repeat-password"
                  name="repeat-password"
                  autoComplete="new-password"
                  disabled={isLoading}
                  required
                  value={repeatPassword}
                  onChange={(e) => setRepeatPassword(e.target.value)}
                />
              </div>
              {error && <p role="alert" className="auth-form-error">{error}</p>}
              <Button type="submit" className="auth-submit w-full" disabled={isLoading}>
                {isLoading ? t("submitting") : t("submit")}
                {isLoading ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}
              </Button>
            </div>
            <div className="auth-form-alternative">
              {t("hasAccount")}{" "}
              <Link href="/auth/login" className="font-semibold underline-offset-4 hover:underline">
                {t("loginLink")}
              </Link>
            </div>
          </form>
    </div>
  );
}
