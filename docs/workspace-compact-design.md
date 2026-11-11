# Kế hoạch tinh chỉnh giao diện Lumivox

Ba ảnh Jira là tham chiếu cho bố cục, mật độ và thứ bậc thị giác. Dùng token màu, font Plus Jakarta Sans, icon Lucide và ngữ nghĩa trạng thái hiện có của Lumivox.

| Khu vực | Chuẩn giao diện |
| --- | --- |
| App shell | Top bar desktop 50 px. Sidebar sản phẩm quản lý điều hướng toàn app. Sidebar Workspace rộng 224 px trên desktop và dành cho chọn goal. Mobile dùng điều hướng Goals để chọn phạm vi. |
| Workspace | Tiêu đề scope 20 px. Tiến độ goal nằm dưới tên. Một hàng tab Danh sách, Board và Tài liệu ngay bên dưới. Tập trung và Tất cả task là hai lối vào toàn Workspace. Tài liệu xuất hiện khi có goal. |
| Điều khiển | Nút và input mặc định cao 34 px ở desktop, cỡ nhỏ 32 px. Component dùng chung vẫn có kích thước 44 px ở mobile. Chữ nội dung 14/20 px, nhãn 13/18 px và metadata 12/16 px. |
| Danh sách | Một bề mặt có tiêu đề cột và đường phân hàng, cao tối thiểu 40 px ở desktop. Cột Công việc, Trạng thái, Ưu tiên và Hạn chót. Tạo nhanh, tổng số và phân trang ở chân bảng. Mobile xếp tiêu đề task phía trên ba điều khiển trong cùng hàng. |
| Board | Cột rộng 256 px, khoảng giữa cột 12 px. Dùng nền nhẹ để phân cột. Card hiển thị trường cần đọc khi kéo thả. Cuộn ngang bên trong Board khi thiếu chỗ. |
| Chi tiết task | Hộp thoại giữa màn hình trên desktop, tối đa 1024 px. Mô tả, checklist, tài liệu và AI review ở vùng nội dung. Trạng thái, độ ưu tiên, hạn chót và goal ở vùng thông tin. Mobile toàn màn hình. |
| Bề mặt dùng chung | Panel có một viền, góc bo theo token rounded-lg và padding theo token card. Áp dụng bước đầu cho các ô số liệu và biểu đồ Dashboard. Dành bóng rõ cho bề mặt nổi như hộp thoại và bộ lọc. |

1. **Chốt mẫu Workspace.** Đối chiếu Danh sách, Board và chi tiết task với ba ảnh ở viewport 1440, 1024 và 390 px. Kiểm tra theme sáng và tối, tiếng Việt và tiếng Anh, tên goal dài, bảng trống, cột thu gọn và task quá hạn.
2. **Chuẩn hóa component dùng chung.** Dùng cùng quy tắc mật độ cho App Shell, PageHeader, Button, Input, Select, Badge, Dialog và panel. Giữ biến thể riêng cho điều khiển cảm ứng và màn hình thiên về đọc. Rà thêm Sidebar, trạng thái focus và độ tương phản qua cả hai theme.
3. **Áp dụng theo nhóm màn hình.** Workspace và Dashboard là hai mẫu đầu. Tiếp theo là Roadmaps và các danh mục dữ liệu, rồi Study Rooms và các luồng form. Rà bề mặt chính của từng màn hình để quyết định giữ panel, chuyển sang bảng hay gom thành section phẳng.
4. **Duyệt trước khi mở rộng.** Chụp cùng viewport với bộ dữ liệu thực tế, thử ba thao tác chọn goal, lọc task và mở chi tiết. Chốt vòng tiếp theo theo lỗi cụ thể về thứ bậc, khoảng cách và thao tác. Chạy lại phân trang, kéo thả, sửa nhanh, deep link và kiểm tra không tràn ngang ở cấp trang.

Giới hạn dữ liệu của Workspace vẫn là 25 task mỗi trang và 12 card mỗi cột mở. Bản compact dùng feature flag Workspace hiện có.
