# Ap dung ai-translations cho noi dung AI generate

## Muc tieu

Lop `apps/web/features/ai-translations/` duoc dung nhu cache dich chung cho cac noi dung do AI sinh ra. Source content van duoc luu o payload goc, con UI server-side se dich sang ngon ngu i18n hien tai truoc khi render.

## Cac feature da ap dung

1. PBI dashboard

- File chinh: `apps/web/app/[locale]/(protected)/dashboard/page.tsx`
- Helper: `apps/web/features/pbi/pbi-translations.server.ts`
- Payload dich: `pbi_band`, `overall_summary`, `component_explanations[].title`, `component_explanations[].message`, `actionable_insights[].title`, `actionable_insights[].body`.
- Entity cache: `pbi_explanation`, `entity_id = pbi_snapshots.id`.

2. Weekly reflections

- File chinh: `apps/web/app/[locale]/(protected)/reflections/page.tsx`
- Query: `apps/web/features/weekly-reflections/weekly-reflection.queries.ts`
- Helper: `apps/web/features/weekly-reflections/weekly-reflection-translations.server.ts`
- Payload dich: `title`, `summary`, `reflection_interpretation`, `confidence_note`, `wins[].student_friendly_explanation`, `watchouts[].student_friendly_explanation`, `next_week_actions[].action`, `next_week_actions[].rationale`.
- Entity cache: `weekly_reflection`, `entity_id = weekly_reflection_cards.id`.

3. RAG study assistant

- File: `apps/web/features/rag/rag-chat.actions.ts`
- Client da truyen `preferredLocale` tu `useLocale()`. Action bay gio forward thanh `preferred_locale` sang AI API, de backend generate cau tra loi dung ngon ngu nguoi dung dang chon ngay tu dau.
- RAG khong can goi translation cache tren web cho message moi, vi prompt/backend da co language instruction va metadata locale.

4. AI insight cards

- Query: `apps/web/features/ai-insights/ai-insight.queries.ts`
- Helper dung chung: `apps/web/features/ai-insights/ai-insight-translations.server.ts`
- Payload dich: `title`, `summary`, `risk_interpretation`, `confidence_note`, `evidence[].student_friendly_explanation`, `recommended_actions[].action`, `recommended_actions[].rationale`.
- Entity cache: `ai_insight_card`, `entity_id = ai_insight_cards.id`.

5. Native task AI insights

- Query: `apps/web/features/native-task-insights/native-task-insight.queries.ts`
- Dung lai helper `translateAiInsightCards` vi native task AI insights cung nam trong bang `ai_insight_cards`.
- Section tren dashboard hien dang comment, nhung query da san sang nhan `targetLocale` khi bat lai.

## Thay doi nen tang

- `AiTranslatableEntityType` duoc bo sung `pbi_explanation` va `ai_insight_card`.
- `translateAiContentBatch` tu chia chunk toi da 30 item/l request de khop voi schema backend. Cac page nhieu card, vi du reflection page lay 20 cards, khong can tu xu ly gioi han batch.
- Cac helper server deu return payload cung shape voi du lieu goc, nen component khong can biet translation layer.
- Locale duoc normalize tu route `[locale]`: `vi` thi dich sang tieng Viet, cac locale khac fallback `en`.

## Ly do chon cach nay

- Giu database payload goc bat bien va tranh mutate content AI da persist.
- Translation chay o server component/query layer, nen client component chi render data da san sang.
- Cache key theo `entity_type`, `entity_id`, `field_name`, `target_locale`, va `source_hash`, nen khi source text doi thi ban dich cu khong bi dung nham.
- Batch helper tap trung hoa gioi han backend, tranh lap logic chunk o tung feature.

## Kiem tra

- TypeScript: `node node_modules/typescript/bin/tsc --noEmit --incremental false` chay thanh cong trong `apps/web`.
- Scoped ESLint cho cac file da sua/them chay thanh cong.
- `npm run lint` toan app hien fail vi ESLint dang quet ca `.next` generated output, khong phai do cac file source vua sua.
