> Historical setup guide: the Staging observer and bootstrap publication are completed (PRs #144–#146). Do not re-run role creation against the existing Staging role. Current acceptance and next actions are recorded in phase-9-production-release.md.

# Cấu hình observer Staging — Phase 9C

Chỉ cấu hình project Staging `atbdbbamqjmfkvahqidj`. Không chạy setup này trên Production ở bước hiện tại.

Observer dùng role `task_risk_observer`, không có superuser/BYPASSRLS/membership vào role đặc quyền. Chỉ được SELECT view tổng hợp `task_risk_monitor.health_snapshot`. View do postgres sở hữu để thấy đúng cron/backlog có RLS; không trả dữ liệu từng người dùng.

## 1. Giá trị GitHub environment staging

Hostname dưới đây được đọc từ metadata kết nối của workspace đã link đúng project Staging; đối chiếu lại trong Supabase Connect → Session pooler trước khi nhập nếu dashboard đã thay đổi host.

| Loại | Tên | Giá trị |
| --- | --- | --- |
| Variable | TASK_RISK_MONITOR_PGHOST | aws-0-ap-south-1.pooler.supabase.com |
| Variable | TASK_RISK_MONITOR_PGPORT | 5432 |
| Secret | TASK_RISK_MONITOR_PGUSER | task_risk_observer.atbdbbamqjmfkvahqidj |
| Secret | TASK_RISK_MONITOR_PGPASSWORD | Mật khẩu riêng của role observer tạo ở bước 3 |
| Secret | TASK_RISK_MONITOR_CA_PEM | Toàn bộ certificate PEM tải từ Database Settings của đúng project |

Dùng Session pooler IPv4 cho GitHub runner. Host không có `https://`, port hoặc đường dẫn đi kèm. Username pooler có dạng ROLE.PROJECT_REF. [Supabase connection docs](https://supabase.com/docs/guides/database/connecting-to-postgres)

## 2. Tạo role và view

Mở SQL Editor của project Staging, chạy toàn bộ `scripts/setup-task-risk-observer.sql` bằng role postgres. File không chứa password. Nếu role/schema đã tồn tại, dừng kiểm tra thay vì xóa hoặc cấp lại quyền tự động.

Lưu ý: monitor trên main hiện vẫn dùng query đọc bảng trực tiếp. Bản sửa chuyển sang view nằm trong `scripts/task-risk-recovery-health.sql`; cần publish bản sửa đó trước khi bật monitor thật.

Đã chuẩn bị patch hai file tại `docs/task-risk-recovery/phase-9-observer-bootstrap.patch`. Patch có setup SQL (không tự chạy) và query monitor. Nó không có application code/migration/deploy workflow.

Ví dụ publication riêng, do bạn tự commit/push/merge:

```powershell
cd D:\lumivox-proj
git fetch origin
git worktree add ../lumivox-monitor-observer -b codex/phase9-monitor-observer origin/main
cd ../lumivox-monitor-observer
git apply --check ../lumivox-task-risk/docs/task-risk-recovery/phase-9-observer-bootstrap.patch
git apply ../lumivox-task-risk/docs/task-risk-recovery/phase-9-observer-bootstrap.patch
git add scripts/setup-task-risk-observer.sql scripts/task-risk-recovery-health.sql
git diff --cached --check
git diff --cached --stat
git commit -m "ci: use a scoped read-only task risk observer"
git push -u origin codex/phase9-monitor-observer
```

PR base `main`, compare `codex/phase9-monitor-observer`: đúng hai file. Review/CI trước khi merge. Giữ monitor flags OFF cho tới khi setup và credential test xong.

## 3. Password và certificate

Chỉ password được tạo ngẫu nhiên. Username và certificate không được thay bằng chuỗi random.

PowerShell: sinh 32 bytes ngẫu nhiên thành 64 ký tự hex và copy vào clipboard, không in ra console:

```powershell
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))" | Set-Clipboard
```

Lưu password riêng trong password manager. Dùng đúng cùng giá trị cho PostgreSQL role và GitHub secret TASK_RISK_MONITOR_PGPASSWORD. Chỉ sinh một lần cho đợt cấu hình này.

Tải root certificate tại Supabase Staging → Database Settings → SSL certificate. Ví dụ lưu file ở Downloads/prod-supabase.cer. Certificate là nội dung PEM BEGIN CERTIFICATE / END CERTIFICATE, không phải tên file.

Copy username:

```powershell
Set-Clipboard 'task_risk_observer.atbdbbamqjmfkvahqidj'
```

Copy certificate:

```powershell
$caFile = "$env:USERPROFILE\Downloads\prod-supabase.cer"
$caPem = Get-Content -LiteralPath $caFile -Raw
if ($caPem -notmatch '-----BEGIN CERTIFICATE-----') { throw 'File không phải PEM certificate' }
$caPem | Set-Clipboard
```

Đặt password bằng psql để không ghi plaintext vào SQL Editor history. PostgreSQL client có tại D:/PostgreSQL/18/bin/psql.exe trên máy đã kiểm tra.

Kết nối bằng owner postgres của Staging, nhập mật khẩu owner khi được hỏi:

```powershell
$poolerHost = 'aws-0-ap-south-1.pooler.supabase.com'
$env:PGSSLROOTCERT = "$env:USERPROFILE\Downloads\prod-supabase.cer"
$env:PGSSLMODE = 'verify-full'
& 'D:\PostgreSQL\18\bin\psql.exe' "host=$poolerHost port=5432 dbname=postgres user=postgres.atbdbbamqjmfkvahqidj" -W
```

Trong psql:

```text
\password task_risk_observer
```

Nhập/dán password observer đã sinh hai lần. Sau đó `\q` để thoát. [Supabase PSQL/TLS docs](https://supabase.com/docs/guides/database/psql)

## 4. Kiểm chứng đăng nhập observer

Dùng lại PGSSLMODE/PGSSLROOTCERT trên, rồi:

```powershell
& 'D:\PostgreSQL\18\bin\psql.exe' "host=$poolerHost port=5432 dbname=postgres user=task_risk_observer.atbdbbamqjmfkvahqidj" -W
```

Nhập password observer. Trong psql:

```sql
select current_user, current_setting('default_transaction_read_only');
select snapshot from task_risk_monitor.health_snapshot;
select * from public.task_risk_recovery_attempts limit 1;
```

Mong đợi: current_user là task_risk_observer, default_transaction_read_only=on; view trả JSON aggregate và thấy cron active; query bảng thô trả permission denied. So sánh snapshot với owner; chỉ coi healthy khi alerts=[] và cron có recent success.

Sau khi kết nối thật và secret setup PASS, tạo repository variable TASK_RISK_MONITOR_ENABLED=true. Run workflow trên main, test_alert=false. Staging phải chạy probe; Production vẫn disabled. Kiểm tra thêm scheduled run. Giữ PRODUCTION_CD_ENABLED=false và TASK_RISK_PRODUCTION_MONITOR_ENABLED chưa bật.

## 5. VERCEL_TOKEN

Tên secret đúng là VERCEL_TOKEN.

Vào https://vercel.com/account/tokens → Create Token:
- Name: lumivox-production-cd.
- Chọn team chứa project Lumivox (slug horus-projects-672b8c47), rồi scope riêng project lumivox nếu giao diện cho chọn.
- Chọn expiration phù hợp (ví dụ 30 ngày, ghi nhớ ngày cần rotate).
- Create, copy giá trị ngay vì chỉ hiển thị một lần.
- GitHub repo Settings → Environments → Production → Add environment secret → VERCEL_TOKEN.

Không tạo bằng randomBytes; token phải do Vercel phát hành. Không cần thêm vào NEXT_PUBLIC hoặc frontend. Chưa bật Production CD ở bước này. [Vercel access tokens](https://vercel.com/docs/accounts/access-tokens)

## Đã kiểm thử và giới hạn

Chỉ chạy trên local rehearsal: setup role/view; 13 assertions về aggregate/RLS/deny-read/deny-write/worker-grants; đăng nhập TCP thật bằng observer (default read-only on), health probe trả alerts=[]; 29 safeguard regression tests PASS; cron inactive, simulated failure, overdue claim và cleanup fault tests PASS.

Lần kiểm tra đầu phát hiện owner postgres chưa có SET membership cho role mới trên PostgreSQL 17. Setup đã bổ sung grant SET cho chính owner và kiểm tra lại thành công. Observer không được cấp membership vào postgres.

Chưa áp dụng hosted SQL, đặt hosted password/secret, publish query mới hoặc chạy hosted observer test. Bạn tự tạo/nhập credential và tự commit/push/merge.
