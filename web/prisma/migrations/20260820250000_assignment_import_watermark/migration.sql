-- Сколько слотов персонала уже импортировано из сметы (не добирать удалённые).
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "assignmentImportWatermark" JSONB NOT NULL DEFAULT '{}'::jsonb;
