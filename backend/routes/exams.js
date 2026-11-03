
const express = require("express");
const pool = require("../db");
const { requireAuth, allowRoles } = require("../middleware/auth");

const router = express.Router();

console.log("Protected examination routes loaded");

router.use(requireAuth);

const ADMIN_TEACHER = allowRoles("admin", "teacher");
const ADMIN_ONLY = allowRoles("admin");
const EXAM_READ_ROLES = allowRoles(
  "admin",
  "teacher",
  "invigilator",
  "learner"
);

function parsePositiveInteger(value) {
  const number = Number(value);

  return Number.isSafeInteger(number) && number > 0
    ? number
    : null;
}

function validateExamInput(body) {
  const title =
    typeof body.title === "string" ? body.title.trim() : "";

  const classId = parsePositiveInteger(body.classId);
  const subjectId = parsePositiveInteger(body.subjectId);
  const durationMinutes = Number(body.durationMinutes);

  const startsAt = new Date(body.startsAt);
  const endsAt = new Date(body.endsAt);

  const instructions =
    typeof body.instructions === "string" ? body.instructions : "";

  if (!title || title.length > 200) {
    return {
      error: "The examination title is required and must not exceed 200 characters.",
    };
  }

  if (!classId || !subjectId) {
    return {
      error: "Select a valid class and subject.",
    };
  }

  if (
    !Number.isInteger(durationMinutes) ||
    durationMinutes < 1 ||
    durationMinutes > 1440
  ) {
    return {
      error: "Duration must be between 1 and 1440 minutes.",
    };
  }

  if (
    !body.startsAt ||
    !body.endsAt ||
    Number.isNaN(startsAt.getTime()) ||
    Number.isNaN(endsAt.getTime())
  ) {
    return {
      error: "Enter valid examination start and end dates.",
    };
  }

  if (endsAt <= startsAt) {
    return {
      error: "The end date and time must be later than the start.",
    };
  }

  if (instructions.length > 10000) {
    return {
      error: "Instructions must not exceed 10,000 characters.",
    };
  }

  return {
    data: {
      title,
      classId,
      subjectId,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      durationMinutes,
      instructions,
    },
  };
}

async function validateClassAndSubject(db, classId, subjectId) {
  const [classResult, subjectResult] = await Promise.all([
    db.query("SELECT id FROM classes WHERE id = $1", [classId]),
    db.query("SELECT id FROM subjects WHERE id = $1", [subjectId]),
  ]);

  return (
    classResult.rowCount > 0 &&
    subjectResult.rowCount > 0
  );
}

/*
 * GET /api/exams
 * List examinations for staff.
 *
 * Learners should use /api/learner-exams/available so draft
 * examinations and answer-management information are not exposed
 * through the general examination-management screen.
 */
