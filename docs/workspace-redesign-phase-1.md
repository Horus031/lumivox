# Workspace redesign · Phase 1

## Bật bản preview

1. Áp dụng migration [Workspace paged task summaries](../supabase/migrations/20261110082116_workspace_paged_task_summaries.sql) vào môi trường muốn thử. Với Supabase local, chạy supabase migration up từ thư mục gốc.
2. Đặt WORKSPACE_PAGED_PREVIEW_ENABLED=true trên server web và khởi động lại ứng dụng. Mở /en/workspace hoặc /vi/workspace. Mặc định flag tắt. Có thể tắt lại flag để dùng Kanban hiện tại.
3. Chạy [baseline harness](workspace-redesign-phase-0.md) với WORKSPACE_BASELINE_EXPECT_PREVIEW=1 để bật các kiểm tra và số đo Phase 1.

## Hành vi

- Danh sách trả tối đa 25 task gốc mỗi trang. Sắp xếp theo thời điểm tạo giảm dần, dùng ID để phân định khi trùng thời điểm. Cursor gắn với bộ lọc và giữ mốc tham chiếu deadline khi đi tiếp.
- Tìm theo tiêu đề, goal, trạng thái hiệu lực, priority và hạn chót ở server. Tổng kết quả tính trên cùng tập đã lọc, trước cursor. Checklist được đếm cho task trong trang. Mô tả và nội dung checklist thuộc luồng mở task.
- Bộ chọn goal bắt đầu với tối đa 8 goal hoạt động. Tìm kiếm trả tối đa 8 kết quả và giữ goal đang chọn để người dùng thấy lựa chọn hiện tại. Dùng chung bộ chọn ở filter, tạo task và sửa task trong preview.
- Deep link goal, task, tab và edit tiếp tục dùng tham số hiện có. Task được tra theo ID và chủ sở hữu, kể cả khi nằm ngoài trang đầu hoặc bộ lọc đang chọn.
- Đây là bề mặt thử lớp dữ liệu. Tập trung, tab Tài liệu trực tiếp trong goal và sửa nhanh trên dòng task nằm trong Phase 2.

## Kiểm thử

Production build với Supabase local qua 30/30 lượt tải, mỗi lượt hiển thị 25 dòng và tổng đúng. Cùng môi trường với Phase 0, bộ 500 và 5.000 task trước đó vào màn hình lỗi do URI quá dài. Bảng dưới ghi trung vị của năm lượt ở mỗi viewport.

| Task gốc | LCP desktop / mobile viewport | HTML đã mã hóa desktop / mobile viewport | DOM desktop / mobile viewport |
| --- | ---: | ---: | ---: |
| 50 | 496 / 464 ms | 49.925 / 48.341 byte | 544 / 538 node |
| 500 | 464 / 448 ms | 50.319 / 50.319 byte | 550 / 544 node |
| 5.000 | 480 / 456 ms | 50.202 / 50.412 byte | 543 / 547 node |

Bộ 500 task kiểm tra thêm phân trang không trùng, deep link ngoài trang đầu, lọc, tìm goal, dữ liệu chi tiết vắng mặt ở lần tải danh sách và cô lập dữ liệu giữa tài khoản. Số đo là lab local trên cùng máy, với viewport mobile và cấu hình mạng mặc định.
