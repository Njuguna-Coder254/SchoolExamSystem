
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const pool = require("./db");

const examRoutes = require("./routes/exams");
const schoolRoutes = require("./routes/school");
const authRoutes = require("./routes/auth");
const dashboardRoutes = require("./routes/dashboard");
const questionRoutes = require("./routes/questions");
const learnerRoutes = require("./routes/learners");
const userRoutes = require("./routes/users");
const learnerExamRoutes = require("./routes/learnerExams");
const markingRoutes = require("./routes/marking");
const app = express();

// Security and request middleware
app.use(helmet());
app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json({ limit: "1mb" }));


// API routes
app.use("/api/auth", authRoutes);
app.use("/api/exams", examRoutes);
app.use("/api/school", schoolRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/questions", questionRoutes);
app.use("/api/learners", learnerRoutes);
app.use("/api/users", userRoutes);
app.use("/api/learner-exams", learnerExamRoutes);
app.use("/api/marking", markingRoutes);

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    message: "School Examination System API is running",
  });
});

// Database health check
app.get("/api/health", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT current_database() AS database, NOW() AS server_time"
    );

    res.json({
      status: "healthy",
      database: result.rows[0].database,
      serverTime: result.rows[0].server_time,
    });
  } catch (error) {
    console.error("Database health check failed:", error.message);

    res.status(500).json({
      status: "error",
      message: "Database connection failed",
    });
  }
});

// Start the server
const PORT = Number(process.env.PORT) || 5000;

app.listen(PORT, "127.0.0.1", () => {
  console.log(
    `School Examination API running on http://127.0.0.1:${PORT}`
  );
});
