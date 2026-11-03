
const express = require("express");
const pool = require("../db");
const { requireAuth, allowRoles } = require("../middleware/auth");

const router = express.Router();

router.use(requireAuth, allowRoles("learner"));

/*
 * Identify the learner linked to the authenticated account.
 */
async function getLearner(userId, db = pool) {
  const result = await db.query(
    `SELECT id, class_id, admission_number
     FROM learners
     WHERE user_id = $1`,
    [userId]
  );

  return result.rows[0] || null;
}

/*
 * Calculate the server-controlled deadline.
 * The attempt deadline cannot exceed the exam's scheduled end.
 */
function getDeadline(attempt, exam) {
  const startedAt = new Date(attempt.started_at).getTime();
  const durationMs = Number(exam.duration_minutes) * 60 * 1000;
  const scheduledEnd = new Date(exam.ends_at).getTime();

  return new Date(
    Math.min(startedAt + durationMs, scheduledEnd)
  );
}

/*
 * Submit an attempt and automatically mark objective questions.
 * Essay and short-answer questions remain for manual marking.
 */
async function finalizeAttempt(attemptId, db = pool) {
  const result = await db.query(
    `UPDATE exam_attempts a
     SET status = 'submitted',
         submitted_at = COALESCE(a.submitted_at, NOW()),
         objective_score = (
           SELECT COALESCE(SUM(q.marks), 0)
           FROM answers ans
           JOIN questions q ON q.id = ans.question_id
           JOIN question_options o
             ON o.id = ans.selected_option_id
           WHERE ans.attempt_id = a.id
             AND q.question_type IN ('multiple_choice', 'true_false')
             AND o.is_correct = TRUE
         ),
         total_score = CASE
           WHEN NOT EXISTS (
             SELECT 1
             FROM questions q
             WHERE q.exam_id = a.exam_id
               AND q.question_type IN ('short_answer', 'essay')
           )
           THEN (
             SELECT COALESCE(SUM(q.marks), 0)
             FROM answers ans
             JOIN questions q ON q.id = ans.question_id
             JOIN question_options o
               ON o.id = ans.selected_option_id
             WHERE ans.attempt_id = a.id
               AND q.question_type IN ('multiple_choice', 'true_false')
               AND o.is_correct = TRUE
           )
           ELSE NULL
         END
     WHERE a.id = $1
       AND a.status = 'in_progress'
     RETURNING id, status, submitted_at, objective_score, total_score`,
    [attemptId]
  );

  return result.rows[0] || null;
}

/*
 * GET /api/learner-exams/available
 *
 * List published exams for the learner's class that are
 * currently within their scheduled availability window.
 */
router.get("/available", async (req, res) => {
  try {
    const learner = await getLearner(req.user.id);

    if (!learner) {
      return res.status(403).json({
        message: "Your account is not linked to a learner record.",
      });
    }

    if (!learner.class_id) {
      return res.status(403).json({
        message: "Your learner account has no assigned class.",
      });
    }

    const result = await pool.query(
      `SELECT
         e.id,
         e.title,
         e.instructions,
         e.starts_at,
         e.ends_at,
         e.duration_minutes,
         s.name AS subject,
         s.code AS subject_code,
         c.name AS class_name,
         a.id AS attempt_id,
         a.status AS attempt_status,
         a.started_at,
         a.submitted_at
       FROM exams e
       JOIN subjects s ON s.id = e.subject_id
       JOIN classes c ON c.id = e.class_id
       LEFT JOIN exam_attempts a
         ON a.exam_id = e.id
        AND a.learner_id = $1
       WHERE e.class_id = $2
         AND e.status = 'published'
         AND NOW() >= e.starts_at
         AND NOW() < e.ends_at
       ORDER BY e.starts_at, e.id`,
      [learner.id, learner.class_id]
    );

    return res.json({ exams: result.rows });
  } catch (error) {
    console.error("Available learner exams error:", error.message);

    return res.status(500).json({
      message: "Unable to retrieve available examinations.",
    });
  }
});

/*
 * POST /api/learner-exams/:examId/start
 *
 * Create the learner's single attempt or resume an existing
 * in-progress attempt.
 */
