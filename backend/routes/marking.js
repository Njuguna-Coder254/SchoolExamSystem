
const express = require("express");
const pool = require("../db");
const { requireAuth, allowRoles } = require("../middleware/auth");

const router = express.Router();

router.use(requireAuth);

const ADMIN_ONLY = allowRoles("admin");
const TEACHER_ONLY = allowRoles("teacher");

function parseId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/*
 * Check whether a teacher is assigned to an examination.
 */
async function isAssigned(db, examId, teacherId) {
  const result = await db.query(
    `SELECT id
     FROM exam_teacher_assignments
     WHERE exam_id = $1 AND teacher_id = $2`,
    [examId, teacherId]
  );

  return result.rowCount > 0;
}

/*
 * POST /api/marking/assignments
 *
 * Administrator assigns a teacher to an examination.
 *
 * Body:
 * {
 *   "examId": 1,
 *   "teacherId": 5
 * }
 */
router.post("/assignments", ADMIN_ONLY, async (req, res) => {
  const examId = parseId(req.body?.examId);
  const teacherId = parseId(req.body?.teacherId);

  if (!examId || !teacherId) {
    return res.status(400).json({
      message: "Valid examination and teacher IDs are required.",
    });
  }

  try {
    const [examResult, teacherResult] = await Promise.all([
      pool.query("SELECT id FROM exams WHERE id = $1", [examId]),
      pool.query(
        `SELECT id, full_name, username
         FROM users
         WHERE id = $1
           AND LOWER(role) = 'teacher'
           AND is_active = TRUE`,
        [teacherId]
      ),
    ]);

    if (examResult.rowCount === 0) {
      return res.status(404).json({
        message: "Examination not found.",
      });
    }

    if (teacherResult.rowCount === 0) {
      return res.status(404).json({
        message: "Active teacher account not found.",
      });
    }

    const result = await pool.query(
      `INSERT INTO exam_teacher_assignments
         (exam_id, teacher_id, assigned_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (exam_id, teacher_id) DO NOTHING
       RETURNING id, exam_id, teacher_id, assigned_at`,
      [examId, teacherId, req.user.id]
    );

    return res.status(201).json({
      message: result.rowCount
        ? "Teacher assigned successfully."
        : "This teacher is already assigned to the examination.",
      assignment: result.rows[0] || null,
      teacher: teacherResult.rows[0],
    });
  } catch (error) {
    console.error("Assign examination teacher error:", error);

    return res.status(500).json({
      message: "Unable to assign teacher.",
    });
  }
});

/*
 * GET /api/marking/assignments
 *
 * Administrator views all examination assignments.
 */
router.get("/assignments", ADMIN_ONLY, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         a.id,
         a.exam_id,
         a.teacher_id,
         a.assigned_at,
         e.title AS exam_title,
         e.status AS exam_status,
         c.name AS class_name,
         s.name AS subject,
         u.full_name AS teacher_name,
         u.username AS teacher_username
       FROM exam_teacher_assignments a
       JOIN exams e ON e.id = a.exam_id
       JOIN users u ON u.id = a.teacher_id
       LEFT JOIN classes c ON c.id = e.class_id
       LEFT JOIN subjects s ON s.id = e.subject_id
       ORDER BY a.assigned_at DESC`
    );

    return res.json({ assignments: result.rows });
  } catch (error) {
    console.error("List examination assignments error:", error);

    return res.status(500).json({
      message: "Unable to retrieve assignments.",
    });
  }
});

/*
 * DELETE /api/marking/assignments/:id
 *
 * Administrator removes an examination assignment.
 */
router.delete("/assignments/:id", ADMIN_ONLY, async (req, res) => {
  const assignmentId = parseId(req.params.id);

  if (!assignmentId) {
    return res.status(400).json({
      message: "Invalid assignment ID.",
    });
  }

  try {
    const result = await pool.query(
      `DELETE FROM exam_teacher_assignments
       WHERE id = $1
       RETURNING id`,
      [assignmentId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        message: "Assignment not found.",
      });
    }

    return res.json({
      message: "Teacher assignment removed successfully.",
    });
  } catch (error) {
    console.error("Remove teacher assignment error:", error);

    return res.status(500).json({
      message: "Unable to remove assignment.",
    });
  }
});

/*
 * GET /api/marking/my-exams
 *
 * Teacher views examinations assigned to their account.
 */
router.get("/my-exams", TEACHER_ONLY, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         e.id,
         e.title,
         e.status,
         e.starts_at,
         e.ends_at,
         e.duration_minutes,
         c.name AS class_name,
         s.name AS subject,
         COUNT(DISTINCT a.id)::int AS submitted_attempts,
         COUNT(DISTINCT a.id) FILTER (
           WHERE a.status = 'marked'
         )::int AS marked_attempts
       FROM exam_teacher_assignments ta
       JOIN exams e ON e.id = ta.exam_id
       LEFT JOIN classes c ON c.id = e.class_id
       LEFT JOIN subjects s ON s.id = e.subject_id
       LEFT JOIN exam_attempts a
         ON a.exam_id = e.id
        AND a.status IN ('submitted', 'marked')
       WHERE ta.teacher_id = $1
       GROUP BY e.id, c.name, s.name, ta.assigned_at
       ORDER BY ta.assigned_at DESC`,
      [req.user.id]
    );

    return res.json({ exams: result.rows });
  } catch (error) {
    console.error("Teacher assigned exams error:", error);

    return res.status(500).json({
      message: "Unable to retrieve assigned examinations.",
    });
  }
});

