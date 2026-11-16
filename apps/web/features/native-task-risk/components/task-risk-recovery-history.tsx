"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  loadTaskRiskRecoveryHistoryAction,
  reassessTaskRiskAfterRecoveryAction,
} from "../task-risk-recovery.actions";
import type { RecoveryHistoryItem } from "../task-risk-recovery.types";

export function TaskRiskRecoveryHistory({ taskId, revision }: { taskId: string; revision: string }) {
  const t = useTranslations("taskRiskRecovery.history");
  const [items, setItems] = useState<RecoveryHistoryItem[] | null>();
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let active = true;
    loadTaskRiskRecoveryHistoryAction(taskId).then(result => {
      if (active) setItems(result);
    }).catch(() => { if (active) setItems(null); });
    return () => { active = false; };
  }, [taskId, revision]);

  function reassess(id: string) {
    startTransition(async () => {
      setFailed(false);
      try {
        setFailed(!await reassessTaskRiskAfterRecoveryAction(id));
        setItems(await loadTaskRiskRecoveryHistoryAction(taskId));
      } catch {
        setFailed(true);
      }
    });
  }

  return (
    <section className="space-y-2" aria-busy={pending}>
      <h3 className="font-semibold">{t("title")}</h3>
      {items === undefined && <p role="status">{t("loading")}</p>}
      {items === null && <p>{t("unavailable")}</p>}
      {items?.length === 0 && <p>{t("empty")}</p>}
      {failed && <p role="status">{t("retry")}</p>}
      {items && items.length > 0 && <ul className="space-y-2">
        {items.map(item => (
          <li className="space-y-1 rounded-md border p-3 text-sm" key={item.id}>
            <p className="font-medium">{t(item.action)}</p>
            <p>{t(item.status)}</p>
            {item.action === "reschedule" && <p>{t("originalDue", { date: new Date(item.originalDueAt) })}</p>}
            {item.status === "applied" && <>
              {item.comparison ? (
                <p>{t("comparison", {
                  before: item.comparison.before, after: item.comparison.after,
                  delta: Math.round(item.comparison.delta * 1000) / 10,
                })}</p>
              ) : <p>{t(item.evaluated ? "unavailable" : "awaiting")}</p>}
              <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => reassess(item.id)}>
                {t("reassess")}
              </Button>
            </>}
          </li>
        ))}
      </ul>}
    </section>
  );
}
