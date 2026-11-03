const express = require("express");
const pool = require("../db");
const { requireAuth, allowRoles } = require("../middleware/auth");

const router = express.Router();

// Live Center Admin overview. All figures are calculated from the existing database.
router.get("/summary", requireAuth, allowRoles("admin"), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM learners) AS learners,
        (SELECT COUNT(*)::int FROM users WHERE role = 'teacher' AND is_active = TRUE) AS teachers,
        (SELECT COUNT(*)::int FROM exams) AS examinations,
        (SELECT COUNT(*)::int FROM classes) AS classes,
        (SELECT COUNT(*)::int FROM subjects) AS subjects,
        (SELECT COUNT(*)::int FROM exams WHERE status = 'draft') AS draft_examinations,
        (SELECT COUNT(*)::int FROM exams WHERE status = 'published' AND starts_at > NOW()) AS upcoming_examinations,
        (SELECT COUNT(*)::int FROM exams WHERE status = 'published' AND starts_at <= NOW() AND ends_at > NOW()) AS ongoing_examinations,
        (SELECT COUNT(*)::int FROM exams WHERE status = 'completed' OR ends_at <= NOW()) AS completed_examinations,
        (SELECT COUNT(*)::int FROM exam_attempts WHERE status = 'submitted') AS pending_marking,
        (SELECT COUNT(*)::int FROM exam_attempts WHERE status = 'marked') AS marked_scripts,
        (SELECT COUNT(*)::int FROM exam_attempts WHERE status IN ('submitted', 'marked')) AS submitted_scripts,
        (SELECT COUNT(*)::int FROM exam_attempts) AS total_attempts
    `);

    const row = result.rows[0];
    const completed = Number(row.completed_examinations);
    const total = Number(row.examinations);

    res.json({
      summary: {
        totalLearners: Number(row.learners),
        totalTeachers: Number(row.teachers),
        examinations: total,
        classes: Number(row.classes),
        subjects: Number(row.subjects),
        draftExaminations: Number(row.draft_examinations),
        upcomingExaminations: Number(row.upcoming_examinations),
        ongoingExaminations: Number(row.ongoing_examinations),
        completedExaminations: completed,
        pendingMarking: Number(row.pending_marking),
        markedScripts: Number(row.marked_scripts),
        submittedScripts: Number(row.submitted_scripts),
        totalAttempts: Number(row.total_attempts),
        completionRate: total ? Math.round((completed / total) * 100) : 0,
      },
    });
  } catch (error) {
    console.error("Dashboard summary error:", error.message);
    res.status(500).json({ message: "Unable to retrieve dashboard statistics." });
  }
});

module.exports = router;
