"use client";

import { MoreHorizontal } from "lucide-react";

import { useTransition } from "react";

import { useRouter } from "next/navigation";

import { useTranslations } from "next-intl";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { CreateGoalForm } from "@/features/goals/components/create-goal.form";

import { deleteGoalAction } from "@/features/goals/goal.actions";

import type { GoalWithProgress } from "@/features/goals/goal.types";

import { Link } from "@/i18n/navigation";

type WorkspaceGoalActionsProps = {
  goal: GoalWithProgress;
};

export function WorkspaceGoalActions({ goal }: WorkspaceGoalActionsProps) {
  const t = useTranslations("workspace.rail");

  const commonT = useTranslations("common");

  const router = useRouter();

  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    if (!window.confirm(t("deleteGoalConfirm"))) {
      return;
    }

    startTransition(async () => {
      const result = await deleteGoalAction(goal.id);

      if (!result.success) {
        toast.error(result.message);

        return;
      }

      toast.success(result.message);

      router.push("/workspace?goal=all");

      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-8 shrink-0"
          aria-label={t("goalActions")}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end">
        <CreateGoalForm
          mode="edit"
          goal={goal}
          trigger={
            <DropdownMenuItem onSelect={(event) => event.preventDefault()}>
              {commonT("edit")}
            </DropdownMenuItem>
          }
        />

        <DropdownMenuItem asChild>
          <Link href={`/goals/${goal.id}`}>{t("documents")}</Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          disabled={isPending}
          className="text-destructive focus:text-destructive"
          onSelect={(event) => {
            event.preventDefault();

            handleDelete();
          }}
        >
          {commonT("delete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
