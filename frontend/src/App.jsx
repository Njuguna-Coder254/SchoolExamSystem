
import { useEffect, useState } from "react";
import api from "./api";
import "./App.css";
import ExamManagement from "./ExamManagement";
import LearnerManagement from "./LearnerManagement";
import UserManagement from "./UserManagement";
import LearnerExamPortal from "./LearnerExamPortal";
import TeacherDashboard from "./TeacherDashboard";
import ExamAssignments from "./ExamAssignments";
import ExamTimetable from "./ExamTimetable";

const menuItems = [
  { id: "overview", label: "Overview", icon: "▦" },
  { id: "exams", label: "Examinations", icon: "▤" },
  { id: "classes", label: "Classes", icon: "▥" },
  { id: "subjects", label: "Subjects", icon: "▧" },
  { id: "users", label: "User Management", icon: "♙" },
  { id: "results", label: "Results & Reports", icon: "▥" },
  { id: "learners", label: "Learner Management", icon: "♙" },
  { id: "assignments", label: "Exam Assignments", icon: "♧" },
  { id: "timetable", label: "Exam Timetable & Calendar", icon: "▦" },
];

function App() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [user, setUser] = useState(null);
  const [activePage, setActivePage] = useState("overview");
  const [authChecking, setAuthChecking] = useState(true);

  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [className, setClassName] = useState("");
  const [subjectName, setSubjectName] = useState("");
  const [subjectCode, setSubjectCode] = useState("");
  const [dataLoading, setDataLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dataError, setDataError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [summary, setSummary] = useState({
    examinations: null, classes: null, subjects: null,
    totalLearners: null, totalTeachers: null,
    upcomingExaminations: null, ongoingExaminations: null,
    completedExaminations: null, pendingMarking: null,
    markedScripts: null, submittedScripts: null,
    completionRate: 0,
  });

  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState("");

  async function handleLogin(event) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await api.post("/auth/login", {
        username: username.trim(),
        password,
      });

      const { token, user: loggedInUser } = response.data;

      if (!token || !loggedInUser) {
        throw new Error(
          "The server returned an incomplete login response."
        );
      }

      localStorage.setItem("token", token);
      api.defaults.headers.common.Authorization = `Bearer ${token}`;

      setUser(loggedInUser);
      setPassword("");
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.message ||
          "Unable to sign in. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    try {
      await api.post("/auth/logout");
    } catch {
      // Clear local login state even if the server cannot be reached.
    } finally {
      delete api.defaults.headers.common.Authorization;
      localStorage.removeItem("token");

      setUser(null);
      setUsername("");
      setPassword("");
      setActivePage("overview");
      setError("");
      setDataError("");
      setSuccessMessage("");
      setClasses([]);
      setSubjects([]);
      setSummary({
        examinations: null, classes: null, subjects: null,
        totalLearners: null, totalTeachers: null,
        upcomingExaminations: null, ongoingExaminations: null,
        completedExaminations: null, pendingMarking: null,
        markedScripts: null, submittedScripts: null,
        completionRate: 0,
      });
    }
  }

  async function loadDashboardSummary() {
    setSummaryLoading(true);
    setSummaryError("");

    try {
      const response = await api.get("/dashboard/summary");
      setSummary(response.data.summary);
    } catch (err) {
      setSummaryError(
        err.response?.data?.message ||
          "Unable to load dashboard statistics."
      );
    } finally {
      setSummaryLoading(false);
    }
  }

  useEffect(() => {
  if (user && String(user.role).toLowerCase() === "admin" && activePage === "overview") {
    loadDashboardSummary();
    const refreshId = window.setInterval(loadDashboardSummary, 60000);
    return () => window.clearInterval(refreshId);
  }
}, [user, activePage]);

  async function loadSchoolData() {
    setDataLoading(true);
    setDataError("");
    setSuccessMessage("");

    try {
      const [classResponse, subjectResponse] = await Promise.all([
        api.get("/school/classes"),
        api.get("/school/subjects"),
      ]);

      setClasses(classResponse.data.classes || []);
      setSubjects(subjectResponse.data.subjects || []);
    } catch (err) {
      setDataError(
        err.response?.data?.message ||
          "Unable to load classes and subjects. Please try again."
      );
    } finally {
      setDataLoading(false);
    }
  }
  useEffect(() => {
  async function restoreSession() {
    const token = localStorage.getItem("token");

    if (!token) {
      setAuthChecking(false);
      return;
    }

    try {
      api.defaults.headers.common.Authorization = `Bearer ${token}`;

      const response = await api.get("/auth/me");

      setUser(response.data.user);
    } catch (err) {
      localStorage.removeItem("token");
      delete api.defaults.headers.common.Authorization;
      setUser(null);
    } finally {
      setAuthChecking(false);
    }
  }

  restoreSession();
}, []);

  async function addClass(event) {
    event.preventDefault();
    setDataError("");
    setSuccessMessage("");
    setSaving(true);

    try {
      await api.post("/school/classes", {
        name: className.trim(),
      });

      setClassName("");
      setSuccessMessage("Class added successfully.");

      const response = await api.get("/school/classes");
      setClasses(response.data.classes || []);

      if (user && activePage === "overview") {
        loadDashboardSummary();
      }
    } catch (err) {
      setDataError(
        err.response?.data?.message || "Unable to add class."
      );
    } finally {
      setSaving(false);
    }
  }

  async function addSubject(event) {
    event.preventDefault();
    setDataError("");
    setSuccessMessage("");
    setSaving(true);

    try {
      await api.post("/school/subjects", {
        name: subjectName.trim(),
        code: subjectCode.trim().toUpperCase(),
      });

      setSubjectName("");
      setSubjectCode("");
      setSuccessMessage("Subject added successfully.");

      const response = await api.get("/school/subjects");
      setSubjects(response.data.subjects || []);
    } catch (err) {
      setDataError(
        err.response?.data?.message || "Unable to add subject."
      );
    } finally {
      setSaving(false);
    }
  }

  function openPage(pageId) {
    setActivePage(pageId);
    setDataError("");
    setSuccessMessage("");

    if (pageId === "classes" || pageId === "subjects") {
      loadSchoolData();
    }
  }

  if (authChecking) {
  return (
    <main className="login-shell">
      <section className="login-card">
        <h2>Restoring your session...</h2>
        <p>Please wait.</p>
      </section>
    </main>
  );
}

