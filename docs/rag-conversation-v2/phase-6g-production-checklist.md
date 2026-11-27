# Phase 6G — Các bước tự phát hành RAG v2

Tài liệu này là phần bàn giao từ mục F đến hết. Thực hiện theo thứ tự. Mỗi bước có điều kiện để chuyển tiếp. Kết quả đã làm ở A–E nằm trong [evidence chuẩn bị](phase-6g-preparation-evidence.md).

## Trước mục F — Đóng các điều kiện còn mở

1. Trong Dashboard Supabase, chọn production ref `lslybjylsxtnznghrtyj`. Khi chuẩn bị đã xác minh bảy physical backup hoàn tất và PITR đang tắt. Trước giờ merge, kiểm tra lại snapshot mới nhất, ghi khoảng dữ liệu có thể mất khi restore và chỉ định người có quyền thực hiện. Trong Security Advisor, rà nhóm RAG, quyền service role và warning của `set_updated_at`. [Supabase Backups](https://supabase.com/docs/guides/platform/backups)
2. Kiểm tra các binding trước khi link hoặc chuẩn bị deploy. Render là `lumivox-ai-api` với service ID `srv-d87k12rtqb8s73c0ih10`. Vercel là project `lumivox` với ID `prj_SE0K3y3prJEcNFdUugAHZblAtyEq` và domain `www.lumivox.it.com`. Trong Dashboard hai bên, đối chiếu đúng production Supabase, AI API URL, Upstash allocation và internal API key đang cấu hình. So sánh theo tên/ref hoặc xác nhận biến đã khớp trong giao diện quản trị. Giữ nguyên giá trị secrets.
3. Từ checkout riêng chứa candidate đã review và đã link đúng production, chạy preview chỉ đọc. Lặp lại khi exact SHA của release candidate thay đổi. Dừng nếu thấy production ref sai, timestamp thiếu hoặc migration ngoài dự kiến.

   ```powershell
   supabase migration list --linked
   supabase db push --linked --dry-run
   ```

   Nếu timeout qua pooler như ở lần kiểm tra chuẩn bị, chạy lại từ môi trường truy cập được PostgreSQL production. Có thể đọc lịch sử bằng SQL Editor qua `select version from supabase_migrations.schema_migrations order by version;` để đối chiếu sớm. Vẫn cần dry-run thành công trước merge.

4. Dùng các số quota và thông tin Groq/Gemini bạn đã kiểm tra. Ghi lại allocation, cả hai model quota, các chiều input/output nếu áp dụng, và topology chia sẻ giữa staging/production. Nếu cùng pool, các worker cần cùng Redis database và quota scope. Nếu Redis tách riêng, tổng các suballocation phải nằm trong quota đã xác minh. Điền bằng chứng accuracy, Recall@5, citation precision và hosted P95 từ báo cáo thực tế hoặc xác nhận rõ từng threshold. Nightly/local P95 và functional QA không thay cho các số này.
5. Chuẩn bị đường dừng generation trước khi có v2 transcript thật. Tìm cơ chế đang hỗ trợ bằng `rg -n "RAG_V2_GENERATION_PAUSED|generation_paused" services/ai-api apps/web`. Nếu chưa có, thêm và kiểm tra cơ chế server-side theo mục 27 trên staging trong release candidate. Chặn Ask/Continue mới bằng mã unavailable ổn định, giữ completed replay, restore, history, operation status và lease recovery cho người còn quyền. Kiểm thử với flags bảo mật và resource control đang bật. Nếu cần thay đổi code sau khi chốt candidate, chạy lại CI và smoke cho SHA mới.

Dùng [production read-only preflight](../../.github/workflows/production-read-only-preflight.yml) từ GitHub Actions khi muốn đối chiếu thêm binding Vercel trên `main`. Workflow này kiểm tra Vercel; backup, Supabase preview và Redis allocation cần được xác minh riêng.

## F — Tích hợp hai branch và chạy regression

1. Tại branch preparation, dùng `git status` và `git diff --check`. Stage đúng các file Phase 6G sau khi review, rồi chạy `git diff --cached --check`. Commit và push branch preparation.

   ```powershell
   git commit -m "feat(rag): finalize Phase 6G production safeguards"
   git push -u origin feature/rag-v2-phase-6g-production-release
   ```

   Tạo PR **feature/rag-v2-phase-6g-production-release → product-release** với title `feat(rag): Phase 6G production release preparation`. Đợi tất cả checks xanh và review trước khi merge.

2. Sau merge staging, tạo branch release từ staging mới nhất. Các lệnh dưới đây chạy từ repo ở trạng thái sạch.

   ```powershell
   git fetch origin
   git switch product-release
   git pull --ff-only origin product-release
   git switch -c release/rag-v2-production
   git log --left-right --cherry-pick --oneline origin/main...HEAD
   git diff --stat origin/main HEAD
   git merge --no-ff --no-commit origin/main
   git status
   git diff --name-only --diff-filter=U
   ```

3. Xử lý conflict từng file. Ưu tiên giữ invariant của cả production hotfix và staging security fixes. Đối chiếu migration timestamps, workflow production, dependency lockfiles và các platform bindings. Khi hết conflict, stage từng file đã sửa, review toàn bộ staged diff và commit merge.

   ```powershell
   git diff --cached --check
   git diff --cached --stat
   git commit -m "chore(release): reconcile main for RAG v2 production"
   git push -u origin release/rag-v2-production
   ```

4. Chạy hồi quy trên exact candidate. Reset chỉ trên stack cục bộ dùng một lần. Dùng dataset frozen của repo, Redis 7 cục bộ cùng container name phù hợp. Mọi lệnh phải thành công trước khi chuyển tiếp.

   ```powershell
   # Repository root, with the disposable Supabase stack running
   supabase db reset --local
   supabase test db --local
   supabase migration list --local
   node scripts/test-rag-conversation-concurrency.mjs

   Push-Location services/ai-api
   python -m compileall -q app scripts evaluation
   python -m pytest -q
   python -m pip check
   python -m pip_audit -r requirements.txt
   python -m scripts.verify_rag_context_quality --dataset evaluation/context_quality_v1.jsonl --variant adaptive --mode offline --strict
   python -m scripts.verify_rag_security --dataset evaluation/security_adversarial_v1.jsonl
   $results = Join-Path ([System.IO.Path]::GetTempPath()) ("lumivox-release-" + [guid]::NewGuid())
   foreach ($variant in @("A","B","C","D")) {
     python -m scripts.verify_rag_comparative --variant $variant --mode offline --output "$results/$variant.jsonl"
     if ($LASTEXITCODE -ne 0) { throw "Offline evaluation failed for $variant" }
   }
   python -m scripts.verify_rag_resource_control --redis-port 6379
   Pop-Location

   Push-Location apps/web
   npm.cmd ci
   npm.cmd audit --omit=dev --audit-level=high
   npm.cmd run lint
   npx.cmd next typegen
   npx.cmd tsc --noEmit --incremental false
   npm.cmd run test:unit
   npm.cmd run build
   Pop-Location
   ```

   Cần có `pip-audit` trong môi trường audit riêng. Nếu stack cục bộ dùng tên Docker riêng, đặt `RAG_TEST_DB_CONTAINER` đúng trước ca tranh chấp. Nếu web suite cần Redis thật, đặt `RAG_TEST_REDIS_CONTAINER` là Redis 7 cục bộ. Các mốc Phase 6F gồm 1.360 pgTAP, 35 PostgreSQL concurrency, 357 backend, 1.294 web, 30/30 context, 36/36 security và 320 offline comparative. Số ca có thể tăng theo các fixes mới.

5. Ưu tiên đưa branch đã hòa giải trở lại `product-release` bằng merge commit để giữ ancestry của `main`. Đợi staging CD và QA trên source kết hợp thật. Ghi SHA đã qua staging. Nếu `main` có commit mới, fetch, hòa giải lại, rồi chạy lại CI và kiểm tra theo SHA mới.

## G — Dark deployment

1. Chốt backup, preview migration, rollback và các approvals của environment `production`. Trong GitHub Settings → Secrets and variables → Actions, xác minh repository/organization variable `PRODUCTION_CD_ENABLED` đúng kế hoạch. Khi chưa sẵn sàng migrate production, giữ merge vào `main` lại. [Deploy Production workflow](../../.github/workflows/deploy-production.yml)
2. Đặt cấu hình dark trên đúng Production environment. Trong Render, giữ `RAG_RESOURCE_NAMESPACE=production`, `RAG_PRIVACY_FILTER_ENABLED=true` và `RAG_CONTEXT_ISOLATION_ENABLED=true` sau khi legacy compatibility đã qua. Đặt những cờ sau là `false`.

   ```dotenv
   RAG_CONVERSATION_V2_ENABLED=false
   RAG_ROLLING_SUMMARY_ENABLED=false
   RAG_NEW_CHAT_ENABLED=false
   RAG_HANDOFF_ENABLED=false
   RAG_OPERATION_RECOVERY_ENABLED=false
   RAG_RESOURCE_CONTROL_ENABLED=false
   RAG_CONTEXT_QUALITY_ENABLED=false
   RAG_OBSERVABILITY_ENABLED=false
   RAG_DURABLE_ACCOUNTING_ENABLED=false
   RAG_PROVIDER_THROUGHPUT_ENABLED=false
   ```

   Trong Vercel Production, đặt `RAG_RESOURCE_NAMESPACE=production`, `RAG_IDEMPOTENT_ADMISSION_ENABLED=false`, và để `RAG_OBSERVABILITY_ENABLED=false` cho tới khi cần correlate trace ở Stage 1. Kiểm tra cả Render và Vercel sẽ đưa các environment values này vào revision production tương ứng. Giữ deploy theo pipeline hiện có. [Render deploys](https://render.com/docs/deploys) · [Vercel deployments](https://vercel.com/docs/deployments)

3. Tạo PR **candidate đã qua staging → main**, title `release: RAG Conversation v2 production readiness`. Đợi checks xanh. Khi sẵn sàng cho CD thì xác nhận `PRODUCTION_CD_ENABLED=true` và approval rules trước khi merge. Workflow nhận successful **push CI** trên `main`. Bật biến sau khi run đã skip không tự khởi chạy deploy; nếu phải giữ lại rồi chạy lại, dùng eligible push CI của exact SHA hiện còn là `main` và kiểm tra workflow đã tạo run.

4. Trong Actions, ghi URL CI và deploy run. Kiểm tra đúng thứ tự **binding → dry run → apply migration → Render → AI readiness → Vercel → web health**. Nếu một bước fail, dừng activation và xử lý bước đầu tiên bị lỗi. Để workflow xử lý migration một lần. Ghi exact merge SHA của `main` và đối chiếu cả hai health endpoints.

   ```powershell
   $expected = git rev-parse origin/main  # chạy git fetch origin trước khi lấy SHA
   $ai = Invoke-RestMethod 'https://lumivox-ai-api.onrender.com/api/v1/health'
   $web = Invoke-RestMethod 'https://www.lumivox.it.com/api/health'
   $ai | Select-Object status, revision, models
   $web | Select-Object status, revision
   if ($ai.status -ne 'ok' -or $web.status -ne 'ok' -or
       $ai.revision -ne $expected -or $web.revision -ne $expected) {
     throw 'Production health or revision differs from the release candidate'
   }
   ```

5. Kiểm tra native risk model báo `ready` và đúng model version theo CI. Đăng nhập bằng tài khoản test, mở Focus workspace, Goals/Tasks, AI Task Review và thử legacy Study Assistant. Chỉ chuyển H khi dark smoke đạt.

## H — Bật tính năng theo từng tầng

Dùng release window có người theo dõi. Các flags v2 là toàn cục nếu candidate chưa có server-side eligibility. Lưu evidence sau từng tầng rồi mới chuyển tiếp.

| Tầng | Render | Vercel và kiểm tra |
| --- | --- | --- |
| 0 | Dark deployment như mục G | Legacy vẫn hoạt động, cả hai revision đúng SHA |
| 1 | Bật `RAG_CONVERSATION_V2_ENABLED`, `RAG_OPERATION_RECOVERY_ENABLED`, `RAG_RESOURCE_CONTROL_ENABLED`, `RAG_OBSERVABILITY_ENABLED`, `RAG_DURABLE_ACCOUNTING_ENABLED`. Privacy và isolation vẫn bật. Summary, New Chat, Handoff và adaptive context còn tắt. | Bật `RAG_IDEMPOTENT_ADMISSION_ENABLED` và tuỳ theo telemetry `RAG_OBSERVABILITY_ENABLED`. Redeploy cấu hình theo quy trình đang dùng và kiểm tra Ask, reload, replay, recovery, ledger và trace ID. |
| 2 | Bật `RAG_ROLLING_SUMMARY_ENABLED`, `RAG_CONTEXT_QUALITY_ENABLED`, xác nhận `RAG_HISTORY_CANDIDATE_TURNS=12` | Kiểm tra summary threshold, câu hỏi kế tiếp và chuyển chủ đề |
| 3 | Bật `RAG_NEW_CHAT_ENABLED`, `RAG_HANDOFF_ENABLED` cùng nhau | Kiểm tra Fresh, Continue, history/read-only detail và transition recovery |
| 4 | Điền quota scope/JSON đã xác minh, rồi bật `RAG_PROVIDER_THROUGHPUT_ENABLED` | Tạm dừng new generation và đợi workers cũ cùng in-flight attempts drain. Kiểm tra worker dùng chung allocation đều đã chạy cấu hình mới rồi mở traffic. Quan sát denials và 429. |

Giữ `RAG_PROVIDER_THROUGHPUT_ENABLED=false` cho đến khi allocation, topology và drain đáp ứng đủ. Việc rollout Render theo kiểu rolling có thể giữ workers cũ và mới đồng thời. Duy trì pause ở mọi ingress chia sẻ quota tới khi pool mới thống nhất. [Render deploy lifecycle](https://render.com/docs/deploys)

Đối chiếu các giá trị sau trong Render. Khi tới tầng 4, dùng allocation bạn đã xác minh để điền `RAG_PROVIDER_QUOTA_SCOPE` và `RAG_PROVIDER_QUOTAS_JSON`.

```dotenv
RAG_CHAT_MODELS=openai/gpt-oss-20b,openai/gpt-oss-120b
RAG_SUMMARY_MODELS=openai/gpt-oss-20b,openai/gpt-oss-120b

RAG_PROVIDER_MAX_CONCURRENCY=4
RAG_PROVIDER_LEASE_SECONDS=45
RAG_PROVIDER_ADMISSION_TIMEOUT_SECONDS=1
RAG_PROVIDER_COOLDOWN_SECONDS=15

RAG_REQUEST_DEADLINE_SECONDS=25
RAG_ANSWER_RESERVE_SECONDS=10
RAG_COMPLETION_RESERVE_SECONDS=3

RAG_MAX_PROVIDER_CALLS_PER_ASK=4
RAG_MAX_PROVIDER_CALLS_PER_HANDOFF=6

RAG_MAX_PROMPT_TOKENS=4000
RAG_MAX_COMPLETION_TOKENS=1200
RAG_MAX_SUMMARY_TOKENS=500

RAG_RECENT_TURNS=4
RAG_HISTORY_CANDIDATE_TURNS=12

RAG_SUMMARY_START_TURNS=6
RAG_SUMMARY_UPDATE_INTERVAL=2
RAG_SUMMARY_MAX_BATCH_TURNS=8

RAG_SUMMARY_COMPLETION_TOKENS=800
RAG_SUMMARY_REQUEST_TIMEOUT_SECONDS=4
RAG_SUMMARY_DEADLINE_SECONDS=6

RAG_HANDOFF_MAX_INPUT_TURNS=24
RAG_HANDOFF_MAX_TOKENS=500
RAG_HANDOFF_DEADLINE_SECONDS=10

RAG_SOFT_TURN_LIMIT=18
RAG_HARD_TURN_LIMIT=24

RAG_MAX_SELECTED_DOCUMENTS=20

RAG_REQUEST_TIMEOUT_SECONDS=8
RAG_GENERATION_DEADLINE_SECONDS=18
RAG_MAX_ATTEMPTS_PER_MODEL=1

RAG_REASONING_EFFORT=low
```

## I — Smoke, theo dõi và rollback

Dùng một tài khoản test và tài liệu tổng hợp. Ghi thời điểm, revision, cấu hình, kết quả từng ca và trace ID vào evidence. Load, crash và Redis outage chỉ thử trên môi trường cách ly.

1. Gửi General Ask và kiểm tra câu trả lời.
2. Gửi Document Ask và kiểm tra nguồn thuộc đúng tài liệu đã chọn.
3. Đặt một câu hỏi tiếp nối và kiểm tra ngữ cảnh.
4. Refresh trang và đối chiếu transcript.
5. Kiểm tra Markdown, code và công thức toán.
6. Kiểm tra rolling summary được tạo đúng ngưỡng.
7. Hỏi lại chi tiết xuất hiện từ nhiều lượt trước.
8. Chọn Start fresh và kiểm tra chat mới bắt đầu sạch.
9. Chọn Continue with context và kiểm tra ngữ cảnh được chuyển.
10. Mở history và detail ở chế độ chỉ đọc.
11. Kiểm tra hành vi ở soft limit và hard limit.
12. Replay request đã hoàn tất và đối chiếu ledger để xác nhận không phát sinh generation.
13. Kiểm tra recovery dùng đúng request ID ban đầu.
14. Kiểm tra tài liệu nằm ngoài quyền truy cập bị chặn.
15. Dùng credentials giả để kiểm tra redaction ở biên provider.
16. Kiểm tra quarantine và Fresh recovery bằng tài khoản test còn quyền.
17. Đối chiếu structured logs và trace ID của cùng request.
18. Đối chiếu số provider attempts trong ledger.
19. Kiểm tra usage thiếu được ghi là unknown.
20. Đối chiếu quota settings và Redis scope ở từng consumer.
21. Kiểm tra 429, deadline và latency trên workload được phép.
22. Smoke lại Focus, Goals/Tasks và AI Task Review.

Chạy query read-only trong Supabase sau migration và activation. Dùng service/operator identity sẵn có. Kỳ vọng RLS bật và internal RPC service-only. Xem ledger riêng với terminal metadata.

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and (tablename like 'rag_chat_%' or tablename in ('rag_provider_attempts', 'rag_document_processing_jobs'))
order by tablename;

select p.oid::regprocedure as signature, p.prosecdef as security_definer,
  has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
  has_function_privilege('service_role',p.oid,'EXECUTE') as service_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and (p.proname like 'rag_v2_%' or p.proname in ('rag_begin_document_processing',
    'rag_assert_document_processing','rag_finish_document_processing','rag_assert_legacy_dispatch'))
order by signature;
```

Dùng [operational reports](operations-reports.sql) để đo pending intent, known/unknown usage và P95. Giữ sample count cùng từng failure. Mục tiêu ban đầu gồm healthy eligible Ask ≥99%, General P95 ≤8s, Document P95 ≤12s, replay P95 ≤1s, và 0 dispatch trái quyền, 0 duplicate generation khi replay, 0 vi phạm prompt/memory/provider-call budgets. So sánh local RPM/TPM denial, remote 429, fallback, độ tuổi intent, Redis health và latency theo stage.

Khi lỗi, dừng tầng đang bật. Adaptive regression thì tắt context quality; summary regression thì tạm dừng summary theo policy đã kiểm tra; handoff lỗi thì dừng Continue. Sự cố ACL/privacy, quota, Redis hoặc DB thì pause new generation, giữ auth/quota và recovery. Nếu rollout app lỗi, trở về revision đã xác nhận tương thích với schema đã migrate. Giữ dữ liệu và schema v2. Nếu production đã có v2 transcript, dùng generation-only pause đã kiểm thử để giữ restore/history. [Runbook](operations-runbook.md)

## J–K — Chốt evidence và release

1. Tạo `docs/rag-conversation-v2/phase-6g-release-evidence.md` và điền bằng chứng thực tế. Ghi phạm vi và giới hạn, staging SHA, main merge SHA, branch reconciliation, QA developer-confirmed, REL01–REL10, migration versions, quota allocation, URL CI/CD, Render/Vercel revisions, flags từng stage, đủ 22 ca smoke, monitoring, rollback đã thử, residual risks và người quyết định.
2. Chốt các gates còn mở của mục 29. Đánh dấu **PASS** sau khi source, migrations, quotas, approvals, deploy, exact revisions, activation, smoke và rollback đều có chứng cứ. Thiếu điều kiện thì ghi **NO-GO** cùng blocker và giữ tầng an toàn gần nhất.
3. Commit evidence theo workflow repo, nhớ commit evidence vào branch có CD có thể tạo revision mới. Đối chiếu lại ghi chú SHA nếu workflow chạy. Hai PR chính là preparation vào `product-release` và production release vào `main`; có thể dùng PR staging riêng để đưa combined candidate vào staging. Chốt Phase 6G khi evidence và production trạng thái cuối cùng khớp.
