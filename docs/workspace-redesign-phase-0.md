# Workspace redesign · Phase 0

## Baseline ngày 10/11/2026

Đo bản production build hiện tại với Supabase local và Chromium trên Windows. Mỗi viewport có năm lượt tải mỗi bộ dữ liệu. TTFB, LCP, HTML và DOM ở bảng là trung vị của các lượt tải thành công.

| Task gốc / Goal / Subtask | Viewport | Kết quả | TTFB | LCP | HTML đã mã hóa | DOM |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| 50 / 5 / 26 | 1440 × 900 | 5/5 lượt hiện đủ 50 card | 37 ms | 572 ms | 51.489 byte | 1.499 node |
| 50 / 5 / 26 | 390 × 844 | 5/5 lượt hiện đủ 50 card | 30 ms | 500 ms | 51.499 byte | 1.499 node |
| 500 / 50 / 250 | Cả hai | 10/10 lượt vào màn hình lỗi, 0 card | — | — | — | — |
| 5.000 / 500 / 2.500 | Cả hai | 10/10 lượt vào màn hình lỗi, 0 card | — | — | — | — |

Ở bộ 50 task, CLS ghi nhận là 0 và các request được Resource Timing phân loại là script truyền 438.065 byte mỗi lượt. Các con số này dùng để so sánh trong cùng môi trường local. Cần pilot để đo Web Vitals thực tế, gồm INP.

Server ghi `Failed to load workspace subtasks: URI too long` ở hai bộ lớn. Query hiện tại đưa tập ID task gốc vào một tham số `parent_task_id.in(...)`. HTTP của tài liệu vẫn trả 200 khi Next.js render màn hình lỗi, nên harness ghi riêng kết quả `board` hoặc `route-error` thay vì chỉ kiểm tra mã HTTP. Harness chạy thành công nghĩa là đã ghi nhận được kết quả của các lượt đo.

Điều kiện qua Phase 1 từ baseline này là cả hai bộ dữ liệu lớn mở được Workspace, danh sách đầu trả tối đa 25 task tóm tắt, và có thể tìm hoặc mở trực tiếp task ngoài trang đầu. Giới hạn tập task trước khi truy vấn tiến độ checklist giúp loại bỏ URI tăng theo toàn bộ dữ liệu người dùng.

## Prototype

Mở [prototype Workspace](workspace-redesign-prototype.html) bằng trình duyệt. Prototype dùng dữ liệu mẫu và lưu thay đổi trong phiên mở trang. Desktop dùng điều hướng cạnh và panel chi tiết. Ở viewport mobile, điều hướng chuyển lên đầu và chi tiết chiếm toàn màn hình.

| Luồng | Cách thử | Số thao tác điều hướng |
| --- | --- | --- |
| Tiếp tục việc ưu tiên | Vào trang và mở task đầu tiên trong Tập trung. | 1 để vào chi tiết |
| Đọc tài liệu goal | Chọn AWS Cloud Practice → Tài liệu → Ghi chú AWS Networking. | 1 để đến tab từ goal, thêm 1 để mở tài liệu |
| Đổi deadline | Bấm deadline ngay trên dòng task → chọn ngày → Lưu. | 1 để mở điều khiển từ danh sách, thêm thao tác nhập và lưu |

Playwright kiểm tra các luồng ở 1440 × 900 và 390 × 844, bao gồm Back từ tab Tài liệu, trả focus sau khi đóng chi tiết, đổi thứ tự ưu tiên sau khi đổi deadline và kiểm tra tràn ngang. Đây là kiểm thử tương tác tự động. Số lần thao tác đến mục tiêu được đếm theo luồng, chưa có quan sát người dùng thực tế.

Trong buổi thử với người học, giao ba mục tiêu ở bảng mà không đọc tên nút hoặc chỉ vị trí. Ghi kết quả hoàn thành, số thao tác, lần quay lại và điểm cần trợ giúp. Dùng cùng kịch bản với Workspace hiện tại để so sánh khả năng tìm tài liệu và sửa deadline trước khi triển khai diện rộng.

## Cách tái lập baseline

1. Chuẩn bị Supabase local với migrations của repo. Chạy cả app và Supabase trên loopback. Dùng một bản build của Workspace trước redesign.
2. Trong thư mục apps/web, đặt NEXT_PUBLIC_SUPABASE_URL và NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY trỏ tới Supabase local, rồi chạy npm run build và npm run start. Giữ cùng cấu hình khi đo lại sau redesign.
3. Trong terminal chạy test, đặt PLAYWRIGHT_BASE_URL trỏ tới production server local. Đặt WORKSPACE_TEST_SUPABASE_URL, WORKSPACE_TEST_ANON_KEY và WORKSPACE_TEST_SERVICE_KEY từ cùng instance local. Đặt WORKSPACE_BASELINE=1 để bật fixture.
4. Chạy lệnh sau. Harness tạo tài khoản riêng cho mỗi bộ dữ liệu, đăng nhập, tạo 50/500/5.000 task gốc cùng goal và checklist, rồi dọn tài khoản trong finally. Mỗi bộ dữ liệu có năm lượt điều hướng trong browser context mới trên từng viewport.

```sh
npx playwright test workspace-baseline.spec.ts --reporter=list --output=test-results/workspace-baseline
```

Mỗi bộ dữ liệu xuất JSON gồm TTFB, LCP, CLS, số card, số node DOM, byte HTML đã mã hóa và byte script ghi nhận từ Resource Timing. Byte HTML bao gồm dữ liệu được nhúng trong tài liệu HTML. CLS và LCP là ảnh chụp lab sau lần tải trang. Viewport mobile dùng cùng máy và không giả lập CPU hoặc mạng. Các lượt dùng browser context mới với session đã đăng nhập và cache phía server có thể ấm.

Để chạy lại kiểm thử prototype mà không bật web server, đặt PLAYWRIGHT_BASE_URL thành một URL loopback rồi chạy từ apps/web:

```sh
npx playwright test workspace-redesign-prototype.spec.ts --reporter=list --output=test-results/workspace-prototype
```