router.post("/:examId/start", async (req, res) => {
  const examId = req.params.examId;

  if (!/^\d+$/.test(examId) || BigInt(examId) < 1n) {
    return res.status(400).json({
      message: "Invalid examination ID.",
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const learner = await getLearner(req.user.id, client);

    if (!learner) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        message: "Your account is not linked to a learner record.",
      });
    }

    if (!learner.class_id) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        message: "Your learner account has no assigned class.",
      });
    }

    const examResult = await client.query(
      `SELECT
         id, title, instructions, class_id,
         starts_at, ends_at, duration_minutes, status
       FROM exams
       WHERE id = $1
       FOR UPDATE`,
      [examId]
    );

    if (examResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        message: "Examination not found.",
      });
    }

    const exam = examResult.rows[0];

    if (
      exam.status !== "published" ||
      String(exam.class_id) !== String(learner.class_id)
    ) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        message: "This examination is not available to your account.",
      });
    }

    const existingResult = await client.query(
      `SELECT id, exam_id, learner_id, started_at,
              submitted_at, status
       FROM exam_attempts
       WHERE exam_id = $1 AND learner_id = $2
       FOR UPDATE`,
      [examId, learner.id]
    );

    if (existingResult.rowCount > 0) {
      const attempt = existingResult.rows[0];

      if (attempt.status !== "in_progress") {
        await client.query("COMMIT");

        return res.status(409).json({
          message: "You have already submitted this examination.",
          attemptId: attempt.id,
          status: attempt.status,
        });
      }

      const deadline = getDeadline(attempt, exam);

      if (Date.now() >= deadline.getTime()) {
        const submitted = await finalizeAttempt(attempt.id, client);

        await client.query("COMMIT");

        return res.status(409).json({
          message: "Your examination time has expired.",
          attempt: submitted,
        });
      }

      await client.query("COMMIT");

      return res.json({
        message: "Resuming your existing examination.",
        attempt: {
          id: attempt.id,
          status: attempt.status,
          startedAt: attempt.started_at,
          deadline: deadline.toISOString(),
        },
      });
    }

    const now = Date.now();
    const startsAt = new Date(exam.starts_at).getTime();
    const endsAt = new Date(exam.ends_at).getTime();

    if (now < startsAt || now >= endsAt) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        message: "The examination is outside its scheduled time.",
      });
    }

    const questionCount = await client.query(
      "SELECT COUNT(*)::int AS count FROM questions WHERE exam_id = $1",
      [examId]
    );

    if (questionCount.rows[0].count === 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        message: "This examination has no questions.",
      });
    }

    const created = await client.query(
      `INSERT INTO exam_attempts
         (exam_id, learner_id, status)
       VALUES ($1, $2, 'in_progress')
       RETURNING id, exam_id, learner_id, started_at, status`,
      [examId, learner.id]
    );

    const attempt = created.rows[0];
    const deadline = getDeadline(attempt, exam);

    await client.query("COMMIT");

    return res.status(201).json({
      message: "Examination started successfully.",
      exam: {
        id: exam.id,
        title: exam.title,
        instructions: exam.instructions,
        durationMinutes: exam.duration_minutes,
      },
      attempt: {
        id: attempt.id,
        status: attempt.status,
        startedAt: attempt.started_at,
        deadline: deadline.toISOString(),
      },
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {
      // The transaction may already have been completed.
    }

    if (error.code === "23505") {
      return res.status(409).json({
        message:
          "An attempt already exists. Refresh the available examinations.",
      });
    }

    console.error("Start learner exam error:", error.message);

    return res.status(500).json({
      message: "Unable to start the examination.",
    });
  } finally {
    client.release();
  }
});

/*
 * GET /api/learner-exams/attempts/:attemptId
 *
 * Retrieve questions and saved answers for the learner's own
 * attempt. Correct-answer flags are never returned.
 */
