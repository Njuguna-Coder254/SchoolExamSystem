
import { useState } from "react";
import ExamManagement from "./ExamManagement";
import QuestionManagement from "./QuestionManagement";
import "./TeacherDashboard.css";
import TeacherMarking from "./TeacherMarking";

const teacherMenu = [
  { id: "overview", label: "Dashboard", icon: "▦" },
  { id: "exams", label: "My Examinations", icon: "▤" },
  { id: "questions", label: "Question Management", icon: "▧" },
  { id: "results", label: "Marking & Results", icon: "✓" },
  { id: "profile", label: "My Profile", icon: "♙" },
];

function TeacherDashboard({ user, onLogout }) {
  const [activePage, setActivePage] = useState("overview");

  const displayName = user?.fullName || user?.username || "Teacher";

  function openPage(page) {
    setActivePage(page);
  }

  return (
    <div className="teacher-layout">
      <aside className="teacher-sidebar">
        <div className="teacher-brand">
          <div className="teacher-brand-mark">SE</div>
          <div>
            <strong>School Exams</strong>
            <span>Teacher Portal</span>
          </div>
        </div>

        <div className="teacher-section-label">TEACHER WORKSPACE</div>

        <nav className="teacher-navigation" aria-label="Teacher navigation">
          {teacherMenu.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`teacher-nav-item ${
                activePage === item.id ? "active" : ""
              }`}
              onClick={() => openPage(item.id)}
            >
              <span className="teacher-nav-icon" aria-hidden="true">
                {item.icon}
              </span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="teacher-sidebar-bottom">
          <div className="teacher-avatar">
            {displayName.charAt(0).toUpperCase()}
          </div>

          <div className="teacher-user-info">
            <strong>{displayName}</strong>
            <span>Teacher account</span>
          </div>

          <button
            type="button"
            className="teacher-logout"
            onClick={onLogout}
            title="Sign out"
          >
            ↪
          </button>
        </div>
      </aside>

      <main className="teacher-main">
        <header className="teacher-topbar">
          <div>
            <p className="teacher-eyebrow">TEACHER PORTAL</p>
            <h1>
              {teacherMenu.find((item) => item.id === activePage)?.label}
            </h1>
          </div>

          <div className="teacher-status">
            <span />
            Account active
          </div>
        </header>

        {activePage === "overview" && (
          <div className="teacher-page-content">
            <section className="teacher-welcome">
              <div>
                <span className="teacher-welcome-tag">
                  YOUR TEACHING WORKSPACE
                </span>
                <h2>Welcome back, {displayName}</h2>
                <p>
                  Prepare examinations, manage questions, and support
                  assessment activities from your dashboard.
                </p>

                <button
                  type="button"
                  className="teacher-primary-button"
                  onClick={() => openPage("exams")}
                >
                  Open my examinations <span>→</span>
                </button>
              </div>

              <div className="teacher-welcome-icon" aria-hidden="true">
                <span>✎</span>
              </div>
            </section>

            <div className="teacher-section-heading">
              <div>
                <h2>Your workspace</h2>
                <p>Choose an activity to continue.</p>
              </div>
            </div>

            <section className="teacher-action-grid">
              <button
                type="button"
                className="teacher-action-card"
                onClick={() => openPage("exams")}
              >
                <span className="teacher-action-icon blue">▤</span>
                <strong>My Examinations</strong>
                <p>Prepare and manage examinations.</p>
                <span className="teacher-card-link">Open section →</span>
              </button>

              <button
                type="button"
                className="teacher-action-card"
                onClick={() => openPage("questions")}
              >
                <span className="teacher-action-icon purple">▧</span>
                <strong>Question Management</strong>
                <p>Create and organise examination questions.</p>
                <span className="teacher-card-link">Open section →</span>
              </button>

              <button
                type="button"
                className="teacher-action-card"
                onClick={() => openPage("results")}
              >
                <span className="teacher-action-icon orange">✓</span>
                <strong>Marking & Results</strong>
                <p>Access marking and results tools as they become available.</p>
                <span className="teacher-card-link">Open section →</span>
              </button>

              <button
                type="button"
                className="teacher-action-card"
                onClick={() => openPage("profile")}
              >
                <span className="teacher-action-icon green">♙</span>
                <strong>My Profile</strong>
                <p>View your account details.</p>
                <span className="teacher-card-link">View profile →</span>
              </button>
            </section>

            <section className="teacher-notice">
              <div className="teacher-notice-icon">i</div>
              <div>
                <strong>Examination access</strong>
                <p>
                  The examinations available to you depend on your account
                  permissions and the access rules configured by the school.
                </p>
              </div>
            </section>
          </div>
        )}

        {activePage === "exams" && (
          <section className="teacher-module">
            <ExamManagement user={user} />
          </section>
        )}

        {activePage === "questions" && (
          <section className="teacher-module">
            <QuestionManagement user={user} />
          </section>
        )}

        {activePage === "results" && (
  <section className="teacher-module">
    <TeacherMarking />
  </section>
)}

        {activePage === "profile" && (
          <section className="teacher-module">
            <div className="teacher-panel">
              <div className="teacher-profile-heading">
                <div className="teacher-profile-avatar">
                  {displayName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h2>{displayName}</h2>
                  <p>Teacher account</p>
                </div>
              </div>

              <div className="teacher-profile-details">
                <div>
                  <span>Full name</span>
                  <strong>{user?.fullName || "Not provided"}</strong>
                </div>
                <div>
                  <span>Username</span>
                  <strong>{user?.username || "Not provided"}</strong>
                </div>
                <div>
                  <span>Account role</span>
                  <strong>{user?.role || "Teacher"}</strong>
                </div>
              </div>

              <button
                type="button"
                className="teacher-secondary-button"
                onClick={onLogout}
              >
                Sign out
              </button>
            </div>
          </section>
        )}

        <footer className="teacher-footer">
          School Examination System <span>•</span> Teacher Portal
        </footer>
      </main>
    </div>
  );
}

export default TeacherDashboard;
