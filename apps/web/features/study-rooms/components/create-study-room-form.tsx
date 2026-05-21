"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { createStudyRoomAction } from "@/features/study-rooms/study-room.actions";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function CreateStudyRoomForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [maxParticipants, setMaxParticipants] = useState("20");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    startTransition(async () => {
      const result = await createStudyRoomAction({
        title,
        description,
        visibility,
        maxParticipants: Number(maxParticipants),
      });

      if (!result.success) {
        toast.error(result.message);
        return;
      }

      toast.success(result.message);

      setTitle("");
      setDescription("");
      setVisibility("public");
      setMaxParticipants("20");

      router.push(`/rooms/${result.data.roomId}`);
      router.refresh();
    });
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button">Create Rooms</Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Create a study room</DialogTitle>
            <DialogDescription>
              Open a collaborative space where learners can study together.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <Label>Room title</Label>
              <Input
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Final Project Sprint Room"
              />
            </Field>
            <Field>
              <Label>Description</Label>
              <Textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="A focused room for evening study sessions."
                rows={3}
              />
            </Field>
            <FieldGroup className="flex-row gap-4">
              <Field>
                <Label>Visibility</Label>

                <Select
                  value={visibility ?? ""}
                  onValueChange={(value) =>
                    setVisibility(value as "public" | "private")
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Visibility" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Visibilities</SelectLabel>
                      <SelectItem value="public">Public room</SelectItem>
                      <SelectItem value="private">Private room</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
                {/* <select
                value={visibility}
                onChange={(event) =>
                  setVisibility(event.target.value as "public" | "private")
                }
                className="w-full rounded-xl border px-3 py-2.5 outline-none transition focus:border-neutral-900"
              >
                <option value="public">Public room</option>
                <option value="private">Private room</option>
              </select> */}
              </Field>

              <Field>
                <Label>Max participants</Label>
                <Input
                  type="number"
                  min={2}
                  max={100}
                  value={maxParticipants}
                  onChange={(event) => setMaxParticipants(event.target.value)}
                />
              </Field>
            </FieldGroup>
          </FieldGroup>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant={"outline"}>Cancel</Button>
            </DialogClose>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Creating room..." : "Create room"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    // <section className="rounded-2xl border bg-white p-6 shadow-sm">
    //   <div className="mb-5">
    //     <h2 className="text-xl font-semibold">Create a study room</h2>
    //     <p className="mt-1 text-sm text-neutral-600">
    //       Open a collaborative space where learners can study together.
    //     </p>
    //   </div>

    //   <form onSubmit={handleSubmit} className="space-y-4">
    //     <div>
    //       <label className="mb-1.5 block text-sm font-medium">Room title</label>
    //       <input
    //         type="text"
    //         value={title}
    //         onChange={(event) => setTitle(event.target.value)}
    //         placeholder="Final Project Sprint Room"
    //         className="w-full rounded-xl border px-3 py-2.5 outline-none transition focus:border-neutral-900"
    //       />
    //     </div>

    //     <div>
    //       <label className="mb-1.5 block text-sm font-medium">
    //         Description
    //       </label>
    //       <textarea
    //         value={description}
    //         onChange={(event) => setDescription(event.target.value)}
    //         placeholder="A focused room for evening study sessions."
    //         rows={3}
    //         className="w-full rounded-xl border px-3 py-2.5 outline-none transition focus:border-neutral-900"
    //       />
    //     </div>

    //     <div className="grid gap-4 md:grid-cols-2">
    //       <div>
    //         <label className="mb-1.5 block text-sm font-medium">
    //           Visibility
    //         </label>
    //         <select
    //           value={visibility}
    //           onChange={(event) =>
    //             setVisibility(event.target.value as "public" | "private")
    //           }
    //           className="w-full rounded-xl border px-3 py-2.5 outline-none transition focus:border-neutral-900"
    //         >
    //           <option value="public">Public room</option>
    //           <option value="private">Private room</option>
    //         </select>
    //       </div>

    //       <div>
    //         <label className="mb-1.5 block text-sm font-medium">
    //           Max participants
    //         </label>
    //         <input
    //           type="number"
    //           min={2}
    //           max={100}
    //           value={maxParticipants}
    //           onChange={(event) => setMaxParticipants(event.target.value)}
    //           className="w-full rounded-xl border px-3 py-2.5 outline-none transition focus:border-neutral-900"
    //         />
    //       </div>
    //     </div>

    //     <button
    //       type="submit"
    //       disabled={isPending}
    //       className="rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
    //     >
    //       {isPending ? "Creating room..." : "Create room"}
    //     </button>
    //   </form>
    // </section>
  );
}
