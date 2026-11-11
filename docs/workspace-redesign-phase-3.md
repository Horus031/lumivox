# Workspace redesign · Phase 3

Phase 3 dùng cờ WORKSPACE_PAGED_PREVIEW_ENABLED. Áp dụng migration [Board lane pages](../supabase/migrations/20261110090747_workspace_board_lane_pages.sql) vào cùng Supabase mà web app dùng trước khi chạy bản mới. Migration giữ các tham số cũ của RPC và bổ sung tham số Board.

Nếu web trỏ tới Lumivox Staging, chạy dry run từ thư mục gốc rồi kiểm tra dòng Target và danh sách migration trước khi chạy lệnh áp dụng:

```powershell
npx supabase db push --remote=atbdbbamqjmfkvahqidj --dry-run
npx supabase db push --remote=atbdbbamqjmfkvahqidj
```

## Board

- Chuyển Danh sách ↔ Board trong Tất cả task hoặc Công việc của goal. URL giữ goal, từ khóa và bộ lọc. Board có mã JavaScript riêng được tải khi mở chế độ xem.
- Board tính số đếm trên cùng phạm vi lọc, trả tối đa 12 card mỗi cột đang mở. Hoàn thành và Đã hủy mặc định thu gọn. Chọn bộ lọc trực tiếp cho một trạng thái sẽ mở cột tương ứng. Nút Tải thêm dùng cursor riêng của từng cột.
- Sau khi kéo thả, server xác nhận theo phiên bản của task và quy tắc trạng thái hiện có. Board đọc lại trang đầu và số đếm ở cột nguồn và đích bị ảnh hưởng. Các cột khác giữ dữ liệu đã tải trong phiên Board. Cột Hoàn thành trong goal cũng làm mới tiến độ goal.
- Đang review và Quá hạn vẫn là cột do hệ thống xác định. Chuyển trạng thái dùng cùng quy tắc với Kanban cũ.

## Chi tiết task

- Panel desktop hiển thị trạng thái, ưu tiên và deadline ở đầu, sau đó là mô tả và checklist. Trên mobile, panel chiếm toàn màn hình.
- Mục tài liệu tải khi mở và có lối sang Tài liệu của goal. AI review dùng luồng hiện có và chỉ dựng UI khi mở. Lịch học và xóa task nằm dưới các mục có thể mở thêm.
- Deep link cũ với tab=subtasks cuộn tới checklist. Link tab=documents, tab=review và edit=1 mở đúng mục hoặc form tương ứng.

Kiểm tra với [benchmark Workspace](workspace-redesign-phase-0.md) và WORKSPACE_BASELINE_EXPECT_PREVIEW=1 trên production build trỏ tới Supabase local.

Production build, 55 unit test và ba bài Playwright cho preview đã qua. Danh sách vẫn tải tối đa 25 task trong 30 lượt đo trên các bộ 50, 500 và 5.000 task. Với 5.000 task, Board trả 12 card ở Todo và số đếm 1.250 ở cột Hoàn thành thu gọn. Playwright cũng xác nhận tải thêm từng cột, kéo bằng chuột và bàn phím, xử lý xung đột phiên bản, hủy/khôi phục, đổi hạn, deep link cũ và chi tiết ở viewport 390 px. AI review được kiểm tra ở bước mở và hiển thị điều kiện bắt đầu.

Khi tắt feature flag, bài Playwright riêng của Kanban cũ vẫn thấy aria-busy=true sau thao tác hủy/khôi phục dù đã tăng thời gian chờ lên 20 giây. Luồng hủy/khôi phục trong preview đã qua kiểm thử.
