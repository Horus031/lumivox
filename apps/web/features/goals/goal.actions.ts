"use server";

import { requireUser } from "@/lib/auth/require-user";
import type { ActionResult } from "@/lib/actions/action-result";
import { z } from "zod";
import { getGoalPage } from "./goal.queries";
import type { GoalPage } from "./goal.types";

import {
  createGoalSchema,
  deleteGoalSchema,
  updateGoalSchema,
  type CreateGoalInput,
  type UpdateGoalInput,
} from "./goal.schemas";

const goalPageSchema = z.object({
  search: z.string().trim().max(160),
  cursor: z.object({ created_at: z.iso.datetime({ offset: true }), id: z.guid() }).nullable(),
  includeProgress: z.boolean(),
});

export async function searchGoalsAction(input: z.input<typeof goalPageSchema>): Promise<GoalPage | null> {
  const parsed = goalPageSchema.safeParse(input);
  if (!parsed.success) return null;

  try {
    return await getGoalPage(parsed.data);
  } catch (error) {
    console.error("Failed to search workspace goals", error);
    return null;
  }
}

export async function createGoalAction(input: CreateGoalInput): Promise<ActionResult> {
  const parsed = createGoalSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      message: "Invalid goal data.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const { supabase, user } = await requireUser();

    const { title, description, goalType, startDate, targetDate } = parsed.data;

    const { error } = await supabase.from("goals").insert({
      user_id: user.id,
      title,
      description: description || null,
      goal_type: goalType,
      start_date: startDate || null,
      target_date: targetDate || null,
    });

    if (error) {
      return {
        success: false,
        message: `Failed to create goal: ${error.message}`,
      };
    }

    return {
      success: true,
      message: "Goal created successfully.",
      data: null,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Unexpected error while creating goal.",
    };
  }
}

export async function updateGoalAction(input: UpdateGoalInput): Promise<ActionResult> {
  const parsed = updateGoalSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      message: "Invalid goal data.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const { supabase } = await requireUser();

    const { goalId, title, description, goalType, status, startDate, targetDate } = parsed.data;

    const { error } = await supabase
      .from("goals")
      .update({
        title,
        description: description || null,
        goal_type: goalType,
        status,
        start_date: startDate || null,
        target_date: targetDate || null,
      })
      .eq("id", goalId);

    if (error) {
      return {
        success: false,
        message: `Failed to update goal: ${error.message}`,
      };
    }

    return {
      success: true,
      message: "Goal updated successfully.",
      data: null,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Unexpected error while updating goal.",
    };
  }
}

export async function deleteGoalAction(goalId: string): Promise<ActionResult> {
  const parsed = deleteGoalSchema.safeParse({ goalId });

  if (!parsed.success) {
    return {
      success: false,
      message: "Invalid goal id.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const { supabase } = await requireUser();

    const { error } = await supabase.from("goals").delete().eq("id", parsed.data.goalId);

    if (error) {
      return {
        success: false,
        message: `Failed to delete goal: ${error.message}`,
      };
    }

    return {
      success: true,
      message: "Goal deleted successfully.",
      data: null,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Unexpected error while deleting goal.",
    };
  }
}
