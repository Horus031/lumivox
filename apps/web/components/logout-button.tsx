"use client";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";

export function LogoutButton() {
  const locale = useLocale();
  const router = useRouter();

  const logout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push(`/${locale}/auth/login`);
  };

  return <Button onClick={logout}>Logout</Button>;
}
