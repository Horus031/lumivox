"use client";

import { useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { updateAdminCmsSettingAction } from "@/features/admin/admin-settings.actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type CmsSetting = {
  key: string;
  value: unknown;
  description: string | null;
  updated_at: string;
};

type AdminCmsSettingsFormProps = {
  settings: CmsSetting[];
};

function getSetting<T>(settings: CmsSetting[], key: string, fallback: T): T {
  const setting = settings.find((item) => item.key === key);

  if (!setting) return fallback;

  return setting.value as T;
}

export function AdminCmsSettingsForm({ settings }: AdminCmsSettingsFormProps) {
  const router = useRouter();
  const t = useTranslations("admin.settings.form");
  const [isPending, startTransition] = useTransition();

  function updateSetting(
    key:
      | "global_leaderboard_enabled"
      | "group_leaderboard_enabled"
      | "default_rag_top_k"
      | "default_rag_prompt_variant"
      | "weekly_challenge_default_focus_minutes"
      | "weekly_challenge_default_completed_tasks"
      | "maintenance_mode_enabled",
    value: boolean | number | string,
  ) {
    startTransition(async () => {
      const result = await updateAdminCmsSettingAction({
        key,
        value,
      });

      if (!result.success) {
        toast.error(result.message);
        router.refresh();
        return;
      }

      toast.success(result.message);
      router.refresh();
    });
  }

  const globalLeaderboardEnabled = getSetting<boolean>(
    settings,
    "global_leaderboard_enabled",
    true,
  );

  const groupLeaderboardEnabled = getSetting<boolean>(
    settings,
    "group_leaderboard_enabled",
    true,
  );

  const maintenanceModeEnabled = getSetting<boolean>(
    settings,
    "maintenance_mode_enabled",
    false,
  );

  const defaultRagTopK = getSetting<number>(settings, "default_rag_top_k", 5);

  const defaultPromptVariant = getSetting<string>(
    settings,
    "default_rag_prompt_variant",
    "grounded_rule",
  );

  const weeklyFocusTarget = getSetting<number>(
    settings,
    "weekly_challenge_default_focus_minutes",
    300,
  );

  const weeklyTaskTarget = getSetting<number>(
    settings,
    "weekly_challenge_default_completed_tasks",
    10,
  );

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-surface p-6 shadow-sm">
        <h2 className="text-2xl font-bold text-foreground">
          {t("featureFlags.title")}
        </h2>

        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-between gap-4 rounded-2xl border p-4">
            <div>
              <p className="font-medium text-foreground">
                {t("featureFlags.globalLeaderboard.title")}
              </p>
              <p className="text-sm text-muted-foreground">
                {t("featureFlags.globalLeaderboard.description")}
              </p>
            </div>

            <Input
              type="checkbox"
              checked={globalLeaderboardEnabled}
              disabled={isPending}
              onChange={(event) =>
                updateSetting(
                  "global_leaderboard_enabled",
                  event.target.checked,
                )
              }
              className="h-5 w-5"
            />
          </div>

          <div className="flex items-center justify-between gap-4 rounded-2xl border p-4">
            <div>
              <p className="font-medium text-foreground">
                {t("featureFlags.groupLeaderboard.title")}
              </p>
              <p className="text-sm text-muted-foreground">
                {t("featureFlags.groupLeaderboard.description")}
              </p>
            </div>

            <Input
              type="checkbox"
              checked={groupLeaderboardEnabled}
              disabled={isPending}
              onChange={(event) =>
                updateSetting("group_leaderboard_enabled", event.target.checked)
              }
              className="h-5 w-5"
            />
          </div>

          <div className="flex items-center justify-between gap-4 rounded-2xl border p-4">
            <div>
              <p className="font-medium text-foreground">
                {t("featureFlags.maintenanceMode.title")}
              </p>
              <p className="text-sm text-muted-foreground">
                {t("featureFlags.maintenanceMode.description")}
              </p>
            </div>

            <Input
              type="checkbox"
              checked={maintenanceModeEnabled}
              disabled={isPending}
              onChange={(event) =>
                updateSetting("maintenance_mode_enabled", event.target.checked)
              }
              className="h-5 w-5"
            />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border bg-surface p-6 shadow-sm">
        <h2 className="text-2xl font-bold text-foreground">
          {t("ragDefaults.title")}
        </h2>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-sm font-medium text-foreground">
              {t("ragDefaults.defaultTopK")}
            </Label>

            <Select
              value={String(defaultRagTopK)}
              disabled={isPending}
              onValueChange={(value) =>
                updateSetting("default_rag_top_k", Number(value))
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Top-k</SelectLabel>
                  <SelectItem value="3">3</SelectItem>
                  <SelectItem value="5">5</SelectItem>
                  <SelectItem value="7">7</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium text-foreground">
              {t("ragDefaults.defaultPromptVariant")}
            </Label>

            <Select
              value={defaultPromptVariant}
              disabled={isPending}
              onValueChange={(value) =>
                updateSetting("default_rag_prompt_variant", value)
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Prompt Variants</SelectLabel>
                  <SelectItem value="grounded_rule">
                    {t("ragDefaults.promptVariants.groundedRule")}
                  </SelectItem>
                  <SelectItem value="no_rule">
                    {t("ragDefaults.promptVariants.noRule")}
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border bg-surface p-6 shadow-sm">
        <h2 className="text-2xl font-bold text-foreground">
          {t("weeklyChallenge.title")}
        </h2>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-sm font-medium text-foreground">
              {t("weeklyChallenge.defaultFocusMinutes")}
            </Label>

            <Input
              type="number"
              min={0}
              defaultValue={weeklyFocusTarget}
              disabled={isPending}
              onBlur={(event) =>
                updateSetting(
                  "weekly_challenge_default_focus_minutes",
                  Number(event.target.value),
                )
              }
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium text-foreground">
              {t("weeklyChallenge.defaultCompletedTasks")}
            </Label>

            <Input
              type="number"
              min={0}
              defaultValue={weeklyTaskTarget}
              disabled={isPending}
              onBlur={(event) =>
                updateSetting(
                  "weekly_challenge_default_completed_tasks",
                  Number(event.target.value),
                )
              }
            />
          </div>
        </div>
      </section>
    </div>
  );
}
