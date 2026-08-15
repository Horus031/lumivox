"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { shareLearningDocumentByEmailAction } from "@/features/learning-documents/learning-document-sharing.actions";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

type ShareDocumentFormProps = {
  documentId: string;
};

export function ShareDocumentForm({ documentId }: ShareDocumentFormProps) {
  const router = useRouter();
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
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border bg-background p-6 shadow-sm space-y-4"
    >
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Share by Email
        </p>

        <h2 className="mt-2 text-2xl font-bold tracking-tight text-foreground">
          Grant document access
        </h2>

        <p className="mt-2 text-sm text-muted-foreground">
          Add the email address of a Lumivox user who should be allowed to
          access this document.
        </p>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-[1fr_180px]">
        <div>
          <Label>Email</Label>

          <Input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            required
            placeholder="friend@example.com"
          />
        </div>

        <div>
          <Label>Role</Label>

          <Select
            value={role}
            onValueChange={(value) => setRole(value as "viewer" | "editor")}
          >
            <SelectTrigger className="w-full max-w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Roles</SelectLabel>
                <SelectItem value="viewer">Viewer</SelectItem>
                <SelectItem value="editor">Editor</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? "Sharing..." : "Share Document"}
      </Button>
    </form>
  );
}
