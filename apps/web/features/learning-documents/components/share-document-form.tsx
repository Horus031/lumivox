"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { UserPlus } from "lucide-react";

import { shareLearningDocumentByEmailAction } from "@/features/learning-documents/learning-document-sharing.actions";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

type ShareDocumentFormProps = {
  documentId: string;
};

export function ShareDocumentForm({ documentId }: ShareDocumentFormProps) {
  const router = useRouter();
  const t = useTranslations("documentUi");
  const id = useId();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"viewer" | "editor">("viewer");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    startTransition(async () => {
      const result = await shareLearningDocumentByEmailAction({
        documentId,
        userEmail: email,
        role,
      });

      if (!result.success) {
        toast.error(result.message);
        return;
      }

      toast.success(result.message);
      setEmail("");
      setRole("viewer");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} aria-busy={isPending} className="min-w-0 border-t border-border pt-card">
      <h2 className="text-section font-semibold">{t("shareTitle")}</h2>
      <fieldset disabled={isPending} className="mt-card grid min-w-0 gap-card sm:grid-cols-[minmax(0,1fr)_10rem] lg:grid-cols-[minmax(0,1fr)_10rem_auto] lg:items-end">
        <div className="min-w-0 space-y-2">
          <Label htmlFor={`${id}-email`}>{t("email")}</Label>
          <Input id={`${id}-email`} value={email} onChange={(event) => setEmail(event.target.value)} type="email" required placeholder="friend@example.com" />
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor={`${id}-role`}>{t("role")}</Label>
          <Select value={role} disabled={isPending} onValueChange={(value) => setRole(value as "viewer" | "editor")}>
            <SelectTrigger id={`${id}-role`} className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="viewer">{t("roles.viewer")}</SelectItem>
              <SelectItem value="editor">{t("roles.editor")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" disabled={isPending} className="justify-self-start"><UserPlus aria-hidden="true" />{isPending ? t("sharing") : t("share")}</Button>
      </fieldset>
    </form>
  );
}
