CREATE TABLE IF NOT EXISTS test_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id uuid NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  answers jsonb NOT NULL,
  results jsonb NOT NULL,
  earned_points real NOT NULL,
  total_points real NOT NULL,
  score_percentage real NOT NULL,
  passed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_test_attempts_test_id ON test_attempts(test_id);
CREATE INDEX IF NOT EXISTS idx_test_attempts_user_id ON test_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_test_attempts_submitted_at ON test_attempts(submitted_at);