router.get(
  "/",
  allowRoles("admin", "teacher", "invigilator"),
  async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT
          e.id,
          e.title,
          e.subject_id,
          e.class_id,
          e.instructions,
          e.starts_at,
          e.ends_at,
          e.duration_minutes,
          e.status,
          e.created_by,
          e.created_at,
          c.name AS class_name,
          s.name AS subject,
          s.code AS subject_code
        FROM exams e
        LEFT JOIN classes c ON c.id = e.class_id
        LEFT JOIN subjects s ON s.id = e.subject_id
        ORDER BY e.created_at DESC, e.id DESC
      `);

      return res.json({ exams: result.rows });
    } catch (error) {
      console.error("List examinations error:", error);

      return res.status(500).json({
        message: "Unable to retrieve examinations.",
      });
    }
  }
);

/*
 * POST /api/exams
 * Create an examination as a draft.
 * Admins and teachers can create drafts.
 */
router.post("/", ADMIN_TEACHER, async (req, res) => {
  const validation = validateExamInput(req.body);

  if (validation.error) {
    return res.status(400).json({
      message: validation.error,
    });
  }

  const exam = validation.data;

  try {
    const referencesValid = await validateClassAndSubject(
      pool,
      exam.classId,
      exam.subjectId
    );

    if (!referencesValid) {
      return res.status(400).json({
        message: "The selected class or subject does not exist.",
      });
    }

    if (req.user.role === "teacher") {
      const teaching = await pool.query(
        `SELECT id FROM teacher_teaching_assignments
         WHERE teacher_id=$1 AND class_id=$2 AND subject_id=$3`,
        [req.user.id, exam.classId, exam.subjectId]
      );
      if (!teaching.rowCount) {
        return res.status(403).json({
          message: "You can only prepare examinations for classes and subjects assigned to you."
        });
      }
    }

    const result = await pool.query(
      `
        INSERT INTO exams (
          title,
          subject_id,
          class_id,
          instructions,
          starts_at,
          ends_at,
          duration_minutes,
          status,
          created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', $8)
        RETURNING *
      `,
      [
        exam.title,
        exam.subjectId,
        exam.classId,
        exam.instructions,
        exam.startsAt,
        exam.endsAt,
        exam.durationMinutes,
        req.user.id,
      ]
    );

    return res.status(201).json({
      message: "Examination created successfully as a draft.",
      exam: result.rows[0],
    });
  } catch (error) {
    console.error("Create examination error:", error);

    return res.status(500).json({
      message: "Unable to create the examination.",
    });
  }
});

/*
 * PATCH /api/exams/:id
 * Administrator-only examination editing and schedule adjustment.
 *
 * Supports changing the title, class, subject, instructions,
 * start/end times, and duration.
 *
 * Class changes are blocked once attempts exist because existing
 * attempts belong to the original class.
 */
router.patch("/:id", ADMIN_ONLY, async (req, res) => {
  const examId = parsePositiveInteger(req.params.id);

  if (!examId) {
    return res.status(400).json({
      message: "Invalid examination ID.",
    });
  }

  const validation = validateExamInput(req.body);

  if (validation.error) {
    return res.status(400).json({
      message: validation.error,
    });
  }

  const exam = validation.data;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const existingResult = await client.query(
      `
        SELECT *
        FROM exams
        WHERE id = $1
        FOR UPDATE
      `,
      [examId]
    );

    if (existingResult.rowCount === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        message: "Examination not found.",
      });
    }

    const existing = existingResult.rows[0];

    if (existing.status === "cancelled") {
      await client.query("ROLLBACK");

      return res.status(400).json({
        message: "A cancelled examination cannot be edited.",
      });
    }

    const referencesValid = await validateClassAndSubject(
      client,
      exam.classId,
      exam.subjectId
    );

    if (!referencesValid) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        message: "The selected class or subject does not exist.",
      });
    }

    if (Number(existing.class_id) !== exam.classId) {
      const attemptsResult = await client.query(
        `
          SELECT COUNT(*)::int AS count
          FROM exam_attempts
          WHERE exam_id = $1
        `,
        [examId]
      );

      if (attemptsResult.rows[0].count > 0) {
        await client.query("ROLLBACK");

        return res.status(409).json({
          message:
            "The class cannot be changed because learners already have examination attempts.",
        });
      }
    }

    const updatedResult = await client.query(
      `
        UPDATE exams
        SET
          title = $1,
          subject_id = $2,
          class_id = $3,
          instructions = $4,
          starts_at = $5,
          ends_at = $6,
          duration_minutes = $7
        WHERE id = $8
        RETURNING *
      `,
      [
        exam.title,
        exam.subjectId,
        exam.classId,
        exam.instructions,
        exam.startsAt,
        exam.endsAt,
        exam.durationMinutes,
        examId,
      ]
    );

    await client.query("COMMIT");

    return res.json({
      message: "Examination updated successfully.",
      exam: updatedResult.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("Update examination error:", error);

    return res.status(500).json({
      message: "Unable to update the examination.",
    });
  } finally {
    client.release();
  }
});

/*
 * POST /api/exams/:id/publish
 * Publish a draft after validating its questions and options.
 */

// Teachers submit their prepared draft for Center Admin review.
router.post("/:id/submit-for-approval", allowRoles("teacher"), async (req, res) => {
  const examId = parsePositiveInteger(req.params.id);
  if (!examId) return res.status(400).json({ message: "Invalid examination ID." });
  try {
    const result = await pool.query(`
      UPDATE exams SET status='pending_approval', submitted_at=NOW()
      WHERE id=$1 AND created_by=$2 AND status='draft'
      RETURNING id,title
    `, [examId, req.user.id]);
    if (!result.rowCount) return res.status(404).json({ message: "Draft not found, or it has already been submitted." });
    res.json({ message: "Examination submitted to Center Admin for review.", exam: result.rows[0] });
  } catch (error) {
    console.error("Submit examination error:", error.message);
    res.status(500).json({ message: "Unable to submit examination. Check that database migration 002 has been applied." });
  }
});

// Center Admin approves or returns a teacher-submitted examination.
router.post("/:id/review", ADMIN_ONLY, async (req, res) => {
  const examId = parsePositiveInteger(req.params.id);
  const decision = String(req.body.decision || "").toLowerCase();
  const notes = typeof req.body.notes === "string" ? req.body.notes.trim().slice(0,3000) : "";
  if (!examId || !["approve","return"].includes(decision)) {
    return res.status(400).json({ message: "Choose approve or return and provide a valid examination ID." });
  }
  try {
    const result = await pool.query(`
      UPDATE exams
      SET status=$1, reviewed_by=$2, reviewed_at=NOW(), review_notes=$3
      WHERE id=$4 AND status='pending_approval'
      RETURNING id,title,status
    `, [decision === "approve" ? "approved" : "draft", req.user.id, notes, examId]);
    if (!result.rowCount) return res.status(404).json({ message: "No examination awaiting review was found." });
    res.json({ message: decision === "approve" ? "Examination approved. You can now schedule and publish it." : "Examination returned to the teacher for revision.", exam: result.rows[0] });
  } catch (error) {
    console.error("Review examination error:", error.message);
    res.status(500).json({ message: "Unable to review examination. Check that database migration 002 has been applied." });
  }
});

router.post("/:id/publish", ADMIN_ONLY, async (req, res) => {
  const examId = parsePositiveInteger(req.params.id);

  if (!examId) {
    return res.status(400).json({
      message: "Invalid examination ID.",
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const examResult = await client.query(
      `
        SELECT id, status
        FROM exams
        WHERE id = $1
        FOR UPDATE
      `,
      [examId]
    );

    if (examResult.rowCount === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        message: "Examination not found.",
      });
    }

    if (!["draft", "approved"].includes(examResult.rows[0].status)) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        message: "Only a draft or an approved examination can be published.",
      });
    }

    const questionResult = await client.query(
      `
        SELECT id, question_type, marks
        FROM questions
        WHERE exam_id = $1
        ORDER BY position, id
      `,
      [examId]
    );

    const questions = questionResult.rows;

    if (questions.length === 0) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        message: "Add at least one question before publishing.",
      });
    }

    for (const question of questions) {
      if (Number(question.marks) <= 0) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          message:
            `Question ${question.id} must have marks greater than zero.`,
        });
      }

      if (
        ["multiple_choice", "true_false"].includes(
          question.question_type
        )
      ) {
        const optionsResult = await client.query(
          `
            SELECT
              COUNT(*)::int AS option_count,
              COUNT(*) FILTER (
                WHERE is_correct = TRUE
              )::int AS correct_count
            FROM question_options
            WHERE question_id = $1
          `,
          [question.id]
        );

        const optionInfo = optionsResult.rows[0];

        if (optionInfo.option_count < 2) {
          await client.query("ROLLBACK");

          return res.status(400).json({
            message:
              `Objective question ${question.id} must have at least two options.`,
          });
        }

        if (optionInfo.correct_count !== 1) {
          await client.query("ROLLBACK");

          return res.status(400).json({
            message:
              `Objective question ${question.id} must have exactly one correct option.`,
          });
        }

        if (
          question.question_type === "true_false" &&
          optionInfo.option_count !== 2
        ) {
          await client.query("ROLLBACK");

          return res.status(400).json({
            message:
              `True/false question ${question.id} must have exactly two options.`,
          });
        }
      }
    }

    const totalMarks = questions.reduce(
      (total, question) => total + Number(question.marks),
      0
    );

    await client.query(
      `
        UPDATE exams
        SET status = 'published'
        WHERE id = $1
      `,
      [examId]
    );

    await client.query("COMMIT");

    return res.json({
      message: "Examination published successfully.",
      examId,
      questionCount: questions.length,
      totalMarks,
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("Publish examination error:", error);

    return res.status(500).json({
      message: "Unable to publish the examination.",
    });
  } finally {
    client.release();
  }
});

/*
 * GET /api/exams/daily-access-code?date=YYYY-MM-DD
 * Retrieve the two-letter prefix for a particular exam date.
 * Administrators only.
 */
router.get(
  "/daily-access-code",
  ADMIN_ONLY,
  async (req, res) => {
    const examDate = req.query.date;

    if (
      typeof examDate !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(examDate)
    ) {
      return res.status(400).json({
        message: "Provide a valid date in YYYY-MM-DD format.",
      });
    }

    try {
      const result = await pool.query(
        `
          SELECT exam_date, access_letters, updated_by, updated_at
          FROM exam_daily_access_codes
          WHERE exam_date = $1::date
        `,
        [examDate]
      );

      if (result.rowCount === 0) {
        return res.json({
          examDate,
          accessLetters: null,
          message: "No access code has been configured for this date.",
        });
      }

      return res.json({
        examDate: result.rows[0].exam_date,
        accessLetters: result.rows[0].access_letters,
        updatedBy: result.rows[0].updated_by,
        updatedAt: result.rows[0].updated_at,
      });
    } catch (error) {
      console.error("Get daily access code error:", error);

      return res.status(500).json({
        message: "Unable to retrieve the daily access code.",
      });
    }
  }
);

/*
 * PUT /api/exams/daily-access-code
 * Create or update the two-letter prefix for an exam date.
 * Administrators only.
 *
 * Expected body:
 * {
 *   "examDate": "2026-10-30",
 *   "accessLetters": "KT"
 * }
 */
router.put(
  "/daily-access-code",
  ADMIN_ONLY,
  async (req, res) => {
    const { examDate, accessLetters } = req.body;

    if (
      typeof examDate !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(examDate)
    ) {
      return res.status(400).json({
        message: "Provide a valid date in YYYY-MM-DD format.",
      });
    }

    // Check that the date actually exists on the calendar.
    const parsedDate = new Date(`${examDate}T00:00:00.000Z`);

    if (
      Number.isNaN(parsedDate.getTime()) ||
      parsedDate.toISOString().slice(0, 10) !== examDate
    ) {
      return res.status(400).json({
        message: "The examination date is invalid.",
      });
    }

    if (
      typeof accessLetters !== "string" ||
      !/^[A-Za-z]{2}$/.test(accessLetters)
    ) {
      return res.status(400).json({
        message: "The access prefix must contain exactly two letters.",
      });
    }

    const prefix = accessLetters.toUpperCase();

    try {
      const result = await pool.query(
        `
          INSERT INTO exam_daily_access_codes (
            exam_date,
            access_letters,
            updated_by,
            updated_at
          )
          VALUES ($1::date, $2, $3, NOW())
          ON CONFLICT (exam_date)
          DO UPDATE SET
            access_letters = EXCLUDED.access_letters,
            updated_by = EXCLUDED.updated_by,
            updated_at = NOW()
          RETURNING exam_date, access_letters, updated_by, updated_at
        `,
        [examDate, prefix, req.user.id]
      );

      return res.json({
        message: "Daily examination access code updated successfully.",
        examDate: result.rows[0].exam_date,
        accessLetters: result.rows[0].access_letters,
        updatedBy: result.rows[0].updated_by,
        updatedAt: result.rows[0].updated_at,
      });
    } catch (error) {
      console.error("Save daily access code error:", error);

      return res.status(500).json({
        message: "Unable to save the daily access code.",
      });
    }
  }
);


/*
 * GET /api/exams/:id
 * Retrieve examination details for staff.
 * Learners must use the dedicated learner examination routes.
 */
router.get("/:id", EXAM_READ_ROLES, async (req, res) => {
  const examId = parsePositiveInteger(req.params.id);

  if (!examId) {
    return res.status(400).json({
      message: "Invalid examination ID.",
    });
  }

  // The learner role is deliberately excluded from this generic
  // endpoint to keep learner access governed by learnerExams.js.
  if (String(req.user.role).toLowerCase() === "learner") {
    return res.status(403).json({
      message:
        "Use the learner examination portal to access examinations.",
    });
  }

  try {
    const result = await pool.query(
      `
        SELECT
          e.id,
          e.title,
          e.subject_id,
          e.class_id,
          e.instructions,
          e.starts_at,
          e.ends_at,
          e.duration_minutes,
          e.status,
          e.created_by,
          e.created_at,
          c.name AS class_name,
          s.name AS subject,
          s.code AS subject_code
        FROM exams e
        LEFT JOIN classes c ON c.id = e.class_id
        LEFT JOIN subjects s ON s.id = e.subject_id
        WHERE e.id = $1
      `,
      [examId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        message: "Examination not found.",
      });
    }

    return res.json({ exam: result.rows[0] });
  } catch (error) {
    console.error("Get examination error:", error);

    return res.status(500).json({
      message: "Unable to retrieve the examination.",
    });
  }
});

module.exports = router;
