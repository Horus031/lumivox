import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { CreateGoalForm } from "./create-goal.form";

export function CreateGoalModal() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Create Goals</Button>
        <DialogContent>
          <CreateGoalForm />
        </DialogContent>
      </DialogTrigger>
    </Dialog>
  );
}
