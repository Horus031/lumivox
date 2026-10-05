# Workspace Phase 3: Implementation Report

Triển khai theo `phase-3-instruction.md` trên branch
`feat/workspace-phase-3-kanban-interactions`. Branch, dependency `@dnd-kit/react`,
schema transition và domain matrix đã được user bắt đầu trước phiên này;
implementation tiếp tục trực tiếp từ các changes đó.

## Thay đổi

- `task-transition.ts`: nguồn chung cho direct targets, transition matrix,
  effective board status và completion timestamp. Không persist derived Overdue.
- `transitionTaskStatusAction`: validate input, authenticate, lọc ownership bằng
  `user_id` cùng RLS, kiểm tra version, validate effective status và conditional
  UPDATE theo cả `expectedStatus` lẫn `expectedUpdatedAt`. Trả version mới về UI.
- `updateTaskAction`: áp dụng cùng domain rules và concurrency guard cho legacy
  editor. Bỏ quyền nhập `completedAt`; completion được server tạo khi hoàn thành,
  giữ nguyên khi sửa metadata, và xóa khi reopen.
- Completion/reopen tiếp tục schedule incremental activity/full engagement
  reconciliation bằng background helper hiện có, với source `task-transition`.
- Workspace dùng `DragDropProvider`, `useDraggable`, `useDroppable` của
  `@dnd-kit/react`; không dùng legacy core hay sortable/manual ordering.
- Card là `article`, có hai button ngang cấp: mở drawer và drag handle. Handle
  có nhãn/tooltip; pending request và In Review khóa drag.
- Chỉ Todo, In Progress, Completed, Cancelled nhận drop. Overdue/In Review có
  nhãn giải thích quyền quản lý. Client và server cùng validate transition.
- Board move optimistic ngay, khóa request trùng, rollback khi action thất bại
  hoặc throw, nhận server version khi thành công và refresh server truth.
  Snapshot task mới từ server được đồng bộ trước paint. Task drawer lấy task
  theo ID từ snapshot mới để tránh giữ dữ liệu cũ.
- Page truyền `scope` và `referenceNow` từ server; grouping dùng timestamp này
  để tránh lệch hydration. Task giữ thứ tự `due_at ASC`, `created_at DESC`.
- Quick create chỉ ở Todo, dùng `createTaskAction` hiện có. Goal đang chọn tự
  được gắn; All/No Goal tạo task không gắn goal. Có validate title và pending state.
- Legacy `/tasks` hiển thị Overdue/In Review dưới dạng disabled options; server
  chặn direct status changes vào hai trạng thái này. Existing rows vẫn sửa được
  metadata/deadline mà không cần rewrite status.
- Bổ sung tone riêng cho In Review và tất cả text mới EN/VI.
- Sửa lỗi hydration của Goal triggers trên Workspace: tạo trigger Radix `asChild`
  bên trong `WorkspaceCreateGoalButton` client component. Không đổi shared Button.

## Migration

CLI đã tạo `supabase/migrations/20261004081250_update_task_status_semantics.sql`.
Migration chỉ thay definition `public.get_my_dashboard_activity(integer)`:

- Todo/In Progress loại tasks quá hạn; future/no-deadline legacy Overdue tính vào
  In Progress.
- Overdue derive từ deadline, loại Completed/Cancelled/In Review.
- JSON status distribution có đủ 6 stages, thêm In Review.
- Giữ summary, focus/distraction aggregation và behaviour trend hiện có.
- Giữ security invoker, `search_path = ''`, ownership predicate `auth.uid()`;
  grant EXECUTE cho authenticated và revoke PUBLIC/anon.

Đã áp dụng migration lên **Supabase local** bằng `supabase migration up --local`.
Không áp dụng lên remote. Không đổi DB enum, không rewrite existing tasks.

## Verification

| Yêu cầu | Kết quả kiểm tra |
| --- | --- |
| Derived Overdue, Review precedence, legacy fallback | Unit tests và SQL assertions |
| Toàn bộ transition matrix, no-op/invalid direct targets | Unit tests |
| Ownership, stale fetch và atomic race | Server-action tests; SQL stale UPDATE |
| Completion timestamp và engagement scheduling | Server-action/domain tests |
| Optimistic move, rollback, request rejection | Component tests |
| Card click và sibling drag handle | Component tests và Playwright |
| Todo → Progress → Completed → reopen | Playwright và DB polling |
| Cancel/restore, keyboard drag | Playwright |
| Quick create scope Goal/All/No Goal | Component tests; Goal persistence qua Playwright |
| Deadline precedence và future reschedule | Unit, action, SQL và Playwright |
| Legacy dropdown khóa managed stages, Goals không regress | Playwright |
| EN/VI, desktop/mobile layout | Playwright và screenshots |
| Dashboard 6 counts, summary, grants | PostgreSQL assertions dưới role authenticated |

- Lint toàn bộ `apps/web`: PASS.
- Vitest: **79 tests, 7 files PASS**.
- Playwright Phase 3: **3 tests PASS**, chạy với tài khoản Supabase local tạm.
- SQL `supabase/tests/workspace_phase3.sql`: PASS; fixtures được rollback.
- Production build trên source cuối: PASS, TypeScript và 96 generated pages.
- Tài khoản/fixtures Playwright được cleanup sau test; fixture của lần test bị
  ngắt cũng đã được cleanup riêng.

Screenshots: `apps/web/test-results/workspace-desktop.png` và
`apps/web/test-results/workspace-mobile.png` (generated, không commit).

## Giới hạn môi trường

Trong browser test, completion/reopen schedule engagement job đúng, nhưng
backend AI được cấu hình hiện trả HTTP 404 khi background recalculation chạy.
Unit tests xác minh scheduling và reconciliation branch; chưa xác minh được
engagement recalculation thành công end-to-end với backend này. Không sửa PBI,
Weekly Reflection hoặc backend analytics ngoài phạm vi Phase 3.

Deletion `phase-8-improvement.md` là change có sẵn trước phiên và được giữ nguyên.
Không commit/push/deploy trong phiên này.

## Tài liệu API đã đối chiếu

- [dnd-kit React sensors](https://dndkit.com/react/guides/sensors/): giữ pointer
  và keyboard sensors mặc định.
- [useDraggable](https://dndkit.com/react/hooks/use-draggable/) và
  [useDroppable](https://dndkit.com/react/hooks/use-droppable/).
- [Supabase update](https://supabase.com/docs/reference/javascript/update):
  conditional filters và trả row sau mutation.