/*
 * GET /api/marking/exams/:examId/attempts
 *
 * Teacher views submitted attempts for an assigned examination.
 */
router.get(
  "/exams/:examId/attempts",
  TEACHER_ONLY,
  async (req, res) => {
    const examId = parseId(req.params.examId);

    if (!examId) {
      return res.status(400).json({
        message: "Invalid examination ID.",
      });
    }

    try {
      if (!(await isAssigned(pool, examId, req.user.id))) {
        return res.status(403).json({
          message: "You are not assigned to mark this examination.",
        });
      }

      const result = await pool.query(
        `SELECT
           a.id AS attempt_id,
           a.status,
           a.started_at,
           a.submitted_at,
           a.objective_score,
           a.essay_score,
           a.total_score,
           l.id AS learner_id,
           l.admission_number,
           l.assessment_number,
           u.full_name AS learner_name,
           c.name AS class_name,
           (
             SELECT COUNT(*)::int
             FROM questions q
             WHERE q.exam_id = a.exam_id
               AND q.question_type IN ('short_answer', 'essay')
           ) AS written_question_count,
           (
             SELECT COUNT(*)::int
             FROM answers ans
             JOIN questions q ON q.id = ans.question_id
             WHERE ans.attempt_id = a.id
               AND q.question_type IN ('short_answer', 'essay')
               AND ans.awarded_marks IS NOT NULL
           ) AS marked_written_count
         FROM exam_attempts a
         JOIN learners l ON l.id = a.learner_id
         JOIN users u ON u.id = l.user_id
         LEFT JOIN classes c ON c.id = l.class_id
         WHERE a.exam_id = $1
           AND a.status IN ('submitted', 'marked')
         ORDER BY a.submitted_at, u.full_name`,
        [examId]
      );

      return res.json({ attempts: result.rows });
    } catch (error) {
      console.error("List marking attempts error:", error);

      return res.status(500).json({
        message: "Unable to retrieve examination submissions.",
      });
    }
  }
);

/*
 * GET /api/marking/attempts/:attemptId
 *
 * Teacher views questions and learner responses for marking.
 * Correct objective answers are not exposed.
 */
router.get(
  "/attempts/:attemptId",
  TEACHER_ONLY,
  async (req, res) => {
    const attemptId = parseId(req.params.attemptId);

    if (!attemptId) {
      return res.status(400).json({
        message: "Invalid attempt ID.",
      });
    }

    try {
      const attemptResult = await pool.query(
        `SELECT
           a.id,
           a.exam_id,
           a.learner_id,
           a.status,
           a.started_at,
           a.submitted_at,
           a.objective_score,
           a.essay_score,
           a.total_score,
           e.title AS exam_title,
           l.admission_number,
           l.assessment_number,
           u.full_name AS learner_name,
           c.name AS class_name
         FROM exam_attempts a
         JOIN exams e ON e.id = a.exam_id
         JOIN learners l ON l.id = a.learner_id
         JOIN users u ON u.id = l.user_id
         LEFT JOIN classes c ON c.id = l.class_id
         WHERE a.id = $1`,
        [attemptId]
      );

      if (attemptResult.rowCount === 0) {
        return res.status(404).json({
          message: "Examination attempt not found.",
        });
      }

      const attempt = attemptResult.rows[0];

      if (!(await isAssigned(pool, attempt.exam_id, req.user.id))) {
        return res.status(403).json({
          message: "You are not assigned to mark this examination.",
        });
      }

      if (!["submitted", "marked"].includes(attempt.status)) {
        return res.status(409).json({
          message: "This examination has not been submitted.",
        });
      }

      const questionsResult = await pool.query(
        `SELECT
           q.id AS question_id,
           q.question_text,
           q.question_type,
           q.marks AS maximum_marks,
           q.position,
           ans.answer_text,
           ans.selected_option_id,
           ans.awarded_marks,
           ans.marked_at,
           marker.full_name AS marked_by_name,
           COALESCE(
             (
               SELECT json_agg(
                 json_build_object(
                   'id', o.id,
                   'option_text', o.option_text,
                   'position', o.position
                 )
                 ORDER BY o.position
               )
               FROM question_options o
               WHERE o.question_id = q.id
             ),
             '[]'::json
           ) AS options
         FROM questions q
         LEFT JOIN answers ans
           ON ans.question_id = q.id
          AND ans.attempt_id = $2
         LEFT JOIN users marker
           ON marker.id = ans.marked_by
         WHERE q.exam_id = $1
         ORDER BY q.position, q.id`,
        [attempt.exam_id, attemptId]
      );

      return res.json({
        attempt,
        questions: questionsResult.rows,
      });
    } catch (error) {
      console.error("Get marking attempt error:", error);

      return res.status(500).json({
        message: "Unable to retrieve learner answers.",
      });
    }
  }
);

