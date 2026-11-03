
-- IHURURU Junior School examination workflow upgrade
-- Run once against the school_exam database as a database owner.
BEGIN;

ALTER TABLE exams DROP CONSTRAINT IF EXISTS exams_status_check;
ALTER TABLE exams ADD CONSTRAINT exams_status_check
  CHECK (status IN ('draft','pending_approval','approved','published','completed','cancelled'));

ALTER TABLE exams ADD COLUMN IF NOT EXISTS reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS review_notes TEXT;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS teacher_teaching_assignments (
  id BIGSERIAL PRIMARY KEY,
  teacher_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  class_id BIGINT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  subject_id BIGINT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  assigned_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (teacher_id, class_id, subject_id)
);
CREATE INDEX IF NOT EXISTS idx_teaching_assignments_teacher
  ON teacher_teaching_assignments(teacher_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON teacher_teaching_assignments TO exam_app;
GRANT USAGE, SELECT ON SEQUENCE teacher_teaching_assignments_id_seq TO exam_app;

COMMIT;
