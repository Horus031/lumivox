Mình đã verify Phase 2 trên source mới nhất. `main` đang ở `56fa689`, `product-release` ở `115821a`, nhưng cả hai cùng tree SHA `16ae592…`; `/workspace`, Goal rail, 6 lanes, task drawer, `defaultGoalId`, navigation và i18n đều đã merge đúng. **Phase 2 PASS ở mức code/repository.**

Bây giờ sang **Phase 3 — Kanban interactions, drag & drop, transition service, optimistic UI và Overdue semantics**. Đây là phase quan trọng nhất từ đầu đến giờ vì từ đây status không còn chỉ là field để edit nữa mà trở thành **workflow có luật**.

## 1. Scope Phase 3

Sau phase này, user sẽ làm được:

```text
Todo ─────────► In Progress ─────────► Completed
 │                   │                     │
 └────► Cancelled ◄──┘                     │
                      ◄──── Reopen ─────────┘

Overdue
  = system-derived lane

In Review
  = AI-managed lane
  = chưa mở drop trong Phase 3
```

User có thể kéo task giữa các workflow lane hợp lệ.

Nhưng:

```text
Overdue
```

không phải drop target.

Và:

```text
In Review
```

chưa phải drop target cho đến khi AI Review backend tồn tại.

Đây là chủ ý, không phải thiếu feature.

---

# 2. Tạo branch

```bash
git checkout product-release
git pull origin product-release

git checkout -b feat/workspace-phase-3-kanban-interactions
```

---

# 3. Dùng dnd-kit bản hiện tại, không dùng API legacy

Repo của bạn hiện chưa có drag/drop dependency.

Hiện tại tài liệu dnd-kit mới dùng:

```text
@dnd-kit/react
DragDropProvider
useDraggable
useDroppable
```