router.get("/attempts/:attemptId", async (req, res) => {
  const attemptId = req.params.attemptId;

  if (!/^\d+$/.test(attemptId) || BigInt(attemptId) < 1n) {
    return res.status(400).json({ message: "Invalid attempt ID." });
  }

  try {
    const learner = await getLearner(req.user.id);

    if (!learner) {
      return res.status(403).json({
        message: "Your account is not linked to a learner record.",
      });
    }

    const attemptResult = await pool.query(
      `SELECT
         a.id, a.exam_id, a.status, a.started_at, a.submitted_at,
         e.title, e.instructions, e.duration_minutes, e.starts_at, e.ends_at
       FROM exam_attempts a
       JOIN exams e ON e.id = a.exam_id
       WHERE a.id = $1 AND a.learner_id = $2`,
      [attemptId, learner.id]
    );

    if (attemptResult.rowCount === 0) {
      return res.status(404).json({
        message: "Examination attempt not found.",
      });
    }

    const attempt = attemptResult.rows[0];
    const deadline = getDeadline(attempt, attempt);

    if (
      attempt.status === "in_progress" &&
      Date.now() >= deadline.getTime()
    ) {
      const submitted = await finalizeAttempt(attempt.id);

      return res.json({
        attempt: {
          ...attempt,
          status: submitted?.status || "submitted",
          submitted_at: submitted?.submitted_at || new Date().toISOString(),
        },
        deadline: deadline.toISOString(),
        expired: true,
        questions: [],
      });
    }

    const [questionsResult, answersResult] = await Promise.all([
      pool.query(
        `SELECT
           q.id, q.question_text, q.question_type, q.marks, q.position,
           COALESCE(
             json_agg(
               json_build_object(
                 'id', o.id,
                 'option_text', o.option_text,
                 'position', o.position
               ) ORDER BY o.position
             ) FILTER (WHERE o.id IS NOT NULL),
             '[]'::json
           ) AS options
         FROM questions q
         LEFT JOIN question_options o ON o.question_id = q.id
         WHERE q.exam_id = $1
         GROUP BY q.id
         ORDER BY q.position`,
        [attempt.exam_id]
      ),
      pool.query(
        `SELECT question_id, selected_option_id, answer_text
         FROM answers
         WHERE attempt_id = $1`,
        [attempt.id]
      ),
    ]);

    return res.json({
      attempt,
      deadline: deadline.toISOString(),
      expired: false,
      questions: questionsResult.rows,
      answers: answersResult.rows,
    });
  } catch (error) {
    console.error("Get learner attempt error:", error.message);

    return res.status(500).json({
      message: "Unable to load your examination.",
    });
  }
});

/*
 * PUT /api/learner-exams/attempts/:attemptId/answers
 *
 * Save or update one answer. The server checks ownership,
 * deadline, question membership, and selected-option membership.
 */
