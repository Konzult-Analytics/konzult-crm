"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMfaSession } from "@/lib/auth/guard";
import { fields, optionalUuid, requiredDate, requiredText, type FormState } from "@/lib/crm/forms";
import { keysOf, TASK_KINDS } from "@/lib/crm/labels";

const taskSchema = z.object({
  title: requiredText(200),
  due_on: requiredDate,
  kind: z.enum(keysOf(TASK_KINDS)).default("other"),
  person_id: optionalUuid,
  journey_id: optionalUuid,
});

export async function addTask(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireMfaSession();
  const parsed = taskSchema.safeParse(fields(formData));
  if (!parsed.success) return { error: "A task needs a title and a due date." };

  const { error } = await supabase.from("tasks").insert(parsed.data);
  if (error) {
    console.error("add task failed", error);
    return { error: "Couldn't add the task. Try again." };
  }
  revalidatePath("/", "layout");
  return null;
}

export async function completeTask(formData: FormData): Promise<void> {
  const { supabase } = await requireMfaSession();
  const id = z.uuid().safeParse(formData.get("task_id"));
  if (!id.success) return;

  const { error } = await supabase
    .from("tasks")
    .update({ status: "done", completed_at: new Date().toISOString() })
    .eq("id", id.data)
    .eq("status", "open");
  if (error) console.error("complete task failed", error);
  revalidatePath("/", "layout");
}
