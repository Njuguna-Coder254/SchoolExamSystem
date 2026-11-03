
const express = require("express");
const pool = require("../db");
const { requireAuth, allowRoles } = require("../middleware/auth");

const router = express.Router();

// GET /api/questions/exam/:examId
// List questions for an examination.
router.get(
  "/exam/:examId",
  requireAuth,
  allowRoles("admin", "teacher", "invigilator"),
  async (req, res) => {
    try {
      const { examId } = req.params;

      if (!/^\d+$/.test(examId)) {
        return res.status(400).json({ message: "Invalid examination ID." });
      }

      const result = await pool.query(
        `SELECT
           q.id,
           q.exam_id,
           q.question_text,
           q.question_type,
           q.marks,
           q.position,
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
        [examId]
      );

      res.json({ questions: result.rows });
    } catch (error) {
      console.error("List questions error:", error.message);
      res.status(500).json({ message: "Unable to load questions." });
    }
  }
);

// POST /api/questions
// Add a question to a draft examination.
router.post(
  "/",
  requireAuth,
  allowRoles("admin", "teacher"),
  async (req, res) => {
    const {
      examId,
      questionText,
      questionType,
      marks,
      options = [],
      correctOptionIndex,
    } = req.body;

    const validTypes = [
      "multiple_choice",
      "true_false",
      "short_answer",
      "essay",
    ];

    if (
      !examId ||
      !/^\d+$/.test(String(examId)) ||
      !questionText?.trim() ||
      !validTypes.includes(questionType) ||
      !Number.isFinite(Number(marks)) ||
      Number(marks) <= 0
    ) {
      return res.status(400).json({
        message: "Provide a valid examination, question, type, and positive mark value.",
      });
    }

    const objective = ["multiple_choice", "true_false"].includes(questionType);

    if (objective) {
      const expectedCount = questionType === "true_false" ? 2 : null;

      if (
        !Array.isArray(options) ||
        options.length < 2 ||
        (expectedCount !== null && options.length !== expectedCount) ||
        options.some((option) => !String(option).trim()) ||
        !Number.isInteger(correctOptionIndex) ||
        correctOptionIndex < 0 ||
        correctOptionIndex >= options.length
      ) {
        return res.status(400).json({
          message: "Provide valid options and select exactly one correct option.",
        });
      }
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const examResult = await client.query(
        "SELECT id, status FROM exams WHERE id = $1 FOR UPDATE",
        [examId]
      );

      if (examResult.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Examination not found." });
      }

      if (examResult.rows[0].status !== "draft") {
        await client.query("ROLLBACK");
        return res.status(409).json({
          message: "Questions can only be added while the examination is a draft.",
        });
      }

      if (req.user.role === "teacher") {
        const ownership = await client.query(
          `SELECT e.created_by, e.class_id, e.subject_id
           FROM exams e WHERE e.id=$1`, [examId]
        );
        const exam = ownership.rows[0];
        const authorised = exam && String(exam.created_by) === String(req.user.id)
          ? await client.query(
              `SELECT id FROM teacher_teaching_assignments
               WHERE teacher_id=$1 AND class_id=$2 AND subject_id=$3`,
              [req.user.id, exam.class_id, exam.subject_id]
            )
          : { rowCount: 0 };
        if (!authorised.rowCount) {
          await client.query("ROLLBACK");
          return res.status(403).json({ message: "You may only add questions to your own draft examinations for your assigned classes and subjects." });
        }
      }

      const positionResult = await client.query(
        "SELECT COALESCE(MAX(position), 0) + 1 AS next_position FROM questions WHERE exam_id = $1",
        [examId]
      );

      const position = Number(positionResult.rows[0].next_position);

      const questionResult = await client.query(
        `INSERT INTO questions
           (exam_id, question_text, question_type, marks, position)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, exam_id, question_text, question_type, marks, position`,
        [examId, questionText.trim(), questionType, Number(marks), position]
      );

      const question = questionResult.rows[0];

      if (objective) {
        for (let index = 0; index < options.length; index += 1) {
          await client.query(
            `INSERT INTO question_options
               (question_id, option_text, position, is_correct)
             VALUES ($1, $2, $3, $4)`,
            [
              question.id,
              String(options[index]).trim(),
              index + 1,
              index === correctOptionIndex,
            ]
          );
        }
      }

      await client.query("COMMIT");

      res.status(201).json({
        message: "Question added successfully.",
        question,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Create question error:", error.message);
      res.status(500).json({ message: "Unable to save the question." });
    } finally {
      client.release();
    }
  }
);

module.exports = router;
