
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const pool = require("../db");

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function requireAuth(req, res, next) {
  const secret = process.env.JWT_SECRET;

  if (!secret || secret.length < 32) {
    return res.status(500).json({
      message: "Authentication is not configured."
    });
  }

  const authorization = req.headers.authorization || "";
  const [scheme, token] = authorization.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({
      message: "Please log in to continue."
    });
  }

  try {
    const payload = jwt.verify(token, secret, {
      algorithms: ["HS256"]
    });

    const result = await pool.query(
      `SELECT u.id, u.username, u.full_name, u.role
       FROM user_sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1
         AND s.expires_at > NOW()
         AND u.is_active = TRUE`,
      [hashToken(token)]
    );

    if (
      result.rows.length === 0 ||
      result.rows[0].id !== payload.sub
    ) {
      return res.status(401).json({
        message: "Your session is invalid or expired."
      });
    }

    req.user = result.rows[0];
    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError" ||
        error.name === "TokenExpiredError") {
      return res.status(401).json({
        message: "Invalid or expired login token."
      });
    }

    console.error("Authentication error:", error.message);
    return res.status(500).json({
      message: "Unable to verify your session."
    });
  }
}

function allowRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        message: "You do not have permission to perform this action."
      });
    }

    next();
  };
}

module.exports = { requireAuth, allowRoles };
