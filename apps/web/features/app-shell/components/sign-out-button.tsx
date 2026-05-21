"use client";

import { Button } from "@/components/ui/button";

export function SignOutButton() {
  return (
    <form action="/auth/signout" method="post">
      <Button
        type="submit"
        className="w-full rounded-full bg-background px-4 py-2.5 text-sm font-medium text-foreground ring-1 ring-border/70 transition hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        Sign out
      </Button>
    </form>
  );
}
