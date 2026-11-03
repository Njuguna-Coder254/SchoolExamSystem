
-- School Examination System
-- Initial database schema

CREATE TABLE IF NOT EXISTS users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    full_name VARCHAR(150) NOT NULL,
    username VARCHAR(80) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role VARCHAR(30) NOT NULL
        CHECK (role IN ('admin', 'teacher', 'invigilator', 'learner')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS classes (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(80) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subjects (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(120) NOT NULL UNIQUE,
    code VARCHAR(30) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS learners (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    admission_number VARCHAR(50) NOT NULL UNIQUE,
    user_id BIGINT UNIQUE REFERENCES users(id),
    class_id BIGINT REFERENCES classes(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS exams (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    subject_id BIGINT NOT NULL REFERENCES subjects(id),
    class_id BIGINT NOT NULL REFERENCES classes(id),
    instructions TEXT,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
    status VARCHAR(20) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'published', 'completed', 'cancelled')),
    created_by BIGINT REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS questions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    exam_id BIGINT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    question_type VARCHAR(20) NOT NULL
        CHECK (question_type IN ('multiple_choice', 'true_false', 'short_answer', 'essay')),
    marks NUMERIC(7,2) NOT NULL CHECK (marks > 0),
    position INTEGER NOT NULL CHECK (position > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (exam_id, position)
);

CREATE TABLE IF NOT EXISTS question_options (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    question_id BIGINT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    option_text TEXT NOT NULL,
    position INTEGER NOT NULL CHECK (position > 0),
    is_correct BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (question_id, position)
);

CREATE TABLE IF NOT EXISTS exam_attempts (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    exam_id BIGINT NOT NULL REFERENCES exams(id),
    learner_id BIGINT NOT NULL REFERENCES learners(id),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    submitted_at TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL DEFAULT 'in_progress'
        CHECK (status IN ('in_progress', 'submitted', 'marked')),
    objective_score NUMERIC(8,2),
    essay_score NUMERIC(8,2),
    total_score NUMERIC(8,2),
    UNIQUE (exam_id, learner_id)
);

CREATE TABLE IF NOT EXISTS answers (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    attempt_id BIGINT NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
    question_id BIGINT NOT NULL REFERENCES questions(id),
    selected_option_id BIGINT REFERENCES question_options(id),
    answer_text TEXT,
    awarded_marks NUMERIC(7,2),
    marked_by BIGINT REFERENCES users(id),
    marked_at TIMESTAMPTZ,
    UNIQUE (attempt_id, question_id)
);

CREATE TABLE IF NOT EXISTS invigilation_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    attempt_id BIGINT NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::JSONB,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exams_class_status
    ON exams(class_id, status);

CREATE INDEX IF NOT EXISTS idx_attempts_exam_status
    ON exam_attempts(exam_id, status);

CREATE INDEX IF NOT EXISTS idx_answers_attempt
    ON answers(attempt_id);

CREATE INDEX IF NOT EXISTS idx_invigilation_attempt_time
    ON invigilation_events(attempt_id, occurred_at);
