
import { useEffect, useState } from "react";
import api from "./api";

const initialForm = {
  title: "",
  classId: "",
  subjectId: "",
  startsAt: "",
  endsAt: "",
  durationMinutes: "60",
  instructions: "",
};

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString();
}

function toLocalDateTime(value) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const localDate = new Date(
    date.getTime() - date.getTimezoneOffset() * 60000
  );

  return localDate.toISOString().slice(0, 16);
}

function toForm(exam) {
  return {
    title: exam.title || "",
    classId: String(exam.class_id ?? ""),
    subjectId: String(exam.subject_id ?? ""),
    startsAt: toLocalDateTime(exam.starts_at),
    endsAt: toLocalDateTime(exam.ends_at),
    durationMinutes: String(exam.duration_minutes ?? 60),
    instructions: exam.instructions || "",
  };
}

export default function ExamManagement({ user }) {
  const [exams, setExams] = useState([]);
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [form, setForm] = useState(initialForm);

  const [showForm, setShowForm] = useState(false);
  const [editingExam, setEditingExam] = useState(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishingId, setPublishingId] = useState(null);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [questionDrafts, setQuestionDrafts] = useState([]);
  const [questionForm, setQuestionForm] = useState({ questionText: "", questionType: "multiple_choice", marks: "1", options: ["", ""], correctOptionIndex: 0 });

  const role = String(user?.role || "").toLowerCase();
  const canCreate = role === "admin" || role === "teacher";
  const canEdit = role === "admin";

  async function loadData() {
    setLoading(true);
    setError("");

    try {
      const [examResponse, classResponse, subjectResponse] =
        await Promise.all([
          api.get("/exams"),
          api.get("/school/classes"),
          api.get("/school/subjects"),
        ]);

      setExams(examResponse.data.exams || []);
      setClasses(classResponse.data.classes || []);
      setSubjects(subjectResponse.data.subjects || []);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Unable to load examination information."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  function updateField(event) {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function openCreateForm() {
    setEditingExam(null);
    setForm(initialForm);
    setQuestionDrafts([]);
    setQuestionForm({ questionText: "", questionType: "multiple_choice", marks: "1", options: ["", ""], correctOptionIndex: 0 });
    setShowForm(true);
    setError("");
    setMessage("");
  }

  function openEditForm(exam) {
    setEditingExam(exam);
    setForm(toForm(exam));
    setShowForm(true);
    setError("");
    setMessage("");
  }

  function closeForm() {
    setShowForm(false);
    setEditingExam(null);
    setForm(initialForm);
  }

  function addQuestionDraft() {
    const q = questionForm;
    if (!q.questionText.trim() || Number(q.marks) <= 0) {
      setError("Enter question text and a positive mark value.");
      return;
    }
    const objective = ["multiple_choice", "true_false"].includes(q.questionType);
    if (objective && (q.options.some(option => !option.trim()) || q.options.length < 2 || q.correctOptionIndex < 0)) {
      setError("Complete all answer options and select the correct answer.");
      return;
    }
    setQuestionDrafts(current => [...current, {
      questionText: q.questionText,
      questionType: q.questionType,
      marks: Number(q.marks),
      options: objective ? q.options : [],
      correctOptionIndex: objective ? Number(q.correctOptionIndex) : null
    }]);
    setQuestionForm({ questionText: "", questionType: "multiple_choice", marks: "1", options: ["", ""], correctOptionIndex: 0 });
    setError("");
  }

  async function submitForApproval(exam) {
    try {
      await api.post(`/exams/${exam.id}/submit-for-approval`);
      setMessage("Examination submitted to Center Admin for approval.");
      await loadData();
    } catch (err) {
      setError(err.response?.data?.message || "Unable to submit examination.");
    }
  }

  async function reviewExam(exam, decision) {
    const notes = decision === "return" ? window.prompt("Explain what the teacher should revise:", "") : "";
    if (decision === "return" && notes === null) return;
    try {
      await api.post(`/exams/${exam.id}/review`, { decision, notes });
      setMessage(decision === "approve" ? "Examination approved. You can now publish it." : "Examination returned to the teacher.");
      await loadData();
    } catch (err) {
      setError(err.response?.data?.message || "Unable to review examination.");
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!form.title.trim()) {
      setError("Enter an examination title.");
      return;
    }

    if (
      !form.startsAt ||
      !form.endsAt ||
      new Date(form.endsAt) <= new Date(form.startsAt)
    ) {
      setError("The end date and time must be later than the start.");
      return;
    }

    const duration = Number(form.durationMinutes);

    if (
      !Number.isInteger(duration) ||
      duration < 1 ||
      duration > 1440
    ) {
      setError("Duration must be between 1 and 1440 minutes.");
      return;
    }

    setSaving(true);

    const payload = {
      title: form.title.trim(),
      classId: Number(form.classId),
      subjectId: Number(form.subjectId),
      startsAt: new Date(form.startsAt).toISOString(),
      endsAt: new Date(form.endsAt).toISOString(),
      durationMinutes: duration,
      instructions: form.instructions,
    };

    try {
      let response;

      if (editingExam) {
        response = await api.patch(
          `/exams/${editingExam.id}`,
          payload
        );

        setMessage(
          response.data.message ||
            "Examination updated successfully."
        );
      } else {
        response = await api.post("/exams", payload);
        const examId = response.data.exam.id;
        for (const question of questionDrafts) {
          await api.post("/questions", { examId, ...question });
        }
        if (role === "teacher") {
          setMessage("Examination and questions saved. Submit it for Center Admin approval when ready.");
        } else {
          setMessage("Examination and questions saved successfully as a draft.");
        }
      }

      closeForm();
      await loadData();
    } catch (err) {
      setError(
        err.response?.data?.message ||
          (editingExam
            ? "Unable to update the examination."
            : "Unable to create the examination.")
      );
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish(exam) {
    const confirmed = window.confirm(
      `Publish "${exam.title}"?\n\n` +
        "Check that all questions, marks, and answer options are correct. " +
        "Only publish when the examination is ready."
    );

    if (!confirmed) return;

    setError("");
    setMessage("");
    setPublishingId(exam.id);

    try {
      const response = await api.post(
        `/exams/${exam.id}/publish`
      );

      setMessage(
        `${response.data.message} ` +
          `${response.data.questionCount} question(s), ` +
          `${response.data.totalMarks} total marks.`
      );

      await loadData();
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Unable to publish the examination."
      );
    } finally {
      setPublishingId(null);
    }
  }

  return (
    <section className="content-panel exam-management">
      <div className="exam-toolbar">
        <div>
          <h2>Examinations</h2>
          <p>
            Create examinations with their questions, review submissions, schedule and publish approved papers.
          </p>
        </div>

        {canCreate && (
          <button
            className="primary-button"
            type="button"
            onClick={openCreateForm}
          >
            + Create examination
          </button>
        )}
      </div>

      {error && (
        <div className="error-message" role="alert">
          {error}
        </div>
      )}

      {message && (
        <div className="success-message" role="status">
          {message}
        </div>
      )}

      {showForm && canCreate && (
        <form className="exam-create-form" onSubmit={handleSubmit}>
          <div className="exam-list-toolbar">
            <h3>
              {editingExam
                ? `Edit examination: ${editingExam.title}`
                : "Create examination"}
            </h3>

            <button
              className="text-button"
              type="button"
              onClick={closeForm}
              disabled={saving}
            >
              Cancel
            </button>
          </div>

          <div className="exam-form-grid">
            <div className="exam-field full">
              <label htmlFor="exam-title">
                Examination title
              </label>
              <input
                id="exam-title"
                name="title"
                value={form.title}
                onChange={updateField}
                maxLength={200}
                required
              />
            </div>

            <div className="exam-field">
              <label htmlFor="exam-class">Class</label>
              <select
                id="exam-class"
                name="classId"
                value={form.classId}
                onChange={updateField}
                required
              >
                <option value="">Select a class</option>
                {classes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="exam-field">
              <label htmlFor="exam-subject">Subject</label>
              <select
                id="exam-subject"
                name="subjectId"
                value={form.subjectId}
                onChange={updateField}
                required
              >
                <option value="">Select a subject</option>
                {subjects.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.code})
                  </option>
                ))}
              </select>
            </div>

            <div className="exam-field">
              <label htmlFor="exam-start">
                Start date and time
              </label>
              <input
                id="exam-start"
                type="datetime-local"
                name="startsAt"
                value={form.startsAt}
                onChange={updateField}
                required
              />
            </div>

            <div className="exam-field">
              <label htmlFor="exam-end">
                Scheduled end date and time
              </label>
              <input
                id="exam-end"
                type="datetime-local"
                name="endsAt"
                value={form.endsAt}
                onChange={updateField}
                required
              />
            </div>

            <div className="exam-field">
              <label htmlFor="exam-duration">
                Duration (minutes)
              </label>
              <input
                id="exam-duration"
                type="number"
                name="durationMinutes"
                min="1"
                max="1440"
                step="1"
                value={form.durationMinutes}
                onChange={updateField}
                required
              />
            </div>

            <div className="exam-field full">
              <label htmlFor="exam-instructions">
                Instructions
              </label>
              <textarea
                id="exam-instructions"
                name="instructions"
                rows="4"
                maxLength={10000}
                value={form.instructions}
                onChange={updateField}
                placeholder="Enter instructions for learners..."
              />
            </div>
          </div>

          {!editingExam && (
            <section className="question-builder">
              <h3>Questions for this examination</h3>
              <p className="exam-help">Add questions here while creating the examination. Typed answers use a rich-text formatting area.</p>
              <div className="exam-field full">
                <label>Question text</label>
                <div className="rich-toolbar">
                  {["bold", "italic", "underline"].map(command => <button type="button" key={command} onClick={() => document.execCommand(command)}>{command === "bold" ? "B" : command === "italic" ? "I" : "U"}</button>)}
                  <button type="button" onClick={() => document.execCommand("insertUnorderedList")}>• List</button>
                  <button type="button" onClick={() => document.execCommand("insertOrderedList")}>1. List</button>
                </div>
                <div className="rich-question-editor" contentEditable suppressContentEditableWarning onInput={e => setQuestionForm(q => ({...q, questionText:e.currentTarget.innerHTML}))} data-placeholder="Type your question here..."></div>
              </div>
              <div className="exam-form-grid">
                <div className="exam-field"><label>Question type</label><select value={questionForm.questionType} onChange={e => setQuestionForm(q => ({...q,questionType:e.target.value,options:e.target.value === "true_false" ? ["True","False"] : ["",""]}))}><option value="multiple_choice">Multiple choice</option><option value="true_false">True / False</option><option value="short_answer">Short answer</option><option value="essay">Essay / typed response</option></select></div>
                <div className="exam-field"><label>Marks</label><input type="number" min="0.5" step="0.5" value={questionForm.marks} onChange={e => setQuestionForm(q => ({...q,marks:e.target.value}))}/></div>
              </div>
              {["multiple_choice","true_false"].includes(questionForm.questionType) && <div className="exam-field full"><label>Answer options and correct answer</label>{questionForm.options.map((option,index) => <div className="option-editor-row" key={index}><input value={option} disabled={questionForm.questionType==="true_false"} placeholder={`Option ${index+1}`} onChange={e => setQuestionForm(q => ({...q,options:q.options.map((v,i)=>i===index?e.target.value:v)}))}/><label><input type="radio" name="correctOption" checked={Number(questionForm.correctOptionIndex)===index} onChange={()=>setQuestionForm(q=>({...q,correctOptionIndex:index}))}/> Correct</label></div>)}{questionForm.questionType==="multiple_choice" && <button type="button" className="text-button" onClick={()=>setQuestionForm(q=>({...q,options:[...q.options,""]}))}>+ Add option</button>}</div>}
              <button type="button" className="secondary-button" onClick={addQuestionDraft}>Add question to examination</button>
              {questionDrafts.length > 0 && <div className="question-draft-list"><strong>{questionDrafts.length} question(s) prepared</strong>{questionDrafts.map((q,i)=><div key={i}>Question {i+1} · {q.questionType.replace("_"," ")} · {q.marks} mark(s)</div>)}</div>}
            </section>
          )}

          {editingExam && (
            <p className="exam-help">
              Changes will be sent to the server. For an ongoing
              examination, verify that the backend applies any time
              extension to active attempts and does not reopen submitted
              attempts.
            </p>
          )}

          {!editingExam && (
            <p className="exam-help">
              This examination will be saved as a draft. It will not
              be published to learners.
            </p>
          )}

          <button
            className="primary-button"
            type="submit"
            disabled={saving}
          >
            {saving
              ? "Saving..."
              : editingExam
                ? "Save examination changes"
                : "Save as draft"}
          </button>
        </form>
      )}

      <div className="exam-list-toolbar">
        <h3>Existing examinations</h3>

        <button
          type="button"
          className="text-button"
          onClick={loadData}
          disabled={loading}
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {loading ? (
        <p>Loading examinations...</p>
      ) : exams.length === 0 ? (
        <p>No examinations found yet.</p>
      ) : (
        <div className="exam-table-container">
          <table className="exam-table">
            <thead>
              <tr>
                <th>Examination</th>
                <th>Class</th>
                <th>Subject</th>
                <th>Start</th>
                <th>End</th>
                <th>Duration</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {exams.map((exam) => (
                <tr key={exam.id}>
                  <td>
                    <strong>{exam.title}</strong>
                    <small>ID: {exam.id}</small>
                  </td>

                  <td>{exam.class_name}</td>

                  <td>
                    {exam.subject}
                    <small>{exam.subject_code}</small>
                  </td>

                  <td>{formatDate(exam.starts_at)}</td>

                  <td>{formatDate(exam.ends_at)}</td>

                  <td>{exam.duration_minutes} minutes</td>

                  <td>
                    <span
                      className={`exam-status status-${exam.status}`}
                    >
                      {exam.status}
                    </span>
                  </td>

                  <td>
                    <div className="exam-actions">
                      {canEdit && exam.status !== "cancelled" && (
                        <button
                          type="button"
                          className="primary-button"
                          onClick={() => openEditForm(exam)}
                        >
                          Edit 
                        </button>
                      )}

                      {role === "teacher" && exam.status === "draft" && exam.created_by === user.id && <button type="button" className="secondary-button" onClick={() => submitForApproval(exam)}>Submit for approval</button>}
                      {role === "admin" && exam.status === "pending_approval" && <><button type="button" className="primary-button" onClick={() => reviewExam(exam,"approve")}>Approve</button><button type="button" className="secondary-button" onClick={() => reviewExam(exam,"return")}>Return</button></>}
                      {exam.status === "draft" && role === "admin" && canCreate && (
                        <button
                          type="button"
                          className="primary-button"
                          disabled={publishingId !== null}
                          onClick={() => handlePublish(exam)}
                        >
                          {publishingId === exam.id
                            ? "Publishing..."
                            : "Publish"}
                        </button>
                      )}

                      {exam.status === "published" && (
                        <span>Published</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
