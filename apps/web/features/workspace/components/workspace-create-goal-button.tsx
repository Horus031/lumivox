"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { CreateGoalForm } from "@/features/goals/components/create-goal.form";

export function WorkspaceCreateGoalButton() {
  const t = useTranslations("workspace.rail");

  return (
    <CreateGoalForm
      trigger={
        <Button type="button" variant="outline" size="icon" className="shrink-0 sm:size-touch lg:size-control-sm" aria-label={t("createGoal")} title={t("createGoal")}>
          <Plus aria-hidden="true" className="size-4" />
        </Button>
      }
    />
  );
}
