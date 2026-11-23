"use client";

import { useConfirmDialog } from "@/components/ui/use-confirm-dialog";

import { MoreHorizontal } from "lucide-react";

import { useRef, useState, useTransition } from "react";

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

import { deleteGoalAction, getGoalForEditAction } from "@/features/goals/goal.actions";

import type { Goal, GoalOption } from "@/features/goals/goal.types";

import { useRouter } from "@/i18n/navigation";

type WorkspaceGoalActionsProps = {
  goal: GoalOption;
  selected: boolean;
};

export function WorkspaceGoalActions({ goal, selected }: WorkspaceGoalActionsProps) {
  const t = useTranslations("workspace.rail");
  const confirm = useConfirmDialog();

  const commonT = useTranslations("common");

  const router = useRouter();

  const [isPending, startTransition] = useTransition();
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  function handleEdit() {
    startTransition(async () => {
      const details = await getGoalForEditAction(goal.id).catch(() => null);
      if (details) setEditingGoal(details);
      else toast.error(t("editUnavailable"));
    });
  }

  async function handleDelete() {
    if (!(await confirm(t("deleteGoalConfirm"), { variant: "destructive" }))) {
      return;
    }

    startTransition(async () => {
      const result = await deleteGoalAction(goal.id);

      if (!result.success) {
        toast.error(result.message);

        return;
      }

      toast.success(result.message);

      if (selected) router.replace("/workspace");
      router.refresh();
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            ref={triggerRef}
            type="button"
            size="icon"
            variant="ghost"
            className="absolute end-0.5 top-1/2 -translate-y-1/2 [@media(hover:hover)_and_(pointer:fine)]:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 data-[state=open]:opacity-100"
            aria-label={t("goalActionsFor", { title: goal.title })}
            title={t("goalActions")}
          >
            <MoreHorizontal aria-hidden="true" className="size-4" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end">
          <DropdownMenuItem disabled={isPending} onSelect={handleEdit}>
            {commonT("edit")}
          </DropdownMenuItem>

          {/* <DropdownMenuItem asChild>
            <Link href={workspaceHref(goal.id, "documents")} prefetch={false} onClick={onNavigate}>
              {t("documents")}
            </Link>
          </DropdownMenuItem> */}

          <DropdownMenuSeparator />

          <DropdownMenuItem
            disabled={isPending}
            className="text-destructive focus:text-destructive"
            onSelect={(event) => {
              event.preventDefault();
              void handleDelete();
            }}
          >
            {commonT("delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {editingGoal && (
        <CreateGoalForm
          mode="edit"
          goal={editingGoal}
          open
          returnFocusRef={triggerRef}
          onOpenChange={(open) => { if (!open) setEditingGoal(null); }}
        />
      )}
    </>
  );
}
