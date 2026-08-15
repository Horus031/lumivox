import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

export default function LandingPage() {
  redirect({
    href: "/",
    locale: routing.defaultLocale,
  });
}