thay vì architecture legacy `@dnd-kit/core + DndContext`. Package mới cũng có Pointer và Keyboard sensors mặc định, và hỗ trợ drag handle riêng. [dnd kit](https://dndkit.com/react/guides/sensors/?utm_source=chatgpt.com)

Trong:

```bash
cd apps/web
npm install @dnd-kit/react
```

Phase này chưa cần `@dnd-kit/helpers`, bởi mình **chưa muốn support manual ordering trong cùng lane**.

Task vẫn order theo:

```text
due_at ASC
created_at DESC
```

như query hiện tại.

Phase này drag nghĩa là:

> đổi workflow lane/status.

Không phải:

> kéo Task A lên trên Task B rồi persist arbitrary ordering.

Cách này giữ Phase 3 tập trung vào domain correctness trước.

---

# 4. Tạo domain transition layer

Tạo:

```text
apps/web/features/tasks/task-transition.ts
```

Đây sẽ là nguồn sự thật về workflow.

```ts
import type { TaskStatus } from "./task-status";

export const DIRECT_TASK_STATUS_TARGETS = [
  "todo",
  "in_progress",
  "completed",
  "cancelled",
] as const satisfies readonly TaskStatus[];

export type DirectTaskStatus =
  (typeof DIRECT_TASK_STATUS_TARGETS)[number];

type BoardStatusInput = {
  status: TaskStatus;
  due_at: string | null;
};

export function getTaskBoardStatus(
  task: BoardStatusInput,
  referenceNow: Date,
): TaskStatus {
  if (
    task.status === "completed" ||
    task.status === "cancelled" ||
    task.status === "in_review"
  ) {
    return task.status;
  }

  const dueAt = task.due_at
    ? new Date(task.due_at)
    : null;

  if (
    dueAt &&
    Number.isFinite(dueAt.getTime()) &&
    dueAt.getTime() < referenceNow.getTime()
  ) {
    return "overdue";
  }

  // Backward compatibility for old rows whose persisted
  // status was manually stored as overdue.
  if (task.status === "overdue") {
    return "in_progress";
  }

  return task.status;
}
```

Điểm quan trọng:

```text
database status != board status
```

trong trường hợp overdue.

Ví dụ DB:

```text
status = in_progress
due_at = yesterday
```

Board:

```text
Overdue
```

Đó mới là semantics đúng.

---

# 5. Define transition matrix

Cũng trong `task-transition.ts`:

```ts
const DIRECT_TRANSITIONS: Record<
  TaskStatus,
  readonly DirectTaskStatus[]
> = {
  todo: [
    "in_progress",
    "completed",
    "cancelled",
  ],

  in_progress: [
    "todo",
    "completed",
    "cancelled",
  ],

  completed: [
    "in_progress",
  ],

  cancelled: [
    "todo",
    "in_progress",
  ],

  overdue: [
    "completed",
    "cancelled",
  ],

  in_review: [],
};

export function canDirectlyTransitionTask(
  from: TaskStatus,
  to: DirectTaskStatus,
) {
  if (from === to) {
    return false;
  }

  return DIRECT_TRANSITIONS[from].includes(to);
}
```

Lý do mình chọn matrix này:

```text
Completed → In Progress
```

là reopen.

Không cho:

```text
Completed → Todo
```

trực tiếp vì một task đã hoàn thành mà mở lại nghĩa là đang cần work tiếp.

`Cancelled → Todo/In Progress` cho phép restore.

---

# 6. Tạo schema riêng cho transition

Trong:

```text
task.schemas.ts
```

thêm:

```ts
import {
  DIRECT_TASK_STATUS_TARGETS,
} from "./task-transition";
```

rồi:

```ts
export const transitionTaskStatusSchema =
  z.object({
    taskId: z.string().uuid(
      "Invalid task id.",
    ),

    targetStatus: z.enum(
      DIRECT_TASK_STATUS_TARGETS,
    ),

    expectedStatus: z.enum(
      TASK_STATUS_VALUES,
    ),

    expectedUpdatedAt: z.string().min(1),
  });

export type TransitionTaskStatusInput =
  z.infer<
    typeof transitionTaskStatusSchema
  >;
```

Hai field:

```text
expectedStatus
expectedUpdatedAt
```

dùng cho optimistic concurrency.

Nếu hai browser tabs cùng edit task, tab cũ không được silently overwrite tab mới.

---

# 7. Tạo `transitionTaskStatusAction()`

Trong:

```text
apps/web/features/tasks/task.actions.ts
```

thêm action riêng.

Pseudo implementation:

```ts
export async function transitionTaskStatusAction(
  input: TransitionTaskStatusInput,
): Promise<
  ActionResult<{
    taskId: string;
    status: TaskStatus;
    completedAt: string | null;
    updatedAt: string;
  }>
> {
```

Flow bên trong:

```text
validate
  ↓
requireUser()
  ↓
fetch task
  ↓
verify ownership via RLS + user_id
  ↓
verify expectedStatus
  ↓
verify expectedUpdatedAt
  ↓
calculate effective board status
  ↓
validate transition matrix
  ↓
atomic conditional UPDATE
  ↓
schedule engagement side effect
```

Fetch:

```ts
const { data: existingTask } =
  await supabase
    .from("tasks")
    .select(
      `
        id,
        user_id,
        status,
        due_at,
        completed_at,
        updated_at
      `,
    )
    .eq("id", taskId)
    .eq("user_id", user.id)
    .maybeSingle();
```

Sau đó:

```ts
const boardStatus =
  getTaskBoardStatus(
    existingTask,
    new Date(),
  );
```

Validate:

```ts
if (
  !canDirectlyTransitionTask(
    boardStatus,
    targetStatus,
  )
) {
  return {
    success: false,
    message:
      "This task cannot move to that stage.",
  };
}
```

---

# 8. Completed timestamp phải nằm ở transition service

Patch:

```ts
const completedAt =
  targetStatus === "completed"
    ? new Date().toISOString()
    : null;
```

Sau đó update bằng optimistic concurrency:

```ts
const {
  data: updatedTask,
  error,
} = await supabase
  .from("tasks")
  .update({
    status: targetStatus,
    completed_at: completedAt,
  })
  .eq("id", taskId)
  .eq("user_id", user.id)
  .eq(
    "status",
    expectedStatus,
  )
  .eq(
    "updated_at",
    expectedUpdatedAt,
  )
  .select(
    `
      id,
      status,
      completed_at,
      updated_at
    `,
  )
  .maybeSingle();
```

Nếu:

```ts
!updatedTask
```

thì:

```text
Task changed somewhere else.
Refresh and try again.
```

Không overwrite.

---

# 9. Engagement side effect bắt buộc giữ lại

Hiện `updateTaskAction()` đang có logic rất đúng:

```text
not completed → completed
  ↓
scheduleEngagementRecalculation(activity)
```

và:

```text
completed → something else
  ↓
full reconciliation
```

Logic này phải chuyển sang transition action.

```ts
if (
  targetStatus === "completed" &&
  existingTask.status !== "completed"
) {
  scheduleEngagementRecalculation({
    userId: user.id,
    source: "task-transition",
    activity: {
      type: "task",
      id: taskId,
    },
  });
} else if (
  existingTask.status === "completed" &&
  targetStatus !== "completed"
) {
  scheduleEngagementRecalculation({
    userId: user.id,
    source: "task-transition",
  });
}
```

Không được để Kanban gọi:

```ts
supabase
  .from("tasks")
  .update(...)
```

trực tiếp.

Board chỉ được gọi:

```text
transitionTaskStatusAction()
```

---

# 10. Chặn `In Review` từ server, không chỉ UI

Schema transition chỉ cho:

```text
todo
in_progress
completed
cancelled
```

nên request:

```text
targetStatus = in_review
```

sẽ fail validation.

Điều này rất quan trọng.

Không bao giờ dựa vào:

```text
disabled UI
```

để bảo vệ business rule.

Phase 5 chúng ta mới thêm:

```text
requestTaskReviewAction()
```

chứ cũng không đơn giản thêm `in_review` vào direct targets.

---

# 11. Chặn `Overdue` tương tự

User không bao giờ gửi:

```text
targetStatus = overdue
```

nữa.

`overdue` trở thành derived status trên board.

Tuy nhiên enum DB vẫn giữ:

```text
overdue
```

để backward compatibility.

Không migration enum.

Không rewrite toàn bộ existing rows trong phase này.

---

# 12. Update workspace grouping

Hiện:

```ts
groups[task.status].push(task);
```

trong:

```text
workspace.utils.ts
```

phải đổi.

```ts
import {
  getTaskBoardStatus,
} from "@/features/tasks/task-transition";
```

Sau đó:

```ts
export function groupWorkspaceTasksByStatus(
  tasks: WorkspaceTask[],
  referenceNow: Date,
): Record<
  TaskStatus,
  WorkspaceTask[]
> {
  const groups =
    Object.fromEntries(
      TASK_BOARD_LANES.map(
        (status) => [
          status,
          [],
        ],
      ),
    ) as Record<
      TaskStatus,
      WorkspaceTask[]
    >;

  for (const task of tasks) {
    const status =
      getTaskBoardStatus(
        task,
        referenceNow,
      );

    groups[status].push(task);
  }

  return groups;
}
```

---

# 13. Không dùng `Date.now()` trực tiếp trong first render

Để tránh server/client lệch lúc hydrate, trong:

```text
/workspace/page.tsx
```

tạo:

```ts
const referenceNow =
  new Date().toISOString();
```

rồi:

```tsx
<WorkspaceBoard
  tasks={tasks}
  scope={scope}
  referenceNow={referenceNow}
/>
```

Client:

```ts
const boardNow = useMemo(
  () => new Date(referenceNow),
  [referenceNow],
);
```

---

# 14. Update tests cho derived Overdue

Trong:

```text
workspace.utils.test.ts
```

thêm test:

```text
todo + past due → overdue
in_progress + past due → overdue
completed + past due → completed
cancelled + past due → cancelled
in_review + past due → in_review
legacy overdue + future due → in_progress
```

Đặc biệt:

```text
In Review > Overdue
```

về precedence.

Sau này task đang AI Review dù deadline qua vẫn nằm ở:

```text
In Review
```

không biến mất khỏi assessment flow.

---

# 15. Refactor `WorkspaceTaskCard`

Hiện card của bạn là một `<button>` toàn bộ.

Không được nhét drag-handle button vào trong button vì sẽ thành nested interactive elements.

Đổi outer thành:

```tsx
<article>
```

Structure:

```text
article
├── button: mở Task Detail
└── button: drag handle
```

Thêm:

```ts
import {
  useDraggable,
} from "@dnd-kit/react";

import {
  GripVertical,
} from "lucide-react";
```

Hook:

```ts
const draggable = useDraggable({
  id: `task:${task.id}`,
  type: "workspace-task",
  disabled,
  data: {
    taskId: task.id,
  },
});
```

Outer:

```tsx
<article
  ref={draggable.ref}
  className={cn(
    "...",
    draggable.isDragging &&
      "opacity-60",
  )}
>
```

Drag handle:

```tsx
<button
  ref={draggable.handleRef}
  type="button"
  aria-label={t("dragTask")}
  className="..."
>
  <GripVertical className="h-4 w-4" />
</button>
```

Current dnd-kit explicitly supports `handleRef` for this pattern. [dnd kit](https://dndkit.com/react/hooks/use-sortable/?utm_source=chatgpt.com)

---

# 16. Refactor Lane thành droppable

Trong:

```text
workspace-lane.tsx
```

thêm:

```ts
import {
  useDroppable,
} from "@dnd-kit/react";
```

Determine:

```ts
const isDropEnabled =
  status === "todo" ||
  status === "in_progress" ||
  status === "completed" ||
  status === "cancelled";
```

Sau đó:

```ts
const droppable = useDroppable({
  id: `lane:${status}`,
  type: "workspace-lane",
  accept: "workspace-task",
  disabled: !isDropEnabled,
  data: {
    status,
  },
});
```

`useDroppable` hiện support `disabled` và `accept`, rất phù hợp để lock `Overdue` và `In Review`. [dnd kit](https://dndkit.com/react/hooks/use-droppable/?utm_source=chatgpt.com)

Section:

```tsx
<section
  ref={droppable.ref}
  data-status={status}
  className={cn(
    "...",
    droppable.isDropTarget &&
      "ring-2 ring-primary/40",
  )}
>
```

---

# 17. Lane nào locked?

Hiển thị icon/text nhẹ cho:

```text
In Review
```

> AI-managed stage

và:

```text
Overdue
```

> Automatically determined by deadline

Thêm EN:

```json
"reviewManaged": "AI-managed stage",
"overdueManaged": "Automatically determined by deadline",
"dragTask": "Drag task"
```

VI:

```json
"reviewManaged": "Giai đoạn do AI quản lý",
"overdueManaged": "Tự động xác định theo thời hạn",
"dragTask": "Kéo nhiệm vụ"
```

---

# 18. Upgrade `WorkspaceBoard`

Board sẽ từ:

```text
render-only
```

thành:

```text
optimistic workflow controller
```

Imports:

```ts
import {
  DragDropProvider,
} from "@dnd-kit/react";

import {
  useRouter,
} from "next/navigation";

import {
  toast,
} from "sonner";
```

State:

```ts
const [boardTasks, setBoardTasks] =
  useState(tasks);

const [isPending, startTransition] =
  useTransition();
```

Sync khi server refresh:

```ts
useEffect(() => {
  setBoardTasks(tasks);
}, [tasks]);
```

Grouping dùng:

```ts
boardTasks
```

thay vì props `tasks`.

---

# 19. DragEnd flow

Concept:

```ts
function handleDragEnd(event) {
  if (event.canceled) {
    return;
  }

  const { source, target } =
    event.operation;

  if (!source || !target) {
    return;
  }

  const taskId = String(
    source.id,
  ).replace("task:", "");

  const targetValue = String(
    target.id,
  );

  if (
    !targetValue.startsWith(
      "lane:",
    )
  ) {
    return;
  }

  const targetStatus =
    targetValue.replace(
      "lane:",
      "",
    );
}
```

Sau đó lấy task:

```ts
const task =
  boardTasks.find(
    (item) =>
      item.id === taskId,
  );
```

Current board status:

```ts
const currentStatus =
  getTaskBoardStatus(
    task,
    boardNow,
  );
```

Validate client:

```ts
if (
  !isDirectTaskStatusTarget(
    targetStatus,
  ) ||
  !canDirectlyTransitionTask(
    currentStatus,
    targetStatus,
  )
) {
  toast.error(
    t("invalidTransition"),
  );

  return;
}
```

Server vẫn validate lần nữa.

---

# 20. Optimistic movement

Trước request:

```ts
const previousTasks =
  boardTasks;
```

Optimistic patch:

```ts
setBoardTasks((current) =>
  current.map((item) =>
    item.id === taskId
      ? {
          ...item,
          status:
            targetStatus,
          completed_at:
            targetStatus ===
            "completed"
              ? new Date().toISOString()
              : null,
        }
      : item,
  ),
);
```

Sau đó:

```ts
startTransition(
  async () => {
    const result =
      await transitionTaskStatusAction({
        taskId:
          task.id,

        targetStatus,

        expectedStatus:
          task.status,

        expectedUpdatedAt:
          task.updated_at,
      });

    if (!result.success) {
      setBoardTasks(
        previousTasks,
      );

      toast.error(
        result.message,
      );

      router.refresh();

      return;
    }

    router.refresh();
  },
);
```

Đây là model:

```text
drag
 ↓
UI moves immediately
 ↓
server validates
 ↓
success → server truth
fail    → rollback
```

---

# 21. Wrap bằng `DragDropProvider`

```tsx
<DragDropProvider
  onDragEnd={
    handleDragEnd
  }
>
  <div className="...">
    {TASK_BOARD_LANES.map(
      ...
    )}
  </div>
</DragDropProvider>
```

Pointer + keyboard support có sẵn mặc định trong provider hiện tại của dnd-kit. [dnd kit](https://dndkit.com/react/guides/sensors/?utm_source=chatgpt.com)

---

# 22. Overdue drag behavior

Một task đang:

```text
due yesterday
status = in_progress
```

sẽ nằm trong:

```text
Overdue
```

User có thể kéo:

```text
Overdue → Completed
```

hoặc:

```text
Overdue → Cancelled
```

Nhưng không:

```text
Overdue → Todo
Overdue → In Progress
```

Vì nếu deadline vẫn ở quá khứ thì kéo như vậy không giải quyết overdue.

Muốn task quay lại In Progress lane, user phải:

```text
reschedule due date
```

Khi `due_at > now`:

```text
effective status =
in_progress
```

và task tự trở lại lane phù hợp.

Đây là UX mình muốn.

---

# 23. Sửa legacy `/tasks`

Hiện dropdown vẫn cho user chọn:

```text
overdue
```

Phase 3 là lúc phải bỏ quyền này.

Trong:

```text
tasks-table.tsx
```

Selectable:

```text
Todo
In Progress
Completed
Cancelled
```

Với existing:

```text
overdue
in_review
```

có thể render option disabled:

```tsx
<SelectItem
  value="overdue"
  disabled
>
  {formT(
    "statuses.overdue",
  )}
</SelectItem>
```

và:

```tsx
<SelectItem
  value="in_review"
  disabled
>
  {formT(
    "statuses.in_review",
  )}
</SelectItem>
```

Như vậy legacy UI vẫn đọc được existing task nhưng không tạo status không hợp lệ.

---

# 24. `updateTaskAction()` cũng phải dùng transition rules

Đây là phần rất quan trọng.

Nếu board dùng transition service nhưng `/tasks` vẫn gọi:

```text
generic update
```

và có thể bypass rules thì architecture chưa thật sự centralized.

Giữ `updateTaskAction()` hiện tại để tránh refactor lớn, nhưng trước khi update status:

```ts
if (
  status !==
  existingTask.status
) {
  // validate through the same
  // transition domain logic
}
```

Nếu target là:

```text
overdue
in_review
```

reject.

Nếu invalid matrix:

```text
reject
```

Như vậy cả:

```text
Workspace DnD
Legacy Tasks page
```

đều obey cùng workflow rules.

---

# 25. Inline Create Task trong Todo

Tạo:

```text
workspace-quick-create-task.tsx
```

UX:

```text
Todo
──────────────
+ Add task

[ Task title........ ]
[ Add ] [ Cancel ]
```

Props:

```ts
type Props = {
  goalId: string | null;
};
```

Submit dùng action hiện có:

```ts
await createTaskAction({
  title,
  description: "",
  goalId:
    goalId ?? "",
  priority: "medium",
  estimatedMinutes:
    undefined,
  dueAt: "",
});
```

Sau success:

```ts
setTitle("");
router.refresh();
```

Không cần tạo action thứ hai.

---

# 26. Goal khi Quick Create

Trong Workspace:

```text
Goal A selected
```

→ quick task:

```text
goal_id = Goal A
```

`No Goal`:

```text
goal_id = null
```

`All Tasks`:

```text
goal_id = null
```

Mình chọn behavior này để quick-create thực sự nhanh.

Nếu muốn chọn Goal chi tiết thì dùng nút:

```text
+ Task
```

trên header như hiện tại.

---

# 27. Pass `scope` vào Board

Page:

```tsx
<WorkspaceBoard
  tasks={tasks}
  scope={scope}
  referenceNow={
    new Date().toISOString()
  }
/>
```

Board:

```ts
const quickCreateGoalId =
  scope.type === "goal"
    ? scope.goalId
    : null;
```

Rồi chỉ render quick create ở:

```text
Todo
```

---

# 28. Fix Dashboard status semantics

Mình tìm thấy `get_my_dashboard_activity()` hiện đang có:

```sql
COUNT(*) FILTER (
  WHERE t.status = 'overdue'
) AS overdue_count
```

Sau Phase 3 cái này sẽ sai.

Native Task Risk của bạn đã tính overdue theo deadline, PBI deadline adherence cũng dựa trên deadline; Dashboard nên đồng bộ semantics.

Tạo migration bằng CLI, đừng tự đặt timestamp filename:

```bash
npx supabase migration new update_task_status_semantics
```

Theo workflow Supabase hiện tại, việc tạo migration bằng CLI thay vì tự chế filename là hướng an toàn hơn. Supabase cũng đang chuyển sang explicit Data API grants cho objects mới, dự kiến enforcement với existing projects từ **30/10/2026**, nên về sau mỗi table/function mới chúng ta sẽ explicit grant thay vì dựa default. [Supabase](https://supabase.com/changelog?types=breaking-change\&utm_source=chatgpt.com)

Trong migration mới, copy definition hiện tại của:

```sql
public.get_my_dashboard_activity
```

và sửa phần task-status aggregation.

Todo:

```sql
count(*) filter (
  where t.status = 'todo'
    and not (
      t.due_at is not null
      and t.due_at < now()
    )
)::int as todo_count,
```

In Progress:

```sql
count(*) filter (
  where t.status in (
    'in_progress',
    'overdue'
  )
    and not (
      t.due_at is not null
      and t.due_at < now()
    )
)::int as in_progress_count,
```

Review:

```sql
count(*) filter (
  where t.status = 'in_review'
)::int as in_review_count,
```

Overdue:

```sql
count(*) filter (
  where t.status not in (
    'completed',
    'cancelled',
    'in_review'
  )
    and t.due_at is not null
    and t.due_at < now()
)::int as overdue_count,
```

Completed và Cancelled giữ nguyên.

---

# 29. Dashboard JSON thêm In Review

Hiện array là:

```text
Todo
In Progress
Completed
Overdue
Cancelled
```

đổi:

```sql
'taskStatusBreakdown',
jsonb_build_array(
  jsonb_build_object(
    'status',
    'Todo',
    'count',
    ts.todo_count
  ),
  jsonb_build_object(
    'status',
    'In Progress',
    'count',
    ts.in_progress_count
  ),
  jsonb_build_object(
    'status',
    'In Review',
    'count',
    ts.in_review_count
  ),
  jsonb_build_object(
    'status',
    'Completed',
    'count',
    ts.completed_count
  ),
  jsonb_build_object(
    'status',
    'Overdue',
    'count',
    ts.overdue_count
  ),
  jsonb_build_object(
    'status',
    'Cancelled',
    'count',
    ts.cancelled_count
  )
)
```

`TaskStatusChart` hiện render generic `status:string`, nên không cần refactor architecture chart.

---

# 30. Update tone cho `in_review`

Hiện:

```text
getStatusTone()
```

không có `in_review`.

Nó đang rơi xuống fallback Todo/amber.

Thêm:

```ts
if (
  status ===
  "in_review"
) {
  return "bg-violet-500/10 text-violet-700 border-violet-500/15";
}
```

Như vậy drawer cũng phân biệt Review rõ ràng.

---

# 31. Không chạm PBI và Weekly Reflection trong Phase 3

Mình vẫn giữ chúng sang Phase 7.

Điều tốt là PBI deadline adherence hiện đã nhìn:

```text
due_at
completed_at
```

và native task-risk cũng đã derive overdue từ deadline, nên board semantics mới đang đưa UI gần hơn với analytics hiện tại chứ không ngược lại.

Riêng Dashboard là chỗ mình muốn sửa ngay vì nó trực tiếp hiển thị status distribution cho user.

---

# 32. Tests bắt buộc

Phase này mình muốn tăng test hơn Phase 2.

Ít nhất test:

```text
getTaskBoardStatus
canDirectlyTransitionTask
workspace grouping
```

Cases quan trọng:

```text
todo → in_progress          allowed
todo → overdue              impossible target

in_progress → completed     allowed
in_progress → in_review     impossible direct target

completed → in_progress     allowed
completed → todo            rejected

cancelled → todo            allowed

overdue → completed         allowed
overdue → in_progress       rejected

in_review → anything        rejected
```

Và:

```text
past due todo → board overdue
past due review → board in_review
```

---

# 33. Acceptance criteria Phase 3

Phase 3 chỉ PASS khi:

- Task có drag handle rõ ràng;
- click card vẫn mở drawer và không vô tình drag;
- Todo ↔ In Progress hoạt động;
- Todo/In Progress → Completed hoạt động;
- Completed → In Progress reopen được;
- cancel/restore theo matrix hoạt động;
- optimistic UI move ngay, rollback nếu action fail;
- concurrent stale update không overwrite task mới hơn;
- `completed_at` chỉ được quản lý bởi transition logic;
- completion/reopen vẫn trigger engagement recalculation;
- user không thể drag vào `In Review`;
- user không thể drag vào `Overdue`;
- overdue được derive từ `due_at`;
- reschedule task overdue sang future khiến nó trở lại workflow lane;
- dashboard overdue count dùng deadline semantics;
- dashboard có In Review;
- quick create xuất hiện ở Todo;
- quick create trong selected Goal tự gắn Goal đó;
- `/tasks` không còn cho set Overdue/In Review thủ công;
- `/goals` và existing functionality không regress;
- EN/VI đầy đủ;
- keyboard drag vẫn hoạt động;
- lint/test/build pass.