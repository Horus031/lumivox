"use client";

import { FormEvent, useId, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { createStudyRoomAction } from "@/features/study-rooms/study-room.actions";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function CreateStudyRoomForm() {
  const router = useRouter();
  const t = useTranslations("rooms.createForm");
  const id = useId();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [maxParticipants, setMaxParticipants] = useState("20");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await createStudyRoomAction({ title, description, visibility, maxParticipants: Number(maxParticipants) });
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      setTitle("");
      setDescription("");
      setVisibility("public");
      setMaxParticipants("20");
      setOpen(false);
      router.push(`/rooms/${result.data.roomId}`);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button type="button"><Plus aria-hidden="true" />{t("trigger")}</Button></DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto p-card [&>[data-slot=dialog-close]]:top-1 [&>[data-slot=dialog-close]]:right-1 [&>[data-slot=dialog-close]]:grid [&>[data-slot=dialog-close]]:size-touch [&>[data-slot=dialog-close]]:place-items-center sm:[&>[data-slot=dialog-close]]:size-control">
        <form onSubmit={handleSubmit} aria-busy={isPending} className="min-w-0 space-y-card">
          <DialogHeader className="pr-10 text-left">
            <DialogTitle className="text-section">{t("title")}</DialogTitle>
            <DialogDescription>{t("description")}</DialogDescription>
          </DialogHeader>
          <fieldset disabled={isPending} className="min-w-0 space-y-card">
            <div className="space-y-2">
              <Label htmlFor={`${id}-title`}>{t("fields.title")}</Label>
              <Input id={`${id}-title`} value={title} onChange={(event) => setTitle(event.target.value)} required minLength={3} maxLength={100} placeholder={t("placeholders.title")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${id}-description`}>{t("fields.description")}</Label>
              <Textarea id={`${id}-description`} value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} placeholder={t("placeholders.description")} rows={3} />
            </div>
            <div className="grid gap-card sm:grid-cols-2">
              <div className="min-w-0 space-y-2">
                <Label htmlFor={`${id}-visibility`}>{t("fields.visibility")}</Label>
                <Select value={visibility} onValueChange={(value) => setVisibility(value as "public" | "private")} disabled={isPending}>
                  <SelectTrigger id={`${id}-visibility`} className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public">{t("visibility.public")}</SelectItem>
                    <SelectItem value="private">{t("visibility.private")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-0 space-y-2">
                <Label htmlFor={`${id}-capacity`}>{t("fields.maxParticipants")}</Label>
                <Input id={`${id}-capacity`} type="number" min={2} max={100} step={1} required value={maxParticipants} onChange={(event) => setMaxParticipants(event.target.value)} />
              </div>
            </div>
          </fieldset>
          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="outline" disabled={isPending}>{t("cancel")}</Button></DialogClose>
            <Button type="submit" disabled={isPending}><Plus aria-hidden="true" />{isPending ? t("creating") : t("create")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
