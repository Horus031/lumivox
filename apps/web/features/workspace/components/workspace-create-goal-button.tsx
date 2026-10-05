"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { CreateGoalForm } from "@/features/goals/components/create-goal.form";

// Radix's asChild trigger must be created inside the client boundary.
export function WorkspaceCreateGoalButton({
  iconOnly = false,
}: {
  iconOnly?: boolean;
}) {
  const t = useTranslations("workspace");
  return (
    <CreateGoalForm
      trigger={
        <Button
          type="button"
          variant="outline"
          size={iconOnly ? "icon" : "default"}
          className={iconOnly ? undefined : "gap-2"}
          aria-label={iconOnly ? t("rail.createGoal") : undefined}
        >
          <Plus className="h-4 w-4" />
          {iconOnly ? null : t("page.newGoal")}
        </Button>
      }
    />
  );
}
