import { onboardingSchema } from "@/features/onboarding/onboarding.schemas";
import z from "zod";

export const updateSettingsSchema = onboardingSchema;

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
