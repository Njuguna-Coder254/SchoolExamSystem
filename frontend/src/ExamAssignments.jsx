
import { useCallback, useEffect, useState } from "react";
import api from "./api";
import "./ExamAssignments.css";

export default function ExamAssignments() {
  const [exams, setExams] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [assignments, setAssignments] = useState([]);

  const [examId, setExamId] = useState("");
  const [teacherId, setTeacherId] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState(null);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [examResponse, userResponse, assignmentResponse] =
        await Promise.all([
          api.get("/exams"),
          api.get("/users"),
          api.get("/marking/assignments"),
        ]);

      setExams(examResponse.data.exams || []);
      setTeachers(
        (userResponse.data.users || []).filter(
          (user) =>
            user.role === "teacher" && user.is_active === true
        )
      );
      setAssignments(assignmentResponse.data.assignments || []);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Unable to load examination assignments. Check your administrator access and backend."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleAssign(event) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!examId || !teacherId) {
      setError("Please select both an examination and a teacher.");
      return;
    }

    setSaving(true);

    try {
      const response = await api.post("/marking/assignments", {
        examId: Number(examId),
        teacherId: Number(teacherId),
      });

      setMessage(
        response.data.message || "Teacher assignment saved successfully."
      );

      setExamId("");
      setTeacherId("");

      await loadData();
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Unable to assign the teacher. Please try again."
      );
    } finally {
      setSaving(false);
    }
  }

  async function removeAssignment(assignment) {
    const confirmed = window.confirm(
      `Remove ${assignment.teacher_name} from "${assignment.exam_title}"?`
    );

    if (!confirmed) return;

    setError("");
    setMessage("");
    setRemovingId(assignment.id);

    try {
      const response = await api.delete(
        `/marking/assignments/${assignment.id}`
      );

      setMessage(
        response.data.message || "Assignment removed successfully."
      );

      await loadData();
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Unable to remove this assignment."
      );
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="exam-assignments-page">
      <header className="assignment-header">
        <div>
          <span className="assignment-eyebrow">
            EXAMINATION ADMINISTRATION
          </span>
          <h1>Exam Teacher Assignments</h1>
          <p>
            Assign teachers to examinations so they can mark learner
            responses and manage examination results.
          </p>
        </div>

        <button
          type="button"
          className="assignment-refresh"
          onClick={loadData}
          disabled={loading}
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
      </header>

      {message && (
        <div className="assignment-alert success" role="status">
          {message}
        </div>
      )}

      {error && (
        <div className="assignment-alert error" role="alert">
          {error}
        </div>
      )}

      <section className="assignment-panel">
        <div className="assignment-panel-heading">
          <div>
            <h2>Assign Teacher</h2>
            <p>
              Select an examination and an active teacher.
            </p>
          </div>
        </div>

        <form className="assignment-form" onSubmit={handleAssign}>
          <label>
            Examination
            <select
              value={examId}
              onChange={(event) => setExamId(event.target.value)}
              required
            >
              <option value="">Select examination</option>

              {exams.map((exam) => (
                <option key={exam.id} value={exam.id}>
                  {exam.title}
                  {exam.class_name ? ` — ${exam.class_name}` : ""}
                </option>
              ))}
            </select>
          </label>

          <label>
            Teacher
            <select
              value={teacherId}
              onChange={(event) => setTeacherId(event.target.value)}
              required
            >
              <option value="">Select teacher</option>

              {teachers.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {teacher.full_name} ({teacher.username})
                </option>
              ))}
            </select>
          </label>

          <button
            type="submit"
            className="assignment-primary-button"
            disabled={saving || loading}
          >
            {saving ? "Assigning..." : "Assign Teacher"}
          </button>
        </form>

        {!loading && exams.length === 0 && (
          <p className="assignment-hint">
            No examinations were found. Create an examination first.
          </p>
        )}

        {!loading && teachers.length === 0 && (
          <p className="assignment-hint">
            No active teacher accounts were found. Create or activate a
            teacher account in User Management.
          </p>
        )}
      </section>

      <section className="assignment-panel">
        <div className="assignment-panel-heading">
          <div>
            <h2>Current Assignments</h2>
            <p>
              {assignments.length} teacher assignment(s) registered.
            </p>
          </div>
        </div>

        {loading ? (
          <p className="assignment-empty">Loading assignments...</p>
        ) : assignments.length === 0 ? (
          <p className="assignment-empty">
            No examination assignments have been created yet.
          </p>
        ) : (
          <div className="assignment-table-wrapper">
            <table className="assignment-table">
              <thead>
                <tr>
                  <th>Examination</th>
                  <th>Class</th>
                  <th>Subject</th>
                  <th>Assigned Teacher</th>
                  <th>Exam Status</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {assignments.map((assignment) => (
                  <tr key={assignment.id}>
                    <td data-label="Examination">
                      <strong>{assignment.exam_title}</strong>
                    </td>

                    <td data-label="Class">
                      {assignment.class_name || "—"}
                    </td>

                    <td data-label="Subject">
                      {assignment.subject_name || "—"}
                    </td>

                    <td data-label="Assigned Teacher">
                      <strong>{assignment.teacher_name}</strong>
                      <small>{assignment.teacher_username}</small>
                    </td>

                    <td data-label="Exam Status">
                      <span className="assignment-status">
                        {assignment.exam_status || "Unknown"}
                      </span>
                    </td>

                    <td data-label="Action">
                      <button
                        type="button"
                        className="assignment-remove-button"
                        onClick={() => removeAssignment(assignment)}
                        disabled={removingId === assignment.id}
                      >
                        {removingId === assignment.id
                          ? "Removing..."
                          : "Remove"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
