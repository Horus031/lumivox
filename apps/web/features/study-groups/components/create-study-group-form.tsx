"use client";

import { useId, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";

import { createStudyGroupAction } from "@/features/study-groups/study-group.actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function CreateStudyGroupForm() {
  const router = useRouter();
  const t = useTranslations("groups.createForm");
  const id = useId();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    startTransition(async () => {
      const result = await createStudyGroupAction({
        title,
        description,
      });

      if (!result.success) {
        toast.error(result.message);
        return;
      }

      toast.success(result.message);
      setTitle("");
      setDescription("");
      setOpen(false);

      if (result.data?.groupId) {
        router.push(`/groups/${result.data.groupId}`);
        return;
      }

      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button"><Plus aria-hidden="true" />{t("create")}</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto p-card [&>[data-slot=dialog-close]]:top-1 [&>[data-slot=dialog-close]]:right-1 [&>[data-slot=dialog-close]]:grid [&>[data-slot=dialog-close]]:size-touch [&>[data-slot=dialog-close]]:place-items-center sm:[&>[data-slot=dialog-close]]:size-control">
        <form onSubmit={handleSubmit} aria-busy={isPending} className="min-w-0 space-y-card">
          <DialogHeader className="pr-10 text-left">
            <DialogTitle className="text-section">{t("title")}</DialogTitle>
            <DialogDescription>{t("description")}</DialogDescription>
          </DialogHeader>
          <fieldset disabled={isPending} className="min-w-0 space-y-card">
            <div className="space-y-2">
              <Label htmlFor={`${id}-name`}>{t("fields.name")}</Label>
              <Input
                id={`${id}-name`} value={title} onChange={(event) => setTitle(event.target.value)}
                required minLength={2} maxLength={80} placeholder={t("placeholders.name")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${id}-description`}>{t("fields.description")}</Label>
              <Textarea
                id={`${id}-description`} value={description} onChange={(event) => setDescription(event.target.value)}
                rows={3} maxLength={500} placeholder={t("placeholders.description")}
              />
            </div>
          </fieldset>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isPending}>{t("cancel")}</Button>
            </DialogClose>
            <Button type="submit" disabled={isPending}>
              <Plus aria-hidden="true" />{isPending ? t("creating") : t("create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
