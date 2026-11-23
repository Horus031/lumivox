# Workspace Phase 6 — Kiểm thử tích hợp và hiệu năng

## Cách đo

- So sánh commit `01a5fec` trước redesign với `271f4a2` sau Timeline. Hai bản dùng cùng bộ dependency và cùng Supabase local, chạy tuần tự trên hai web dev server riêng.
- Dữ liệu mẫu gồm một tài khoản trống và một tài khoản có 500 goal, 180 task gốc cùng 36 subtask. Goal đông nhất có 156 task gốc, chia đều vào 6 cột Board theo trạng thái hiển thị. Hai tài khoản mẫu được dọn sau phép đo.
- Mỗi URL chạy một lượt làm nóng rồi đo 5 lượt đã đăng nhập. Thời gian là trung vị từ lúc gửi GET đến lúc nhận đủ HTML. Dung lượng là số byte đã giải nén. Request, dòng và dung lượng Data API chỉ tính phần đọc goal, task và Risk của Workspace. Một request đếm bằng HEAD được tính vào số request với 0 dòng trả về.
- Search được đo bằng thao tác gõ liên tiếp tại rail khi Board đang mở. Kiểm tra số request phía Data API để phát hiện cả việc tải lại task hoặc Risk phía máy chủ.

## Kết quả hiệu năng

| Kịch bản | Request API | Dòng API | API (KiB) | HTML (KiB) | Trung vị (ms) |
| --- | ---: | ---: | ---: | ---: | ---: |
| Workspace trống | 2 → 1 | 0 → 0 | <0,1 → <0,1 | 163,2 → 153,4 | 265 → 279 |
| 500 goal, chưa chọn goal | 3 → 1 | 716 → 21 | 430,9 → 3,2 | 3.293,7 → 173,0 | 4.687 → 291 |
| Board của goal có 156 task gốc | 3 → 9 | 692 → 142 | 407,9 → 124,7 | 3.211,8 → 655,1 | 4.188 → 1.024 |
| List của cùng goal, sau redesign | 3 | 42 | 10,3 | 240,9 | 349 |
| Timeline của cùng goal, sau redesign | 4 | 42 | 7,0 | 233,9 | 379 |

- Trang chưa chọn scope gọi đúng một RPC cho rail và có 0 request task hoặc Risk. Rail lấy 20 goal cùng một dòng đánh dấu còn trang sau.
- Khi goal đông, Board dùng một request đếm và sáu request cho các cột chạy song song, trả tối đa 20 task mỗi cột. Tổng request tăng từ 3 lên 9. HTML giảm khoảng 80% và trung vị phản hồi giảm khoảng 76% trong lần đo.
- List trả 20 task. Timeline chạy hai truy vấn cho phần có ngày và chưa có ngày, trả 20 task trong bộ dữ liệu mẫu. Biểu đồ dùng phạm vi ngày đang xem. Số dòng trong bảng tính thêm dữ liệu rail và thông tin goal đang chọn.
- Ba lần gõ liên tiếp trong search tạo đúng một RPC, trả một goal với 156 byte JSON. Không ghi nhận request task hoặc Risk trong lúc tìm kiếm. Luồng Risk có dữ liệu riêng được xác minh qua các ca tích hợp.

## Phạm vi kiểm thử

- Workspace gồm chọn goal và `No goal`, phân trang goal/Board/List/Timeline, tạo nhanh ở Todo, chi tiết và focus modal, kéo chuột/cảm ứng, hoàn tác khi dữ liệu cũ, thao tác bàn phím, và liên kết khôi phục từ Risk.
- Ca bổ sung mở đúng subtask qua URL `goal=all`, kiểm tra goal đã xóa, và chặn goal/task thuộc tài khoản khác. Sau khi goal bị xóa, deep link của task còn lại mở trong `No goal`.
- Sửa lỗi đăng nhập phát hiện trong ca tích hợp. Form nhập email và mật khẩu chỉ bật sau khi React sẵn sàng, đồng thời khai báo POST để thông tin xác thực không xuất hiện trong URL nếu trình duyệt gửi form theo cách mặc định.
- Phạm vi xác minh là Chromium và Supabase local. Kết quả hiệu năng dùng để so sánh hai phiên bản trong cùng môi trường. Các lượt web dev chạy riêng ghi nhận cảnh báo cấu hình AI backend cho job Engagement chạy nền.

## Kết quả kiểm thử

| Bộ kiểm tra | Pass |
| --- | ---: |
| Workspace | 12 |
| Lịch học | 10 |
| Study Planner | 8 |
| Task Risk Recovery | 5 |
| Đăng nhập | 2 |
| Vitest web | 1.200 |

Các ca Playwright đạt qua lượt tích hợp và các lượt chạy lại có chủ đích. Focus Legacy và Focus V2 được chạy ở hai cấu hình local riêng. Ca Focus V2 gọi route tạo phiên của AI API thật và kiểm tra receipt cùng phiên Pomodoro đã ghi trong Supabase. TypeScript, ESLint cho các tệp sửa và kiểm tra diff đều pass.
