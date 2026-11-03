
import { useCallback, useEffect, useState } from "react";
import api from "./api";
import "./QuestionManagement.css";

const emptyForm = {
  examId: "",
  questionText: "",
  questionType: "multiple_choice",
  marks: "1",
  options: ["", "", "", ""],
  correctOptionIndex: 0,
};

const questionTypes = [
  { value: "multiple_choice", label: "Multiple choice" },
  { value: "true_false", label: "True / False" },
  { value: "short_answer", label: "Short answer" },
  { value: "essay", label: "Essay" },
];

function QuestionManagement() {
  const [exams, setExams] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [questions, setQuestions] = useState([]);
  const [loadingExams, setLoadingExams] = useState(true);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const selectedExam = exams.find(
    (exam) => String(exam.id) === String(form.examId)
  );

  const loadExams = useCallback(async () => {
    setLoadingExams(true);
    setError("");

    try {
      const response = await api.get("/exams");
      const allExams = response.data.exams || [];
      const drafts = allExams.filter((exam) => exam.status === "draft");

      setExams(drafts);

      setForm((current) => {
        const stillExists = drafts.some(
          (exam) => String(exam.id) === String(current.examId)
        );

        return {
          ...current,
          examId: stillExists
            ? current.examId
            : drafts.length > 0
              ? String(drafts[0].id)
              : "",
        };
      });
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Unable to load examinations. Check your backend and login session."
      );
    } finally {
      setLoadingExams(false);
    }
  }, []);

  const loadQuestions = useCallback(async (examId) => {
    if (!examId) {
      setQuestions([]);
      return;
    }

    setLoadingQuestions(true);
    setError("");

    try {
      const response = await api.get(`/questions/exam/${examId}`);
      setQuestions(response.data.questions || []);
    } catch (err) {
      setQuestions([]);
      setError(
        err.response?.data?.message ||
          "Unable to load questions for this examination."
      );
    } finally {
      setLoadingQuestions(false);
    }
  }, []);

  useEffect(() => {
    loadExams();
  }, [loadExams]);

  useEffect(() => {
    loadQuestions(form.examId);
  }, [form.examId, loadQuestions]);

  function updateField(event) {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value,
    }));

    setError("");
    setSuccess("");
  }

  function updateOption(index, value) {
    setForm((current) => ({
      ...current,
      options: current.options.map((option, optionIndex) =>
        optionIndex === index ? value : option
      ),
    }));

    setError("");
    setSuccess("");
  }

  function changeQuestionType(event) {
    const questionType = event.target.value;

    setForm((current) => ({
      ...current,
      questionType,
      options:
        questionType === "true_false"
          ? ["True", "False"]
          : questionType === "multiple_choice"
            ? ["", "", "", ""]
            : [],
      correctOptionIndex: 0,
    }));

    setError("");
    setSuccess("");
  }

  function addOption() {
    if (form.options.length >= 6) return;

    setForm((current) => ({
      ...current,
      options: [...current.options, ""],
    }));
  }

  function removeOption(index) {
    if (form.options.length <= 2) return;

    setForm((current) => {
      const options = current.options.filter(
        (_, optionIndex) => optionIndex !== index
      );

      let correctOptionIndex = current.correctOptionIndex;

      if (index === correctOptionIndex) {
        correctOptionIndex = 0;
      } else if (index < correctOptionIndex) {
        correctOptionIndex -= 1;
      }

      return { ...current, options, correctOptionIndex };
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!form.examId) {
      setError("Select a draft examination first.");
      return;
    }

    const marks = Number(form.marks);

    if (!Number.isFinite(marks) || marks <= 0) {
      setError("Marks must be a number greater than zero.");
      return;
    }

    const isObjective = [
      "multiple_choice",
      "true_false",
    ].includes(form.questionType);

    if (
      isObjective &&
      (form.options.length < 2 ||
        form.options.some((option) => !option.trim()))
    ) {
      setError("Complete all answer options before saving.");
      return;
    }

    setSaving(true);

    try {
      const payload = {
        examId: Number(form.examId),
        questionText: form.questionText.trim(),
        questionType: form.questionType,
        marks,
      };

      if (isObjective) {
        payload.options = form.options.map((option) => option.trim());
        payload.correctOptionIndex = Number(form.correctOptionIndex);
      }

      await api.post("/questions", payload);

      setSuccess("Question saved successfully.");

      setForm((current) => ({
        ...current,
        questionText: "",
        marks: "1",
        options:
          current.questionType === "true_false"
            ? ["True", "False"]
            : current.questionType === "multiple_choice"
              ? ["", "", "", ""]
              : [],
        correctOptionIndex: 0,
      }));

      await loadQuestions(form.examId);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Unable to save the question. Please try again."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="question-management">
      <section className="qm-panel">
        <div className="qm-heading">
          <div>
            <p className="qm-eyebrow">ASSESSMENT SETUP</p>
            <h2>Question Management</h2>
            <p>
              Create and organise questions for your draft examinations.
            </p>
          </div>

          <button
            type="button"
            className="qm-secondary-button"
            onClick={loadExams}
            disabled={loadingExams}
          >
            {loadingExams ? "Refreshing..." : "Refresh examinations"}
          </button>
        </div>

        {error && (
          <div className="qm-alert qm-error" role="alert">
            {error}
          </div>
        )}

        {success && (
          <div className="qm-alert qm-success" role="status">
            {success}
          </div>
        )}

        {loadingExams ? (
          <p className="qm-muted">Loading draft examinations...</p>
        ) : exams.length === 0 ? (
          <div className="qm-empty">
            <h3>No draft examinations available</h3>
            <p>
              Create an examination and save it as a draft in the
              Examinations section first.
            </p>
          </div>
        ) : (
          <>
            <div className="qm-exam-selector">
              <label htmlFor="qm-exam">Select examination</label>
              <select
                id="qm-exam"
                name="examId"
                value={form.examId}
                onChange={updateField}
                required
              >
                {exams.map((exam) => (
                  <option key={exam.id} value={exam.id}>
                    {exam.title} — {exam.class_name || "Class not specified"}
                    {exam.subject ? ` — ${exam.subject}` : ""}
                  </option>
                ))}
              </select>
            </div>

            {selectedExam && (
              <div className="qm-exam-info">
                <span>
                  <strong>Subject:</strong>{" "}
                  {selectedExam.subject || "Not specified"}
                </span>
                <span>
                  <strong>Class:</strong>{" "}
                  {selectedExam.class_name || "Not specified"}
                </span>
                <span className="qm-draft-label">Draft</span>
              </div>
            )}

            <form className="qm-form" onSubmit={handleSubmit}>
              <h3>Add a question</h3>

              <label htmlFor="qm-question">Question text</label>
              <textarea
                id="qm-question"
                name="questionText"
                value={form.questionText}
                onChange={updateField}
                placeholder="Type the question here..."
                rows={4}
                maxLength={10000}
                required
              />

              <div className="qm-form-grid">
                <div>
                  <label htmlFor="qm-type">Question type</label>
                  <select
                    id="qm-type"
                    name="questionType"
                    value={form.questionType}
                    onChange={changeQuestionType}
                  >
                    {questionTypes.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="qm-marks">Marks</label>
                  <input
                    id="qm-marks"
                    name="marks"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={form.marks}
                    onChange={updateField}
                    required
                  />
                </div>
              </div>

              {["multiple_choice", "true_false"].includes(
                form.questionType
              ) && (
                <div className="qm-options">
                  <div className="qm-options-heading">
                    <div>
                      <h4>Answer options</h4>
                      <p>Select the radio button beside the correct answer.</p>
                    </div>

                    {form.questionType === "multiple_choice" &&
                      form.options.length < 6 && (
                        <button
                          type="button"
                          className="qm-secondary-button"
                          onClick={addOption}
                        >
                          + Add option
                        </button>
                      )}
                  </div>

                  {form.options.map((option, index) => (
                    <div className="qm-option-row" key={index}>
                      <input
                        type="radio"
                        name="correctOptionIndex"
                        aria-label={`Mark option ${index + 1} as correct`}
                        checked={Number(form.correctOptionIndex) === index}
                        onChange={() =>
                          setForm((current) => ({
                            ...current,
                            correctOptionIndex: index,
                          }))
                        }
                      />

                      <label
                        className="qm-option-label"
                        htmlFor={`qm-option-${index}`}
                      >
                        Option {index + 1}
                      </label>

                      <input
                        id={`qm-option-${index}`}
                        type="text"
                        value={option}
                        onChange={(event) =>
                          updateOption(index, event.target.value)
                        }
                        placeholder={`Enter option ${index + 1}`}
                        maxLength={2000}
                        disabled={form.questionType === "true_false"}
                        required
                      />

                      {form.questionType === "multiple_choice" &&
                        form.options.length > 2 && (
                          <button
                            type="button"
                            className="qm-remove-option"
                            onClick={() => removeOption(index)}
                            aria-label={`Remove option ${index + 1}`}
                          >
                            Remove
                          </button>
                        )}
                    </div>
                  ))}
                </div>
              )}

              {["short_answer", "essay"].includes(form.questionType) && (
                <p className="qm-hint">
                  Learners will enter a written response. These question
                  types will need manual marking unless you add a marking
                  workflow later.
                </p>
              )}

              <button
                type="submit"
                className="qm-primary-button"
                disabled={saving || loadingQuestions}
              >
                {saving ? "Saving question..." : "Save question"}
              </button>
            </form>

            <section className="qm-saved-questions">
              <div className="qm-list-heading">
                <div>
                  <h3>Saved questions</h3>
                  <p>Questions currently attached to this examination.</p>
                </div>
                <span className="qm-count">{questions.length}</span>
              </div>

              {loadingQuestions ? (
                <p className="qm-muted">Loading questions...</p>
              ) : questions.length === 0 ? (
                <p className="qm-empty-inline">
                  No questions have been added to this examination yet.
                </p>
              ) : (
                <div className="qm-question-list">
                  {questions.map((question) => (
                    <article className="qm-question-card" key={question.id}>
                      <div className="qm-question-number">
                        {question.position}
                      </div>

                      <div className="qm-question-content">
                        <p className="qm-question-text">
                          {question.question_text}
                        </p>
                        <div className="qm-question-meta">
                          <span>
                            {questionTypes.find(
                              (type) => type.value === question.question_type
                            )?.label || question.question_type}
                          </span>
                          <span>{question.marks} marks</span>
                        </div>

                        {question.options?.length > 0 && (
                          <ul className="qm-saved-options">
                            {question.options.map((option) => (
                              <li key={option.id}>{option.option_text}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </section>
    </div>
  );
}

export default QuestionManagement;
