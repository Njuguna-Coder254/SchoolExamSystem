
import { useCallback, useEffect, useRef, useState } from "react";
import api from "./api";
import "./LearnerExamPortal.css";

function LearnerExamPortal({ user, onLogout }) {
  const [exams, setExams] = useState([]);
  const [attempt, setAttempt] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [selectedExam, setSelectedExam] = useState(null);

  const timerRef = useRef(null);

  const learnerName = user?.fullName || user?.full_name || user?.username || "Learner";
  const learnerAdmission = user?.admission_number || user?.admissionNumber || "";

  const loadExams = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await api.get("/learner-exams/available");
      setExams(
        Array.isArray(response.data)
          ? response.data
          : response.data.exams || []
      );
    } catch (err) {
      setError(
        err.response?.data?.message ||
        "Unable to load available examinations. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadExams();
  }, [loadExams]);

  const submitExam = useCallback(async (attemptId) => {
    if (!attemptId) return;

    try {
      await api.post(`/learner-exams/attempts/${attemptId}/submit`);
      setSubmitted(true);
      setAttempt(null);
      setQuestions([]);
      setConfirmSubmit(false);
      setSecondsLeft(null);
      setMessage("Your examination has been submitted successfully.");
      setError("");
    } catch (err) {
      setError(
        err.response?.data?.message ||
        "Submission failed. Please check your connection and try again."
      );
    }
  }, []);

  useEffect(() => {
    if (!attempt?.id || secondsLeft === null || submitted) return;

    if (secondsLeft <= 0) {
      submitExam(attempt.id);
      return;
    }

    timerRef.current = setTimeout(() => {
      setSecondsLeft((current) =>
        current === null ? null : Math.max(0, current - 1)
      );
    }, 1000);

    return () => clearTimeout(timerRef.current);
  }, [attempt, secondsLeft, submitted, submitExam]);

  async function startExam(exam) {
    setError("");
    setMessage("");
    setSelectedExam(null);
    setLoading(true);

    try {
      const startResponse = await api.post(
        `/learner-exams/${exam.id}/start`
      );

      const startedAttempt =
        startResponse.data.attempt || startResponse.data;

      const attemptId = startedAttempt.id;

      if (!attemptId) {
        throw new Error("The server did not return an examination attempt.");
      }

      const response = await api.get(
        `/learner-exams/attempts/${attemptId}`
      );

      const data = response.data;
      const loadedAttempt = data.attempt || startedAttempt;
      const loadedQuestions = data.questions || [];

      if (
        loadedAttempt.status &&
        loadedAttempt.status !== "in_progress"
      ) {
        setMessage("This examination attempt is no longer active.");
        await loadExams();
        return;
      }

      const savedAnswers = {};

      (data.answers || []).forEach((answer) => {
        savedAnswers[answer.question_id ?? answer.questionId] = {
          selectedOptionId:
            answer.selected_option_id ?? answer.selectedOptionId ?? "",
          answerText:
            answer.answer_text ?? answer.answerText ?? "",
        };
      });

      setAttempt(loadedAttempt);
      setQuestions(loadedQuestions);
      setAnswers(savedAnswers);
      setCurrentQuestion(0);
      setSubmitted(false);

      const deadlineValue =
        loadedAttempt.deadline ||
        loadedAttempt.ends_at ||
        loadedAttempt.endsAt;

      const deadline = deadlineValue
        ? new Date(deadlineValue).getTime()
        : null;

      const remaining = deadline
        ? Math.max(0, Math.floor((deadline - Date.now()) / 1000))
        : null;

      if (remaining === null) {
        setError(
          "The server did not provide the examination deadline. " +
          "Please contact the examination administrator."
        );
      } else {
        setSecondsLeft(remaining);
      }
    } catch (err) {
      setError(
        err.response?.data?.message ||
        err.message ||
        "Unable to start the examination."
      );
    } finally {
      setLoading(false);
    }
  }

  async function saveAnswer(question, value) {
    if (!attempt?.id || submitted) return;

    const questionId = question.id;

    const nextAnswer = {
      ...(answers[questionId] || {
        selectedOptionId: "",
        answerText: "",
      }),
      ...value,
    };

    setAnswers((previous) => ({
      ...previous,
      [questionId]: nextAnswer,
    }));

    setSaving(true);
    setError("");

    try {
      await api.put(
        `/learner-exams/attempts/${attempt.id}/answers`,
        {
          questionId: String(questionId),
          selectedOptionId: nextAnswer.selectedOptionId
            ? String(nextAnswer.selectedOptionId)
            : null,
          answerText: nextAnswer.answerText || null,
        }
      );
    } catch (err) {
      setError(
        err.response?.data?.message ||
        "Your answer may not have been saved. Please try again."
      );
    } finally {
      setSaving(false);
    }
  }

  function formatTime(totalSeconds) {
    const safe = Math.max(0, totalSeconds || 0);
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    const seconds = safe % 60;

    return [hours, minutes, seconds]
      .map((part) => String(part).padStart(2, "0"))
      .join(":");
  }

  async function returnToExams() {
    setAttempt(null);
    setQuestions([]);
    setAnswers({});
    setSecondsLeft(null);
    setSubmitted(false);
    setConfirmSubmit(false);
    setMessage("");
    await loadExams();
  }

  const schoolHeader = (
    <header className="learner-header">
      <div className="learner-brand">
        <div className="learner-brand-mark">IJ</div>
        <div>
          <strong>IHURURU JUNIOR SCHOOL</strong>
          <span>School Examination System</span>
        </div>
      </div>

      <div className="learner-account">
        <div className="learner-user-info">
          <strong>{learnerName}</strong>
          {learnerAdmission && <span>{learnerAdmission}</span>}
          <span className="learner-role">LEARNER</span>
        </div>

        <button className="learner-password-button" type="button" disabled>
          Account
        </button>

        <button className="learner-logout" onClick={onLogout}>
          Log Out
        </button>
      </div>
    </header>
  );

  if (submitted) {
    return (
      <main className="learner-shell">
        {schoolHeader}

        <section className="learner-panel submission-panel">
          <div className="submission-check">✓</div>
          <h1>Examination submitted</h1>
          <p>{message}</p>
          <p className="learner-muted">
            Your submission has been recorded. Follow the instructions
            provided by your examination administrator regarding results.
          </p>

          <button className="learner-primary" onClick={returnToExams}>
            Return to examinations
          </button>
        </section>

        <footer className="learner-footer">
          © {new Date().getFullYear()} IHURURU JUNIOR SCHOOL
        </footer>
      </main>
    );
  }

  if (attempt) {
    const question = questions[currentQuestion];
    const questionId = question?.id;

    const currentAnswer = answers[questionId] || {
      selectedOptionId: "",
      answerText: "",
    };

    return (
      <main className="learner-shell">
        <header className="learner-header">
          <div className="learner-brand">
            <div className="learner-brand-mark">IJ</div>
            <div>
              <strong>IHURURU JUNIOR SCHOOL</strong>
              <span>Examination in Progress</span>
            </div>
          </div>

          <div className="exam-timer" aria-live="polite">
            <span>TIME LEFT</span>
            <strong>{formatTime(secondsLeft)}</strong>
          </div>
        </header>

        <section className="learner-panel exam-panel">
          <div className="exam-progress-heading">
            <div>
              <p className="learner-eyebrow">ASSESSMENT</p>
              <h1>{attempt.title || attempt.exam_title || "Examination"}</h1>
              <p className="learner-muted">{learnerName}</p>
            </div>

            <span className="question-count">
              Question {questions.length ? currentQuestion + 1 : 0}
              {" "}of {questions.length}
            </span>
          </div>

          {error && <div className="learner-error">{error}</div>}

          {saving && (
            <p className="learner-muted" role="status">
              Saving answer…
            </p>
          )}

          {!questions.length ? (
            <p>No questions were returned for this examination.</p>
          ) : (
            <>
              <div className="question-progress">
                <div
                  style={{
                    width: `${((currentQuestion + 1) / questions.length) * 100}%`,
                  }}
                />
              </div>

              <article className="question-card">
                <p className="learner-muted">
                  Question {currentQuestion + 1}
                  {question.marks != null ? ` · ${question.marks} marks` : ""}
                </p>

                <h2>
                  {question.question_text || question.questionText}
                </h2>

                {["multiple_choice", "true_false"].includes(
                  question.question_type || question.questionType
                ) ? (
                  <div className="answer-options">
                    {(question.options || []).map((option) => (
                      <label className="answer-option" key={option.id}>
                        <input
                          type="radio"
                          name={`question-${question.id}`}
                          checked={
                            String(currentAnswer.selectedOptionId) ===
                            String(option.id)
                          }
                          onChange={() =>
                            saveAnswer(question, {
                              selectedOptionId: String(option.id),
                              answerText: "",
                            })
                          }
                        />
                        <span>
                          {option.option_text || option.optionText}
                        </span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <textarea
                    className="written-answer"
                    value={currentAnswer.answerText}
                    onChange={(event) => {
                      const text = event.target.value;

                      setAnswers((previous) => ({
                        ...previous,
                        [question.id]: {
                          ...currentAnswer,
                          answerText: text,
                          selectedOptionId: "",
                        },
                      }));
                    }}
                    onBlur={() =>
                      saveAnswer(question, {
                        answerText: currentAnswer.answerText,
                        selectedOptionId: "",
                      })
                    }
                    rows={6}
                    placeholder="Type your answer here"
                  />
                )}
              </article>

              <div className="question-navigation">
                <button
                  className="learner-secondary"
                  disabled={currentQuestion === 0}
                  onClick={() =>
                    setCurrentQuestion((index) => index - 1)
                  }
                >
                  Previous
                </button>

                <button
                  className="learner-secondary"
                  disabled={currentQuestion >= questions.length - 1}
                  onClick={() =>
                    setCurrentQuestion((index) => index + 1)
                  }
                >
                  Next
                </button>

                <button
                  className="learner-primary"
                  onClick={() => setConfirmSubmit(true)}
                >
                  Submit examination
                </button>
              </div>
            </>
          )}
        </section>

        {confirmSubmit && (
          <div className="learner-modal-backdrop">
            <section className="learner-modal" role="dialog" aria-modal="true">
              <h2>Submit examination?</h2>
              <p>
                Make sure you have reviewed your answers. After submission,
                you may not be able to change them.
              </p>

              <div className="modal-actions">
                <button
                  className="learner-secondary"
                  onClick={() => setConfirmSubmit(false)}
                >
                  Continue exam
                </button>

                <button
                  className="learner-primary"
                  onClick={() => submitExam(attempt.id)}
                >
                  Confirm submission
                </button>
              </div>
            </section>
          </div>
        )}
      </main>
    );
  }

  return (
    <main className="learner-shell">
      {schoolHeader}

      <div className="learner-dashboard">
        <aside className="learner-sidebar">
          <div className="sidebar-heading">ASSESSMENTS</div>

          <button className="sidebar-link active" type="button">
            <span>▤</span>
            Assessment Papers
          </button>

          <div className="sidebar-bottom">
            <p>IHURURU JUNIOR SCHOOL</p>
            <span>Authorised Learner Access</span>
          </div>
        </aside>

        <section className="learner-content">
          <div className="learner-page-heading">
            <div>
              <p className="learner-eyebrow">LEARNER PORTAL</p>
              <h1>Assessments</h1>
              <p>
                Welcome, {learnerName}. Select an assessment paper
                and read its instructions before starting.
              </p>
            </div>

            <button
              className="learner-secondary refresh-button"
              onClick={loadExams}
              disabled={loading}
            >
              ↻ Refresh
            </button>
          </div>

          {error && <div className="learner-error">{error}</div>}
          {message && <div className="learner-notice">{message}</div>}

          <div className="assessment-instruction-banner">
            <span>ⓘ</span>
            To respond to an assessment, click on Read Instructions.
          </div>

          <div className="assessment-section-title">
            <span>REGULAR ASSESSMENT PAPERS</span>
          </div>

          {loading ? (
            <section className="learner-panel">
              Loading examinations…
            </section>
          ) : exams.length === 0 ? (
            <section className="learner-panel empty-exams">
              <div className="empty-exams-icon">▤</div>
              <h2>No examinations available</h2>
              <p>
                There are no examinations available to you right now.
                Please check again at the scheduled time.
              </p>
              <button className="learner-secondary" onClick={loadExams}>
                Refresh examinations
              </button>
            </section>
          ) : (
            <div className="learner-exam-list">
              {exams.map((exam, index) => (
                <article className="assessment-paper-row" key={exam.id}>
                  <span className="assessment-number">{index + 1}</span>

                  <div className="assessment-paper-icon">▤</div>

                  <div className="assessment-paper-details">
                    <h2>{exam.title}</h2>
                    <p>
                      {exam.subject_name || exam.subject || "Assessment"}
                      {exam.class_name || exam.class
                        ? ` · ${exam.class_name || exam.class}`
                        : ""}
                    </p>

                    {exam.duration_minutes != null && (
                      <span className="exam-duration">
                        ◷ {exam.duration_minutes} minutes
                      </span>
                    )}
                  </div>

                  <button
                    className="learner-primary read-instructions-button"
                    disabled={loading}
                    onClick={() => setSelectedExam(exam)}
                  >
                    Read Instructions
                  </button>
                </article>
              ))}
            </div>
          )}

          <footer className="learner-footer">
            © {new Date().getFullYear()} IHURURU JUNIOR SCHOOL
          </footer>
        </section>
      </div>

      {selectedExam && (
        <div className="learner-modal-backdrop">
          <section className="learner-modal" role="dialog" aria-modal="true">
            <p className="learner-eyebrow">ASSESSMENT INSTRUCTIONS</p>
            <h2>{selectedExam.title}</h2>

            <div className="instruction-content">
              {selectedExam.instructions ? (
                <p>{selectedExam.instructions}</p>
              ) : (
                <p>
                  Please answer all questions carefully. Your answers
                  will be saved as you progress through the examination.
                  Do not close the examination window before submitting.
                </p>
              )}

              <p>
                <strong>Duration:</strong>{" "}
                {selectedExam.duration_minutes ?? "Not specified"} minutes
              </p>
            </div>

            <div className="modal-actions">
              <button
                className="learner-secondary"
                onClick={() => setSelectedExam(null)}
              >
                Close
              </button>

              <button
                className="learner-primary"
                onClick={() => startExam(selectedExam)}
              >
                Start Examination
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

export default LearnerExamPortal;