if (!user) {
  return (
      <main className="login-shell">
        <section className="login-card">
          <div className="brand-mark">SE</div>

          <p className="eyebrow">SCHOOL EXAMINATION SYSTEM</p>
          <h1>Welcome back</h1>

          <p className="muted">
            Sign in to access the examination management portal.
          </p>

          {error && (
            <div className="error-message" role="alert">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin}>
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Enter your username"
              maxLength={80}
              required
            />

            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your password"
              maxLength={200}
              required
            />

            <button
              className="primary-button"
              type="submit"
              disabled={loading}
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>

          <p className="security-note">
            🔒 Secure access for authorised users
          </p>
        </section>
      </main>
    );
  }
if (String(user.role).toLowerCase() === "learner") {
  return (
    <LearnerExamPortal
      user={user}
      onLogout={handleLogout}
    />
  );
}
if (String(user.role).toLowerCase() === "teacher") {
  return (
    <TeacherDashboard
      user={user}
      onLogout={handleLogout}
    />
  );
}

  return (
    <div className="dashboard-layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark small">SE</div>

          <div>
            <strong>School Exams</strong>
            <span>Management Portal</span>
          </div>
        </div>

        <p className="nav-heading">WORKSPACE</p>

        <nav
          className="side-navigation"
          aria-label="Main navigation"
        >
          {menuItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nav-item ${
                activePage === item.id ? "active" : ""
              }`}
              onClick={() => openPage(item.id)}
            >
              <span className="nav-icon" aria-hidden="true">
                {item.icon}
              </span>

              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="profile-avatar">
            {(user.fullName || user.username || "A")
              .charAt(0)
              .toUpperCase()}
          </div>

          <div className="profile-info">
            <strong>{user.fullName || user.username}</strong>
            <span>{user.role}</span>
          </div>

          <button
            type="button"
            className="logout-button"
            onClick={handleLogout}
          >
            Logout
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <p className="eyebrow">ADMINISTRATION</p>

            <h1>
              {menuItems.find((item) => item.id === activePage)?.label ||
                "School Examination System"}
            </h1>
          </div>

          <div className="system-status">
            <span className="status-dot" />
            System online
          </div>
        </header>

        {activePage === "overview" && (
          <>
            <section className="welcome-panel">
              <div>
                <p className="eyebrow">ADMINISTRATOR WORKSPACE</p>

                <h2>
                  Welcome, {user.fullName || user.username}
                </h2>

                <p>
                  Manage examinations, school records and assessment
                  activities from one place.
                </p>
              </div>

              <div className="welcome-symbol" aria-hidden="true">
                ✓
              </div>
            </section>

            {summaryError && (
              <div className="error-message" role="alert">
                {summaryError}

                <button
                  type="button"
                  className="inline-retry"
                  onClick={loadDashboardSummary}
                >
                  Retry
                </button>
              </div>
            )}

            <section className="admin-stat-grid">
              <article className="admin-stat-card"><span className="stat-icon learners">♙</span><div><p>Total learners</p><strong>{summaryLoading ? "…" : summary.totalLearners ?? "—"}</strong><small>Registered learners</small></div></article>
              <article className="admin-stat-card"><span className="stat-icon teachers">♧</span><div><p>Teachers</p><strong>{summaryLoading ? "…" : summary.totalTeachers ?? "—"}</strong><small>Active teaching staff</small></div></article>
              <article className="admin-stat-card"><span className="stat-icon exams">▤</span><div><p>Examinations</p><strong>{summaryLoading ? "…" : summary.examinations ?? "—"}</strong><small>All examination records</small></div></article>
              <article className="admin-stat-card"><span className="stat-icon marking">✎</span><div><p>Awaiting marking</p><strong>{summaryLoading ? "…" : summary.pendingMarking ?? "—"}</strong><small>Submitted scripts</small></div></article>
            </section>

            <section className="admin-overview-grid">
              <div className="content-panel">
                <div className="panel-heading"><h2>Examination activity</h2><p>Live schedule status from the examination database.</p></div>
                <div className="activity-list">
                  <div><span className="activity-dot upcoming"/><span>Upcoming examinations</span><strong>{summaryLoading ? "…" : summary.upcomingExaminations ?? "—"}</strong></div>
                  <div><span className="activity-dot ongoing"/><span>Ongoing examinations</span><strong>{summaryLoading ? "…" : summary.ongoingExaminations ?? "—"}</strong></div>
                  <div><span className="activity-dot completed"/><span>Completed examinations</span><strong>{summaryLoading ? "…" : summary.completedExaminations ?? "—"}</strong></div>
                  <div><span className="activity-dot draft"/><span>Draft examinations</span><strong>{summaryLoading ? "…" : summary.draftExaminations ?? "—"}</strong></div>
                </div>
              </div>
              <div className="content-panel progress-panel">
                <div className="panel-heading"><h2>Examination completion</h2><p>Completed examinations as a share of all examinations.</p></div>
                <div className="completion-number">{summaryLoading ? "…" : `${summary.completionRate ?? 0}%`}</div>
                <div className="progress-track"><span style={{ width: `${Math.min(100, summary.completionRate || 0)}%` }}/></div>
                <div className="progress-caption"><span>Completed: {summary.completedExaminations ?? 0}</span><span>Total: {summary.examinations ?? 0}</span></div>
                <div className="marking-summary"><div><strong>{summary.markedScripts ?? "—"}</strong><span>Marked scripts</span></div><div><strong>{summary.submittedScripts ?? "—"}</strong><span>Submitted scripts</span></div></div>
              </div>
            </section>

            <section className="content-panel">
              <div className="panel-heading">
                <h2>Quick actions</h2>
                <p>
                  Choose a section to manage school activities.
                </p>
              </div>

              <div className="quick-actions">
                <button
                  type="button"
                  onClick={() => openPage("exams")}
                >
                  <span>＋</span>
                  <strong>Manage examinations</strong>
                  <small>View and prepare exams</small>
                </button>

                <button
                  type="button"
                  onClick={() => openPage("classes")}
                >
                  <span>▥</span>
                  <strong>Manage classes</strong>
                  <small>Register and view classes</small>
                </button>

                <button
                  type="button"
                  onClick={() => openPage("subjects")}
                >
                  <span>▧</span>
                  <strong>Manage subjects</strong>
                  <small>Register and view subjects</small>
                </button>
              </div>
            </section>
          </>
        )}

        {activePage === "classes" && (
          <section className="content-panel">
            <div className="panel-heading">
              <h2>School Classes</h2>
              <p>Register and view classes in your school.</p>
            </div>

            {dataError && (
              <div className="error-message" role="alert">
                {dataError}
              </div>
            )}

            {successMessage && (
              <div className="success-message" role="status">
                {successMessage}
              </div>
            )}

            <form className="management-form" onSubmit={addClass}>
              <label htmlFor="className">Class name</label>

              <input
                id="className"
                value={className}
                onChange={(event) => setClassName(event.target.value)}
                placeholder="e.g. Grade 1"
                maxLength={80}
                required
              />

              <button
                className="primary-button"
                type="submit"
                disabled={saving}
              >
                {saving ? "Saving..." : "Add class"}
              </button>
            </form>

            <h3>Registered classes</h3>

            {dataLoading ? (
              <p>Loading classes...</p>
            ) : classes.length === 0 ? (
              <p>No classes found. Add your first class above.</p>
            ) : (
              <div className="records-list">
                {classes.map((item) => (
                  <div className="record-row" key={item.id}>
                    <span>{item.name}</span>
                    <span className="record-id">ID: {item.id}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {activePage === "subjects" && (
          <section className="content-panel">
            <div className="panel-heading">
              <h2>School Subjects</h2>
              <p>
                Register and view the subjects offered by your school.
              </p>
            </div>

            {dataError && (
              <div className="error-message" role="alert">
                {dataError}
              </div>
            )}

            {successMessage && (
              <div className="success-message" role="status">
                {successMessage}
              </div>
            )}

            <form className="management-form" onSubmit={addSubject}>
              <label htmlFor="subjectName">Subject name</label>

              <input
                id="subjectName"
                value={subjectName}
                onChange={(event) =>
                  setSubjectName(event.target.value)
                }
                placeholder="e.g. Mathematics"
                maxLength={120}
                required
              />

              <label htmlFor="subjectCode">Subject code</label>

              <input
                id="subjectCode"
                value={subjectCode}
                onChange={(event) =>
                  setSubjectCode(event.target.value)
                }
                placeholder="e.g. MATH"
                minLength={2}
                maxLength={30}
                pattern="[A-Za-z0-9_-]+"
                title="Use 2–30 letters, numbers, underscores or hyphens."
                required
              />

              <button
                className="primary-button"
                type="submit"
                disabled={saving}
              >
                {saving ? "Saving..." : "Add subject"}
              </button>
            </form>

            <h3>Registered subjects</h3>

            {dataLoading ? (
              <p>Loading subjects...</p>
            ) : subjects.length === 0 ? (
              <p>No subjects found. Add your first subject above.</p>
            ) : (
              <div className="records-list">
                {subjects.map((item) => (
                  <div className="record-row" key={item.id}>
                    <span>
                      <strong>{item.name}</strong>
                      <small>{item.code}</small>
                    </span>

                    <span className="record-id">ID: {item.id}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {activePage === "exams" && (
          <ExamManagement user={user} />
        )}

        {activePage === "learners" && (
          <LearnerManagement user={user} />
        )}
        {activePage === "users" && <UserManagement />}
        {activePage === "assignments" && (
          <ExamAssignments />
        )}
        {activePage === "timetable" && <ExamTimetable />}

        {/*{activePage === "users" && (
          <section className="content-panel section-placeholder">
            <div className="placeholder-symbol">♙</div>
            <h2>User Management</h2>
            <p>
              This section will be connected to the database in a later
              development step.
            </p>
            <button
              type="button"
              className="secondary-button"
              onClick={() => openPage("overview")}
            >
              Back to overview
            </button>
          </section>
        )}*/}

        {activePage === "results" && (
          <section className="content-panel section-placeholder">
            <div className="placeholder-symbol">▥</div>
            <h2>Results &amp; Reports</h2>
            <p>
              This section will be connected to the database in a later
              development step.
            </p>
            <button
              type="button"
              className="secondary-button"
              onClick={() => openPage("overview")}
            >
              Back to overview
            </button>
          </section>
        )}

        <footer className="dashboard-footer">
          School Examination System · Local school network
        </footer>
      </main>
    </div>
  );
}

export default App;
