
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const pool = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many login attempts. Try again later."
  }
});

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function safeCompare(actual, expected) {
  const actualBuffer = Buffer.from(actual, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");

  return (
    actualBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

// Login
router.post("/login", loginLimiter, async (req, res) => {
  const username =
    typeof req.body?.username === "string"
      ? req.body.username.trim()
      : "";

  const password =
    typeof req.body?.password === "string"
      ? req.body.password
      : "";

  if (
    !username ||
    !password ||
    username.length > 80 ||
    password.length > 200
  ) {
    return res.status(400).json({
      message: "Enter a valid username and password."
    });
  }

  try {
    const result = await pool.query(
      `SELECT
         u.id,
         u.username,
         u.full_name,
         u.password_hash,
         u.role,
         l.assessment_number
       FROM users u
       LEFT JOIN learners l ON l.user_id = u.id
       WHERE u.username = $1
         AND u.is_active = TRUE`,
      [username]
    );

    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({
        message: "Invalid username or password."
      });
    }

    let validPassword = false;

    if (user.role === "learner") {
      // Learner password: daily prefix + final five assessment digits.
      const assessmentDigits = String(
        user.assessment_number || ""
      ).replace(/\D/g, "");

      if (assessmentDigits.length >= 5) {
        const codeResult = await pool.query(
          `SELECT access_letters
           FROM exam_daily_access_codes
           WHERE exam_date =
             (NOW() AT TIME ZONE 'Africa/Nairobi')::date`
        );

        if (codeResult.rows.length > 0) {
          const prefix = codeResult.rows[0].access_letters;

          if (typeof prefix === "string" && /^[A-Z]{2}$/.test(prefix)) {
            const expectedPassword =
              prefix + assessmentDigits.slice(-5);

            validPassword = safeCompare(password, expectedPassword);
          }
        }
      }
    } else {
      // Administrator and teacher accounts use their stored passwords.
      validPassword = await bcrypt.compare(
        password,
        user.password_hash || ""
      );
    }

    if (!validPassword) {
      return res.status(401).json({
        message: "Invalid username or password."
      });
    }

    const secret = process.env.JWT_SECRET;

    if (!secret || secret.length < 32) {
      console.error("JWT_SECRET is missing or too short.");

      return res.status(500).json({
        message: "Authentication is not configured."
      });
    }

    const expiresInSeconds = 8 * 60 * 60;

    const token = jwt.sign(
      {
        sub: user.id,
        role: user.role
      },
      secret,
      {
        algorithm: "HS256",
        expiresIn: expiresInSeconds
      }
    );

    const expiresAt = new Date(
      Date.now() + expiresInSeconds * 1000
    );

    await pool.query(
      `INSERT INTO user_sessions
         (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, hashToken(token), expiresAt]
    );

    return res.json({
      message: "Login successful.",
      token,
      expiresAt,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.full_name,
        role: user.role
      }
    });
  } catch (error) {
    console.error("Login error:", error.message);

    return res.status(500).json({
      message: "Unable to process login."
    });
  }
});

// Current logged-in user
router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// Logout and revoke this session
router.post("/logout", requireAuth, async (req, res) => {
  try {
    const authorization = req.headers.authorization || "";
    const [scheme, token] = authorization.split(" ");

    if (scheme !== "Bearer" || !token) {
      return res.status(401).json({
        message: "Authentication token is required."
      });
    }

    await pool.query(
      "DELETE FROM user_sessions WHERE token_hash = $1",
      [hashToken(token)]
    );

    return res.json({
      message: "Logged out successfully."
    });
  } catch (error) {
    console.error("Logout error:", error.message);

    return res.status(500).json({
      message: "Unable to log out."
    });
  }
});

module.exports = router;