router.put("/attempts/:attemptId/answers", async (req, res) => {
  const attemptId = req.params.attemptId;
  const { questionId, selectedOptionId = null, answerText = null } =
    req.body || {};

  if (
    !/^\d+$/.test(attemptId) ||
    BigInt(attemptId) < 1n ||
    !/^\d+$/.test(String(questionId)) ||
    BigInt(String(questionId)) < 1n
  ) {
    return res.status(400).json({
      message: "Provide valid attempt and question IDs.",
    });
  }

  if (
    selectedOptionId !== null &&
    (!/^\d+$/.test(String(selectedOptionId)) ||
      BigInt(String(selectedOptionId)) < 1n)
  ) {
    return res.status(400).json({
      message: "Invalid selected option.",
    });
  }

  if (
    answerText !== null &&
    typeof answerText !== "string"
  ) {
    return res.status(400).json({
      message: "Answer text must be a string.",
    });
  }

  if (typeof answerText === "string" && answerText.length > 20000) {
    return res.status(400).json({
      message: "Answer text is too long.",
    });
  }

  if (selectedOptionId === null && answerText === null) {
    return res.status(400).json({
      message: "Provide an answer or clear it explicitly.",
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const learner = await getLearner(req.user.id, client);

    if (!learner) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        message: "Your account is not linked to a learner record.",
      });
    }

    const attemptResult = await client.query(
      `SELECT
         a.id, a.exam_id, a.status, a.started_at,
         e.duration_minutes, e.ends_at
       FROM exam_attempts a
       JOIN exams e ON e.id = a.exam_id
       WHERE a.id = $1 AND a.learner_id = $2
       FOR UPDATE OF a`,
      [attemptId, learner.id]
    );

    if (attemptResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        message: "Examination attempt not found.",
      });
    }

    const attempt = attemptResult.rows[0];

    if (attempt.status !== "in_progress") {
      await client.query("ROLLBACK");
      return res.status(409).json({
        message: "This examination has already been submitted.",
      });
    }

    const deadline = getDeadline(attempt, attempt);

    if (Date.now() >= deadline.getTime()) {
      const submitted = await finalizeAttempt(attempt.id, client);

      await client.query("COMMIT");

      return res.status(409).json({
        message: "Your examination time has expired.",
        attempt: submitted,
      });
    }

    const questionResult = await client.query(
      `SELECT id, question_type
       FROM questions
       WHERE id = $1 AND exam_id = $2`,
      [questionId, attempt.exam_id]
    );

    if (questionResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: "That question does not belong to this examination.",
      });
    }

    const question = questionResult.rows[0];

    if (
      selectedOptionId !== null &&
      !["multiple_choice", "true_false"].includes(question.question_type)
    ) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: "This question does not accept an option selection.",
      });
    }

    if (
      answerText !== null &&
      !["short_answer", "essay"].includes(question.question_type)
    ) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: "This question does not accept written text.",
      });
    }

    if (selectedOptionId !== null) {
      const optionResult = await client.query(
        `SELECT id
         FROM question_options
         WHERE id = $1 AND question_id = $2`,
        [selectedOptionId, questionId]
      );

      if (optionResult.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: "The selected option does not belong to this question.",
        });
      }
    }

    const saved = await client.query(
      `INSERT INTO answers
         (attempt_id, question_id, selected_option_id, answer_text)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (attempt_id, question_id)
       DO UPDATE SET
         selected_option_id = EXCLUDED.selected_option_id,
         answer_text = EXCLUDED.answer_text
       RETURNING question_id, selected_option_id, answer_text`,
      [
        attempt.id,
        questionId,
        selectedOptionId,
        answerText,
      ]
    );

    await client.query("COMMIT");

    return res.json({
      message: "Answer saved.",
      answer: saved.rows[0],
      deadline: deadline.toISOString(),
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {
      // The transaction may already have been completed.
    }

    console.error("Save learner answer error:", error.message);

    return res.status(500).json({
      message: "Unable to save your answer.",
    });
  } finally {
    client.release();
  }
});

/*
 * POST /api/learner-exams/attempts/:attemptId/submit
 *
 * Submit an attempt and automatically mark objective questions.
 */
router.post("/attempts/:attemptId/submit", async (req, res) => {
  const attemptId = req.params.attemptId;

  if (!/^\d+$/.test(attemptId) || BigInt(attemptId) < 1n) {
    return res.status(400).json({ message: "Invalid attempt ID." });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const learner = await getLearner(req.user.id, client);

    if (!learner) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        message: "Your account is not linked to a learner record.",
      });
    }

    const attemptResult = await client.query(
      `SELECT id, status
       FROM exam_attempts
       WHERE id = $1 AND learner_id = $2
       FOR UPDATE`,
      [attemptId, learner.id]
    );

    if (attemptResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        message: "Examination attempt not found.",
      });
    }

    const attempt = attemptResult.rows[0];

    if (attempt.status !== "in_progress") {
      await client.query("ROLLBACK");
      return res.status(409).json({
        message: "This examination has already been submitted.",
        status: attempt.status,
      });
    }

    const submitted = await finalizeAttempt(attempt.id, client);

    await client.query("COMMIT");

    return res.json({
      message: "Examination submitted successfully.",
      attempt: submitted,
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {
      // The transaction may already have been completed.
    }

    console.error("Submit learner exam error:", error.message);

    return res.status(500).json({
      message: "Unable to submit the examination.",
    });
  } finally {
    client.release();
  }
});

module.exports = router;
