
const express = require("express");
const bcrypt = require("bcryptjs");
const pool = require("../db");
const { requireAuth, allowRoles } = require("../middleware/auth");

const router = express.Router();

// All User Management endpoints require an administrator.
router.use(requireAuth, allowRoles("admin"));

// List accounts without exposing password hashes.
router.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, full_name, username, role, is_active, created_at
       FROM users
       ORDER BY full_name, id`
    );

    res.json({ users: result.rows });
  } catch (error) {
    console.error("List users error:", error.message);
    res.status(500).json({
      message: "Unable to retrieve user accounts."
    });
  }
});

// Create a staff account. Administrator accounts cannot be created here.
router.post("/", async (req, res) => {
  const fullName =
    typeof req.body.fullName === "string"
      ? req.body.fullName.trim()
      : "";

  const username =
    typeof req.body.username === "string"
      ? req.body.username.trim()
      : "";

  const password =
    typeof req.body.password === "string"
      ? req.body.password
      : "";

  const role =
    typeof req.body.role === "string"
      ? req.body.role.trim().toLowerCase()
      : "";

  if (!fullName || fullName.length > 150) {
    return res.status(400).json({
      message: "Full name is required and must not exceed 150 characters."
    });
  }

  if (!/^[A-Za-z0-9_.-]{3,80}$/.test(username)) {
    return res.status(400).json({
      message:
        "Username must be 3–80 characters and contain only letters, numbers, dots, underscores or hyphens."
    });
  }

  if (password.length < 10 || password.length > 200) {
    return res.status(400).json({
      message: "Password must contain between 10 and 200 characters."
    });
  }

  if (role !== "teacher") {
    return res.status(400).json({
      message: "Only teacher accounts can be created here."
    });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO users (full_name, username, password_hash, role, is_active)
       VALUES ($1, $2, $3, $4, TRUE)
       RETURNING id, full_name, username, role, is_active, created_at`,
      [fullName, username, passwordHash, role]
    );

    res.status(201).json({
      message: "Staff account created successfully.",
      user: result.rows[0]
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        message: "That username is already in use."
      });
    }

    console.error("Create user error:", error.message);
    res.status(500).json({
      message: "Unable to create the staff account."
    });
  }
});

// Activate or deactivate an account.
router.patch("/:id/status", async (req, res) => {
  const userId = req.params.id;
  const { isActive } = req.body;

  if (!/^[1-9]\d*$/.test(userId)) {
    return res.status(400).json({
      message: "Invalid user ID."
    });
  }

  if (typeof isActive !== "boolean") {
    return res.status(400).json({
      message: "isActive must be true or false."
    });
  }

  if (String(req.user.id) === userId && !isActive) {
    return res.status(400).json({
      message: "You cannot deactivate your own account."
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const updated = await client.query(
      `UPDATE users
       SET is_active = $1
       WHERE id = $2
       RETURNING id, full_name, username, role, is_active, created_at`,
      [isActive, userId]
    );

    if (updated.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        message: "User account not found."
      });
    }

    // Revoke all existing sessions when an account is deactivated.
    if (!isActive) {
      await client.query(
        "DELETE FROM user_sessions WHERE user_id = $1",
        [userId]
      );
    }

    await client.query("COMMIT");

    res.json({
      message: isActive
        ? "User account activated successfully."
        : "User account deactivated and sessions revoked.",
      user: updated.rows[0]
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("Update user status error:", error.message);
    res.status(500).json({
      message: "Unable to update the user account status."
    });
  } finally {
    client.release();
  }
});


// Teaching assignments: a teacher is authorised for the selected class/subject only.
router.get("/teaching-assignments", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT a.id, a.teacher_id, a.class_id, a.subject_id,
             u.full_name AS teacher_name, u.username,
             c.name AS class_name, s.name AS subject_name, s.code AS subject_code
      FROM teacher_teaching_assignments a
      JOIN users u ON u.id = a.teacher_id
      JOIN classes c ON c.id = a.class_id
      JOIN subjects s ON s.id = a.subject_id
      ORDER BY u.full_name, c.name, s.name
    `);
    res.json({ assignments: result.rows });
  } catch (error) {
    console.error("List teaching assignments error:", error.message);
    res.status(500).json({ message: "Unable to retrieve teaching assignments. Run database migration 002 first." });
  }
});

router.post("/teaching-assignments", async (req, res) => {
  const teacherId = Number(req.body.teacherId);
  const classId = Number(req.body.classId);
  const subjectId = Number(req.body.subjectId);
  if (![teacherId, classId, subjectId].every(n => Number.isSafeInteger(n) && n > 0)) {
    return res.status(400).json({ message: "Select a valid teacher, class and subject." });
  }
  try {
    const teacher = await pool.query("SELECT id FROM users WHERE id=$1 AND role='teacher' AND is_active=TRUE", [teacherId]);
    const cls = await pool.query("SELECT id FROM classes WHERE id=$1", [classId]);
    const subject = await pool.query("SELECT id FROM subjects WHERE id=$1", [subjectId]);
    if (!teacher.rowCount || !cls.rowCount || !subject.rowCount) {
      return res.status(400).json({ message: "The teacher, class or subject is invalid or inactive." });
    }
    const result = await pool.query(`
      INSERT INTO teacher_teaching_assignments (teacher_id,class_id,subject_id,assigned_by)
      VALUES ($1,$2,$3,$4)
      ON CONFLICT (teacher_id,class_id,subject_id) DO NOTHING
      RETURNING id
    `, [teacherId,classId,subjectId,req.user.id]);
    res.status(201).json({ message: result.rowCount ? "Teaching assignment saved." : "This teaching assignment already exists." });
  } catch (error) {
    console.error("Create teaching assignment error:", error.message);
    res.status(500).json({ message: "Unable to save teaching assignment. Run database migration 002 first." });
  }
});

router.delete("/teaching-assignments/:id", async (req, res) => {
  if (!/^[1-9]\\d*$/.test(req.params.id)) return res.status(400).json({ message: "Invalid assignment ID." });
  try {
    const result = await pool.query("DELETE FROM teacher_teaching_assignments WHERE id=$1", [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ message: "Teaching assignment not found." });
    res.json({ message: "Teaching assignment removed." });
  } catch (error) {
    console.error("Delete teaching assignment error:", error.message);
    res.status(500).json({ message: "Unable to remove teaching assignment." });
  }
});

module.exports = router;
