# Workspace redesign · Phase 2

Phase 2 dùng cùng cờ WORKSPACE_PAGED_PREVIEW_ENABLED. Áp dụng migration [Workspace focus queue](../supabase/migrations/20261110084315_workspace_focus_queue.sql) trước khi khởi động bản web mới. Cờ tắt theo mặc định.

- /workspace mở Tập trung. Hàng đợi trả tối đa 25 task gốc, theo thứ tự Quá hạn, Đang làm, Sắp đến hạn trong 7 ngày, rồi các việc còn lại. Tìm kiếm chuyển sang Tất cả task với từ khóa đã nhập. Mục chờ AI review dẫn đến danh sách đã lọc.
- /workspace?goal=all mở Tất cả task với lọc và phân trang phía server. /workspace?view=goals mở danh mục goal có tìm kiếm, lọc trạng thái và phân trang 20 goal. Điều hướng bên cạnh lấy tối đa 8 goal hoạt động.
- Trong goal, chuyển Công việc ↔ Tài liệu bằng tab. Tab Tài liệu tái sử dụng thao tác xem, tải lên, chia sẻ và xử lý hiện có. Dữ liệu tài liệu chỉ tải khi mở tab.
- Tạo nhanh điền sẵn goal đang mở. Tiêu đề là trường duy nhất bắt buộc. Deadline và độ ưu tiên là tùy chọn.
- Đổi trạng thái, ưu tiên và deadline ngay trên dòng. Trạng thái dùng chung quy tắc chuyển của Kanban. Sửa metadata kiểm tra phiên bản trước khi cập nhật và chỉ ghi trường đã chọn. Danh sách và số đếm làm mới trong phạm vi hiện tại sau khi ghi.
- Panel chi tiết và Board mới thuộc Phase 3.

Chạy [benchmark Workspace](workspace-redesign-phase-0.md) với WORKSPACE_BASELINE_EXPECT_PREVIEW=1 để kiểm tra Tất cả task và các luồng Phase 2 trên Supabase local.

Production build local và 33 unit test đã qua. Playwright ghi nhận 30/30 lượt tải Tất cả task với các bộ 50, 500 và 5.000 task. Mỗi lượt hiển thị 25 dòng cùng số đếm đúng. Tập trung cũng giữ giới hạn 25 dòng ở cả ba bộ trên viewport 390 px. Luồng với 500 task xác nhận mở tài liệu và Back, tìm task từ Tập trung, tìm goal, tạo nhanh trong goal, và sửa deadline, ưu tiên, trạng thái ngay trên dòng.

Trong lượt kiểm thử chuyển sang Hoàn thành, cập nhật task thành công và tác vụ nền engagement ghi lỗi AI API 500. Lượt Playwright cuối dùng chuyển từ Đang làm về Todo để xác nhận hành vi chuyển trạng thái và cập nhật bộ lọc độc lập với tác vụ nền đó.
