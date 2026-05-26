"use server";

import { redirect, unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/require-user";
import type { ActionResult } from "@/lib/actions/action-result";

import {
  onboardingSchema,
  type OnboardingInput,
} from "./onboarding.schemas";

export async function completeOnboardingAction(
  input: OnboardingInput
): Promise<ActionResult> {
  const parsed = onboardingSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      message: "Invalid onboarding data.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const { supabase, user } = await requireUser();

    const {
      fullName,
      timezone,
      taskCompletionWeight,
      focusQualityWeight,
      deadlineAdherenceWeight,
      goalMomentumWeight,
      consistencyWeight,
    } = parsed.data;

    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        full_name: fullName,
        timezone,
        onboarding_completed: true,
      })
      .eq("id", user.id);

    if (profileError) {
      return {
        success: false,
        message: `Failed to update profile: ${profileError.message}`,
      };
    }

    const { error: weightsError } = await supabase
      .from("pbi_weight_profiles")
      .update({
        task_completion_weight: taskCompletionWeight,
        focus_quality_weight: focusQualityWeight,
        deadline_adherence_weight: deadlineAdherenceWeight,
        goal_momentum_weight: goalMomentumWeight,
        consistency_weight: consistencyWeight,
      })
      .eq("user_id", user.id);

    if (weightsError) {
      return {
        success: false,
        message: `Failed to update PBI weights: ${weightsError.message}`,
      };
    }

    revalidatePath("/dashboard");
    revalidatePath("/onboarding");
    revalidatePath("/settings");

    redirect("/dashboard");
  } catch (error) {
    unstable_rethrow(error);

    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unexpected error while completing onboarding.",
    };
  }
}