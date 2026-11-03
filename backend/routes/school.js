
const express = require("express");
const pool = require("../db");
const { requireAuth, allowRoles } = require("../middleware/auth");

const router = express.Router();

// Roles allowed to view school information
const canViewSchoolData = allowRoles(
  "admin",
  "teacher",
  "invigilator",
  "learner"
);

// List classes — login required
router.get("/classes", requireAuth, canViewSchoolData, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, name FROM classes ORDER BY name"
    );

    res.json({ classes: result.rows });
  } catch (error) {
    console.error("List classes error:", error.message);
    res.status(500).json({ message: "Unable to retrieve classes." });
  }
});

// List subjects — login required
router.get("/subjects", requireAuth, canViewSchoolData, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, name, code FROM subjects ORDER BY name"
    );

    res.json({ subjects: result.rows });
  } catch (error) {
    console.error("List subjects error:", error.message);
    res.status(500).json({ message: "Unable to retrieve subjects." });
  }
});

// Add a class — administrators only
router.post(
  "/classes",
  requireAuth,
  allowRoles("admin"),
  async (req, res) => {
    const name =
      typeof req.body.name === "string" ? req.body.name.trim() : "";

    if (!name || name.length > 80) {
      return res.status(400).json({
        message: "Class name is required and must not exceed 80 characters.",
      });
    }

    try {
      const result = await pool.query(
        `INSERT INTO classes (name)
         VALUES ($1)
         RETURNING id, name`,
        [name]
      );

      res.status(201).json({ class: result.rows[0] });
    } catch (error) {
      if (error.code === "23505") {
        return res.status(409).json({
          message: "This class already exists.",
        });
      }

      console.error("Create class error:", error.message);
      res.status(500).json({ message: "Unable to create class." });
    }
  }
);

// Add a subject — administrators only
router.post(
  "/subjects",
  requireAuth,
  allowRoles("admin"),
  async (req, res) => {
    const name =
      typeof req.body.name === "string" ? req.body.name.trim() : "";
    const code =
      typeof req.body.code === "string"
        ? req.body.code.trim().toUpperCase()
        : "";

    if (
      !name ||
      name.length > 120 ||
      !/^[A-Z0-9_-]{2,30}$/.test(code)
    ) {
      return res.status(400).json({
        message:
          "Provide a valid subject name and code (2–30 letters, numbers, _ or -).",
      });
    }

    try {
      const result = await pool.query(
        `INSERT INTO subjects (name, code)
         VALUES ($1, $2)
         RETURNING id, name, code`,
        [name, code]
      );

      res.status(201).json({ subject: result.rows[0] });
    } catch (error) {
      if (error.code === "23505") {
        return res.status(409).json({
          message: "This subject name or code already exists.",
        });
      }

      console.error("Create subject error:", error.message);
      res.status(500).json({ message: "Unable to create subject." });
    }
  }
);

module.exports = router;
