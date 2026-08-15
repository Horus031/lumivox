import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { CreateGoalForm } from "./create-goal.form";
import { getTranslations } from "next-intl/server";

export async function CreateGoalModal() {
  const t = await getTranslations("goals.form");

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>{t("trigger")}</Button>
        <DialogContent>
          <CreateGoalForm />
        </DialogContent>
      </DialogTrigger>
    </Dialog>
  );
}
