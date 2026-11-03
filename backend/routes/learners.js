
const express = require("express");
const bcrypt = require("bcryptjs");
const pool = require("../db");
const { requireAuth, allowRoles } = require("../middleware/auth");

const router = express.Router();

// List learners and their assigned classes.
// Only administrators and teachers can access this list.
router.get(
  "/",
  requireAuth,
  allowRoles("admin", "teacher"),
  async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT
          l.id,
          l.admission_number,
          l.assessment_number,
          l.class_id,
          c.name AS class_name,
          u.id AS user_id,
          u.full_name,
          u.username,
          u.is_active,
          l.created_at
        FROM learners l
        JOIN users u ON u.id = l.user_id
        JOIN classes c ON c.id = l.class_id
        ORDER BY u.full_name ASC
      `);

      res.json({ learners: result.rows });
    } catch (error) {
      console.error("List learners error:", error.message);
      res.status(500).json({
        message: "Unable to retrieve learners."
      });
    }
  }
);

// Register a learner without asking the administrator for a password.
// Initial password = today's prefix + last five digits of assessment number.
router.post(
  "/",
  requireAuth,
  allowRoles("admin"),
  async (req, res) => {
    const fullName =
      typeof req.body.fullName === "string"
        ? req.body.fullName.trim()
        : "";

    const assessmentNumber =
      typeof req.body.assessmentNumber === "string"
        ? req.body.assessmentNumber.trim()
        : "";

    const admissionNumber =
      typeof req.body.admissionNumber === "string"
        ? req.body.admissionNumber.trim()
        : "";

    const classId = Number(req.body.classId);

    if (
      !fullName ||
      fullName.length > 150 ||
      !assessmentNumber ||
      assessmentNumber.length > 50 ||
      !admissionNumber ||
      admissionNumber.length > 50 ||
      !Number.isSafeInteger(classId) ||
      classId <= 0
    ) {
      return res.status(400).json({
        message:
          "Provide a valid full name, assessment number, admission number and class."
      });
    }

    // Extract digits only, then use the final five digits.
    const assessmentDigits = assessmentNumber.replace(/\D/g, "");

    if (assessmentDigits.length < 5) {
      return res.status(400).json({
        message:
          "The assessment number must contain at least five digits."
      });
    }

    const username = assessmentNumber;
    const passwordSuffix = assessmentDigits.slice(-5);

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Check that the class exists.
      const classResult = await client.query(
        "SELECT id FROM classes WHERE id = $1",
        [classId]
      );

      if (classResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: "The selected class does not exist."
        });
      }

      // Assessment numbers must be unique.
      const assessmentExists = await client.query(
        `SELECT id
         FROM learners
         WHERE assessment_number = $1`,
        [assessmentNumber]
      );

      if (assessmentExists.rows.length > 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          message: "That assessment number is already registered."
        });
      }

      // Admission numbers must also be unique.
      const admissionExists = await client.query(
        `SELECT id
         FROM learners
         WHERE admission_number = $1`,
        [admissionNumber]
      );

      if (admissionExists.rows.length > 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          message: "That admission number is already registered."
        });
      }

      // The prefix is based on the current date in Nairobi.
      const codeResult = await client.query(
        `SELECT access_letters
         FROM exam_daily_access_codes
         WHERE exam_date = (NOW() AT TIME ZONE 'Africa/Nairobi')::date
         FOR SHARE`
      );

      if (codeResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message:
            "Today's examination prefix has not been configured. Ask an administrator to set it first."
        });
      }

      const prefix = codeResult.rows[0].access_letters;

      // Validate the stored prefix before using it.
      if (!/^[A-Z]{2}$/.test(prefix)) {
        await client.query("ROLLBACK");
        return res.status(500).json({
          message: "Today's examination prefix is invalid."
        });
      }

      const initialPassword = `${prefix}${passwordSuffix}`;
      const passwordHash = await bcrypt.hash(initialPassword, 12);

      // Create the learner login. The assessment number is the username.
      const userResult = await client.query(
        `INSERT INTO users
          (full_name, username, password_hash, role, is_active)
         VALUES ($1, $2, $3, 'learner', TRUE)
         RETURNING id, full_name, username, role`,
        [fullName, username, passwordHash]
      );

      const user = userResult.rows[0];

      const learnerResult = await client.query(
        `INSERT INTO learners
          (admission_number, assessment_number, user_id, class_id)
         VALUES ($1, $2, $3, $4)
         RETURNING
           id,
           admission_number,
           assessment_number,
           user_id,
           class_id,
           created_at`,
        [admissionNumber, assessmentNumber, user.id, classId]
      );

      await client.query("COMMIT");

      // Never return the generated password in this API response.
      res.status(201).json({
        message: "Learner registered successfully.",
        learner: {
          ...learnerResult.rows[0],
          full_name: user.full_name,
          username: user.username,
          role: user.role
        }
      });
    } catch (error) {
      await client.query("ROLLBACK");

      if (error.code === "23505") {
        return res.status(409).json({
          message:
            "That username, assessment number or admission number is already registered."
        });
      }

      console.error("Register learner error:", error.message);
      res.status(500).json({
        message: "Unable to register learner."
      });
    } finally {
      client.release();
    }
  }
);

/* UPDATE /api/learners/:id
   Administrators can update learner details. */
router.put(
  "/:id",
  requireAuth,
  allowRoles("admin"),
  async (req, res) => {
    const learnerId = Number(req.params.id);

    const fullName =
      typeof req.body.fullName === "string"
        ? req.body.fullName.trim()
        : "";

    const assessmentNumber =
      typeof req.body.assessmentNumber === "string"
        ? req.body.assessmentNumber.trim()
        : "";

    const admissionNumber =
      typeof req.body.admissionNumber === "string"
        ? req.body.admissionNumber.trim()
        : "";

    const classId = Number(req.body.classId);

    if (
      !Number.isSafeInteger(learnerId) ||
      learnerId <= 0 ||
      !fullName ||
      fullName.length > 150 ||
      !assessmentNumber ||
      assessmentNumber.length > 50 ||
      !admissionNumber ||
      admissionNumber.length > 50 ||
      !Number.isSafeInteger(classId) ||
      classId <= 0
    ) {
      return res.status(400).json({
        message:
          "Provide a valid learner ID, full name, assessment number, admission number and class."
      });
    }

    const digits = assessmentNumber.replace(/\D/g, "");

    if (digits.length < 5) {
      return res.status(400).json({
        message:
          "The assessment number must contain at least five digits."
      });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const existing = await client.query(
        `SELECT l.id, l.user_id
         FROM learners l
         WHERE l.id = $1
         FOR UPDATE`,
        [learnerId]
      );

      if (existing.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          message: "Learner not found."
        });
      }

      const { user_id: userId } = existing.rows[0];

      const classExists = await client.query(
        "SELECT id FROM classes WHERE id = $1",
        [classId]
      );

      if (classExists.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: "The selected class does not exist."
        });
      }

      const duplicate = await client.query(
        `SELECT id
         FROM learners
         WHERE (assessment_number = $1 OR admission_number = $2)
           AND id <> $3`,
        [assessmentNumber, admissionNumber, learnerId]
      );

      if (duplicate.rows.length > 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          message:
            "That assessment number or admission number belongs to another learner."
        });
      }

      // Update the login username to match the assessment number.
      const userUpdate = await client.query(
        `UPDATE users
         SET full_name = $1,
             username = $2
         WHERE id = $3
         RETURNING id, full_name, username, role`,
        [fullName, assessmentNumber, userId]
      );

      await client.query(
        `UPDATE learners
         SET assessment_number = $1,
             admission_number = $2,
             class_id = $3
         WHERE id = $4`,
        [assessmentNumber, admissionNumber, classId, learnerId]
      );

      await client.query("COMMIT");

      res.json({
        message: "Learner details updated successfully.",
        learner: {
          id: learnerId,
          full_name: userUpdate.rows[0].full_name,
          username: userUpdate.rows[0].username,
          assessment_number: assessmentNumber,
          admission_number: admissionNumber,
          class_id: classId
        }
      });
    } catch (error) {
      await client.query("ROLLBACK");

      if (error.code === "23505") {
        return res.status(409).json({
          message:
            "That username, assessment number or admission number is already registered."
        });
      }

      console.error("Update learner error:", error.message);
      res.status(500).json({
        message: "Unable to update learner details."
      });
    } finally {
      client.release();
    }
  }
);

module.exports = router;
