# Phase 6G — Bằng chứng chuẩn bị A–E

Ngày kiểm tra 2026-11-27. Branch cục bộ `feature/rag-v2-phase-6g-production-release` được tạo từ `product-release` tại `7c99e0e4979e9d20624f4074e6c7d8c8ed8207bd`. Đối chiếu `origin/main` tại `cda80175fe1e1d0a91b747f492aba0419ae0be73`. Hai branch có 17 và 24 commit riêng tại thời điểm kiểm tra. [Các bước F–K](phase-6g-production-checklist.md)

## A — Thay đổi trong branch chuẩn bị

| Phạm vi | Kết quả |
| --- | --- |
| Durable provider intent | Tách số intent đã reserve và số lượt dispatch. Mất xác nhận từ ledger chặn dispatch tiếp. Giới hạn áp dụng đồng thời cho intent và actual call. |
| Document indexing | Kiểm tra owner, quyền hiện tại, trạng thái và operation identity trước embedding và trước lưu. Thay chunk và cập nhật kết quả trong một transaction. Operation cũ mất hiệu lực khi có job mới hoặc document thay đổi. |
| Provider authorization | Bắt buộc trên đường gọi RAG. Legacy Ask xác nhận session/scope và làm sạch dữ liệu ở biên outbound theo privacy flag. |
| Vận hành | Báo cáo `dispatch_pending` mọi thời điểm. Next.js và FastAPI nối trace qua server request ID có định dạng UUIDv4. Trace riêng với idempotency và durable operation IDs. |

Mọi dữ liệu kiểm thử DB đều là fixture tổng hợp. Nội dung đã gửi tới provider trước lúc quyền bị thu hồi vẫn là giới hạn của cơ chế hủy quyền.

Các script chẩn đoán live cũ gọi trực tiếp model client như `verify_rag_provider` và `verify_rag_context_quality --mode live` sẽ bị chặn nếu thiếu operation authorization. Khi cần smoke live, đi qua ứng dụng staging với tài khoản và tài liệu được phép. Các lệnh offline vẫn chạy với fixtures.

## B–C — Evaluation và provider

Evidence 6A–6F lưu trạng thái **PASS — developer-confirmed** cho hosted functional QA và live provider tests trước đó. Bộ comparative offline đã ghi nhận 320 ca trong evidence 6E. Full adaptive live correctness, real Recall@5, citation precision và hosted P95 đang chờ số liệu hoặc xác nhận theo từng threshold. [Phase 6E](phase-6e-evidence.md) · [Phase 6F](phase-6f-evidence.md)

Groq/Gemini do developer xác nhận đã kiểm tra. Lượt này dùng xác nhận đó và bỏ qua việc kiểm tra lại qua tài khoản hoặc gọi provider thật.

## D — Production preflight

| Hạng mục | Kết quả |
| --- | --- |
| Render AI API | `lumivox-ai-api`, `srv-d87k12rtqb8s73c0ih10`, branch `main`, auto-deploy tắt. Public health trả `ok` và SHA `cda80175fe1e1d0a91b747f492aba0419ae0be73`. |
| Vercel web | `lumivox`, `prj_SE0K3y3prJEcNFdUugAHZblAtyEq` với domain `www.lumivox.it.com`. Public health trả `ok` và cùng SHA với Render. |
| Supabase | Workflow chỉ đến `lslybjylsxtnznghrtyj`. CLI tìm thấy project production và link thành công trong thư mục tạm riêng. |
| Backup | `supabase backups list` trả về bảy physical backups hoàn tất. Backup mới nhất lúc `2026-11-26T20:11:03.960Z` (03:11 ngày 27/11, giờ Bangkok). PITR tắt. Recovery khả dụng theo snapshot đã liệt kê. Dữ liệu ghi sau snapshot có thể mất nếu khôi phục về điểm đó. Owner cần xác nhận người có quyền restore và kiểm tra lại recovery point sát giờ merge. [Quy trình Supabase Backups](https://supabase.com/docs/guides/platform/backups) |
| Upstash và internal API | Tài khoản trả về database `lumivox-redis`. Runtime allocation Redis, binding của các worker và việc web/API dùng secret khớp nhau cần xác nhận trong dashboard. |
| GitHub approvals | Workflow đã định nghĩa environment `production`. Reviewer và quy tắc bảo vệ đang áp dụng cần xác minh trong Settings. |
| Dependency audit | Từ lockfiles ở SHA production: npm runtime có 1 critical và 4 high, pinned Python có 66 findings trong 4 packages. Branch preparation: 0 npm runtime findings và 0 pinned Python findings ở thời điểm chạy. Cần chạy lại cho SHA tích hợp cuối. |
| Supabase Security Advisor | Trên database local sau clean replay, CLI báo `No issues found`. SQL tests kiểm tra quyền của RAG, service-role-only access và migration đã đặt search path cố định cho `public.set_updated_at()`. Hai kết nối Supabase MCP chưa có quyền đọc advisor production. |

Workflow tham chiếu các project đã có. Production health là smoke chỉ đọc ở revision hiện tại. [Deploy Production workflow](../../.github/workflows/deploy-production.yml)

## E — Migration và tương thích

- Inventory gồm chín migration từ staging và `20261127152832_rag_v2_release_hardening.sql`.
- Local dry-run từ schema `main` liệt kê đúng 10 migration. Sau áp dụng trên database riêng, dữ liệu v1 mẫu, chunk tài liệu, lịch sử tin nhắn, ownership, Focus và task được giữ. Đã kiểm tra quyền truy cập của hai user mẫu.
- **New DB + old backend** PASS. Backend ở SHA production chấp nhận legacy Ask trên schema đã nâng cấp với provider mock.
- **New DB + new backend dark + old frontend payload** PASS. Backend preparation chấp nhận payload legacy với provider mock.
- **Clean replay** PASS. pgTAP 49 files, 1.378 assertions. Python 367 tests. Server Action Vitest 11 tests. TypeScript và ESLint trên file web thay đổi đều qua. Context adaptive offline 30/30 và privacy/security fixtures offline 36/36.
- **Production migration preview** Chờ kiểm tra. CLI link đúng production, nhưng kết nối PostgreSQL qua pooler timeout trong lúc đọc migration history. Trước merge, chạy lại `supabase migration list --linked` và `supabase db push --linked --dry-run` từ môi trường có quyền và đường kết nối tới database.
- Sinh type từ local schema và cập nhật đúng phần schema mới trong `database.types.ts` bằng UTF-8.

## Quyết định release

Production release đang chờ các điều kiện ở đầu checklist F–K, bao gồm recovery point có thể phục hồi, quyền phê duyệt, runtime bindings và cơ chế tạm dừng riêng generation đã chạy qua staging. Rollback ưu tiên trở về revision ứng dụng tương thích và giữ schema/dữ liệu v2. Evidence từ branch preparation cần được nối tiếp bằng kết quả trên SHA tích hợp và release thực tế. [Checklist phát hành](phase-6g-production-checklist.md)
