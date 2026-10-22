import Link from "next/link";
import { completeTask } from "@/app/(app)/tasks/actions";
import { dueLabel, saDate } from "@/lib/crm/dates";

export type TaskRow = {
  id: string;
  title: string;
  due_on: string;
  person?: { id: string; name: string } | null;
};

export default function TaskItem({ task, today = saDate() }: { task: TaskRow; today?: string }) {
  const overdue = task.due_on < today;
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <form action={completeTask}>
        <input type="hidden" name="task_id" value={task.id} />
        <button
          type="submit"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-line hover:border-accent"
          aria-label={`Mark "${task.title}" as done`}
          title="Mark as done"
        />
      </form>
      <div className="min-w-0 flex-1">
        <p className="break-words font-medium">{task.title}</p>
        <p className="text-sm text-ink-soft">
          <span className={overdue ? "text-danger" : ""}>{dueLabel(task.due_on, today)}</span>
          {task.person && (
            <>
              {" · "}
              <Link href={`/people/${task.person.id}`} className="link">
                {task.person.name}
              </Link>
            </>
          )}
        </p>
      </div>
    </li>
  );
}