/*
 * PUT /api/marking/attempts/:attemptId/questions/:questionId
 *
 * Save a teacher's mark for one short-answer or essay question.
 *
 * Body:
 * {
 *   "awardedMarks": 3
 * }
 */
router.put(
  "/attempts/:attemptId/questions/:questionId",
  TEACHER_ONLY,
  async (req, res) => {
    const attemptId = parseId(req.params.attemptId);
    const questionId = parseId(req.params.questionId);
    const awardedMarks = req.body?.awardedMarks;

    if (!attemptId || !questionId) {
      return res.status(400).json({
        message: "Invalid attempt or question ID.",
      });
    }

    if (
      awardedMarks === undefined ||
      awardedMarks === null ||
      typeof awardedMarks !== "number" ||
      !Number.isFinite(awardedMarks) ||
      awardedMarks < 0
    ) {
      return res.status(400).json({
        message: "Enter a valid mark of zero or higher.",
      });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const attemptResult = await client.query(
        `SELECT
           a.id,
           a.exam_id,
           a.status,
           a.objective_score
         FROM exam_attempts a
         WHERE a.id = $1
         FOR UPDATE`,
        [attemptId]
      );

      if (attemptResult.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          message: "Examination attempt not found.",
        });
      }

      const attempt = attemptResult.rows[0];

      if (!(await isAssigned(client, attempt.exam_id, req.user.id))) {
        await client.query("ROLLBACK");
        return res.status(403).json({
          message: "You are not assigned to mark this examination.",
        });
      }

      if (!["submitted", "marked"].includes(attempt.status)) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          message: "Only submitted examinations can be marked.",
        });
      }

      const questionResult = await client.query(
        `SELECT id, question_type, marks
         FROM questions
         WHERE id = $1 AND exam_id = $2
         FOR UPDATE`,
        [questionId, attempt.exam_id]
      );

      if (questionResult.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          message: "Question does not belong to this examination.",
        });
      }

      const question = questionResult.rows[0];

      if (!["short_answer", "essay"].includes(question.question_type)) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: "Only written questions can be manually marked.",
        });
      }

      if (awardedMarks > Number(question.marks)) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: `The mark cannot exceed ${question.marks}.`,
        });
      }

      await client.query(
        `INSERT INTO answers (
           attempt_id,
           question_id,
           awarded_marks,
           marked_by,
           marked_at
         )
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (attempt_id, question_id)
         DO UPDATE SET
           awarded_marks = EXCLUDED.awarded_marks,
           marked_by = EXCLUDED.marked_by,
           marked_at = NOW()`,
        [attemptId, questionId, awardedMarks, req.user.id]
      );

      const scoreResult = await client.query(
        `SELECT
           COUNT(*)::int AS written_count,
           COUNT(*) FILTER (
             WHERE ans.awarded_marks IS NOT NULL
           )::int AS marked_count,
           COALESCE(
             SUM(ans.awarded_marks) FILTER (
               WHERE q.question_type IN ('short_answer', 'essay')
             ),
             0
           ) AS written_score
         FROM questions q
         LEFT JOIN answers ans
           ON ans.question_id = q.id
          AND ans.attempt_id = $2
         WHERE q.exam_id = $1
           AND q.question_type IN ('short_answer', 'essay')`,
        [attempt.exam_id, attemptId]
      );

      const scores = scoreResult.rows[0];
      const allWrittenMarked =
        scores.written_count === scores.marked_count;

      const objectiveScore = Number(attempt.objective_score || 0);
      const writtenScore = Number(scores.written_score || 0);
      const totalScore = objectiveScore + writtenScore;

      const updatedAttempt = await client.query(
        `UPDATE exam_attempts
         SET essay_score = $1,
             total_score = $2,
             status = $3
         WHERE id = $4
         RETURNING id, status, objective_score, essay_score, total_score`,
        [
          writtenScore,
          allWrittenMarked ? totalScore : null,
          allWrittenMarked ? "marked" : "submitted",
          attemptId,
        ]
      );

      await client.query("COMMIT");

      return res.json({
        message: "Mark saved successfully.",
        attempt: updatedAttempt.rows[0],
        markingProgress: {
          writtenQuestions: scores.written_count,
          markedQuestions: scores.marked_count,
          completed: allWrittenMarked,
        },
      });
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch (_) {
        // Transaction may already have ended.
      }

      console.error("Save written mark error:", error);

      return res.status(500).json({
        message: "Unable to save the mark.",
      });
    } finally {
      client.release();
    }
  }
);

module.exports = router;
