import { ArrowLeft, CircleAlert, MailCheck } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

export async function AuthSignUpSuccess() {
  const t = await getTranslations("auth.registerSuccess");
  const authT = await getTranslations("auth");
  return (
    <div className="flex flex-col gap-6">
      <MailCheck className="size-9 text-primary" strokeWidth={1.5} aria-hidden="true" />
      <header className="auth-form-heading">
        <h1>{t("title")}</h1>
        <p>{t("description")}</p>
      </header>
      <p className="text-sm leading-7 text-muted-foreground">{t("body")}</p>
      <Button asChild variant="outline" className="h-12 w-full">
        <Link href="/auth/login"><ArrowLeft aria-hidden="true" />{authT("backToLogin")}</Link>
      </Button>
    </div>
  );
}

type ErrorPageProps = { searchParams: Promise<{ error?: string | string[] }> };

async function ErrorContent({ searchParams }: ErrorPageProps) {
  const params = await searchParams;
  const t = await getTranslations("auth.error");
  const error = Array.isArray(params.error) ? params.error[0] : params.error;
  return (
    <p role="alert" className="auth-form-error break-words">
      {error ? t("codeError", { error }) : t("unspecified")}
    </p>
  );
}

export async function AuthErrorPage({ searchParams }: ErrorPageProps) {
  const t = await getTranslations("auth.error");
  const authT = await getTranslations("auth");
  return (
    <div className="flex flex-col gap-6">
      <CircleAlert className="size-9 text-destructive" strokeWidth={1.5} aria-hidden="true" />
      <header className="auth-form-heading"><h1>{t("title")}</h1></header>
      <Suspense><ErrorContent searchParams={searchParams} /></Suspense>
      <Button asChild className="h-12 w-full">
        <Link href="/auth/login"><ArrowLeft aria-hidden="true" />{authT("backToLogin")}</Link>
      </Button>
      <Link href="/auth/forgot-password" className="text-center text-sm underline underline-offset-4">
        {authT("login.forgotPassword")}
      </Link>
    </div>
  );
}
