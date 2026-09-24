# Lumivox Production CI/CD

## Branches

- Feature/fix/performance branches: development only.
- `product-release`: staging release branch.
- `main`: production release branch.

## Pipeline

### Pull request / push CI

`.github/workflows/ci.yml` runs:

1. Next.js dependency install with `npm ci`.
2. ESLint.
3. Vitest unit tests.
4. Next.js production build.
5. Python source compilation.
6. FastAPI pytest suite.
7. Local Supabase migration replay from a clean database.

No production secrets are used by CI.

### Staging release

A successful push CI run on `product-release` triggers
`.github/workflows/deploy-staging.yml`.

Order:

1. Apply pending migrations to the staging Supabase project.
2. Trigger Render staging deployment for the tested commit SHA.
3. Trigger the Vercel deploy hook for `product-release`.
4. Wait until both health endpoints report the tested SHA.
5. Run Playwright against the deployed staging URL.
6. Upload the Playwright report.

### Production release

A successful push CI run on `main` triggers
`.github/workflows/deploy-production.yml`.

The workflow references the GitHub `production` environment. Configure that
environment with required approval before exposing production secrets.

Order:

1. Apply pending production Supabase migrations.
2. Trigger Render production deployment for the exact tested commit SHA.
3. Trigger the Vercel deploy hook for `main`.
4. Wait until both deployed services report the tested SHA.
5. Run production HTTP smoke checks.

## Deployment kill switches

Create these repository-level Actions variables before enabling CD:

- `STAGING_CD_ENABLED=false`
- `PRODUCTION_CD_ENABLED=false`

The deployment workflows will not run until their corresponding variable is
explicitly changed to `true`. This makes it safe to bootstrap the workflow
files onto the default branch before the external environments are ready.

## GitHub environments

Create two GitHub Environments:

### staging

Secrets:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`
- `SUPABASE_PROJECT_ID`
- `RENDER_DEPLOY_HOOK_URL`
- `VERCEL_DEPLOY_HOOK_URL`
- `E2E_TEST_EMAIL`
- `E2E_TEST_PASSWORD`

Variables:

- `WEB_URL`
- `AI_API_URL`

### production

Secrets:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`
- `SUPABASE_PROJECT_ID`
- `RENDER_DEPLOY_HOOK_URL`
- `VERCEL_DEPLOY_HOOK_URL`

Variables:

- `WEB_URL`
- `AI_API_URL`

Never reuse the staging Supabase project, service-role key, E2E user, or AI
provider credentials in production.

## Vercel

The web project root directory is `apps/web`.

`apps/web/vercel.json` disables automatic Git deployments for
`product-release` and `main`. Feature branches can still use Vercel
preview deployments. Create one Deploy Hook for `product-release` and one for
`main`, then store those hook URLs in their corresponding GitHub Environment.

Health endpoint:

`GET /api/health`

It exposes the Vercel Git commit SHA so the deployment workflow can verify that
it is testing the intended revision.

## Render

Use separate staging and production AI API services.

Recommended configuration:

- Root directory: `services/ai-api`
- Runtime: Python
- Build command: `pip install -r requirements.txt`
- Start command:
  `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Health path: `/api/v1/health`
- Automatic deploys: disabled

Create a Deploy Hook for each service. The workflow appends `ref=<commit SHA>`
to Render's hook, so Render deploys the exact commit that passed CI.

## Supabase

Use separate staging and production projects.

Deployment secrets are supplied through GitHub Environments. The workflows run:

`supabase link --project-ref "$SUPABASE_PROJECT_ID"`

`supabase db push --dry-run`

`supabase db push`

Production workflows never run `db reset` or include seed data.

## Release flow

1. Open a PR from a feature branch into `product-release`.
2. Require CI checks to pass before merge.
3. Merge into `product-release`.
4. Staging is migrated and deployed automatically.
5. Playwright must pass against staging.
6. Open a PR from `product-release` into `main`.
7. Require CI and staging evidence before merge.
8. Merge into `main`.
9. Approve the GitHub `production` environment deployment.
10. Production migration, deployment, revision verification, and smoke checks run.

## Rollback

Application rollback is performed through Vercel/Render deployment history.
Database migrations should use forward-fix migrations. Avoid destructive schema
changes in the same release that removes application compatibility.

Prefer expand -> deploy -> contract migrations for production database changes.


## Python development environment

Keep production and test dependencies separate:

- `requirements.in` -> production dependencies.
- `requirements-dev.in` -> production dependencies plus pytest tooling.
- `requirements.txt` and `requirements-dev.txt` are generated lock files.

Generate both locks from `services/ai-api`:

```powershell
python -m pip install --upgrade pip pip-tools
pip-compile requirements.in --output-file requirements.txt
pip-compile requirements-dev.in --output-file requirements-dev.txt
pip-sync requirements-dev.txt
python -m pytest -q
```

Always use `python -m pytest` so the interpreter that owns the active virtual
environment runs the tests. Calling `pytest` directly can accidentally invoke
a globally installed launcher on Windows.
