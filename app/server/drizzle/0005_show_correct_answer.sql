ALTER TABLE "tests"
ADD COLUMN IF NOT EXISTS "show_correct_answer" boolean NOT NULL DEFAULT true;
