
import { useEffect, useState } from "react";
import api from "./api";

function TeacherMarking() {
  const [exams, setExams] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [selectedExam, setSelectedExam] = useState(null);
  const [selectedAttempt, setSelectedAttempt] = useState(null);
  const [attemptDetails, setAttemptDetails] = useState(null);
  const [marks, setMarks] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadExams();
  }, []);

  async function loadExams() {
    try {
      setLoading(true);
      setError("");
      const response = await api.get("/marking/my-exams");
      setExams(response.data.exams || []);
    } catch (err) {
      setError(err.response?.data?.message || "Unable to load assigned examinations.");
    } finally {
      setLoading(false);
    }
  }

  async function loadAttempts(exam) {
    try {
      setError("");
      setMessage("");
      setSelectedExam(exam);
      setSelectedAttempt(null);
      setAttemptDetails(null);

      const response = await api.get(`/marking/exams/${exam.id}/attempts`);
      setAttempts(response.data.attempts || []);
    } catch (err) {
      setError(err.response?.data?.message || "Unable to load submissions.");
    }
  }

  async function openAttempt(attempt) {
    try {
      setError("");
      setMessage("");
      setSelectedAttempt(attempt);
      setAttemptDetails(null);
      setMarks({});

      const response = await api.get(
        `/marking/attempts/${attempt.attempt_id}`
      );

      setAttemptDetails(response.data);

      const initialMarks = {};

      (response.data.questions || []).forEach((question) => {
        if (
          question.question_type === "short_answer" ||
          question.question_type === "essay"
        ) {
          if (question.awarded_marks !== null &&
              question.awarded_marks !== undefined) {
            initialMarks[question.question_id] = String(question.awarded_marks);
          }
        }
      });

      setMarks(initialMarks);
    } catch (err) {
      setError(err.response?.data?.message || "Unable to open submission.");
    }
  }

  async function saveMark(question) {
    const questionId = question.question_id;
    const maximumMarks = Number(question.maximum_marks);
    const value = marks[questionId];

    if (value === undefined || value === "") {
      setError("Enter a mark before saving.");
      return;
    }

    const awardedMarks = Number(value);

    if (
      !Number.isFinite(awardedMarks) ||
      awardedMarks < 0 ||
      awardedMarks > maximumMarks
    ) {
      setError(`Enter a mark between 0 and ${maximumMarks}.`);
      return;
    }

    try {
      setError("");
      setMessage("");

      await api.put(
        `/marking/attempts/${selectedAttempt.attempt_id}/questions/${questionId}`,
        { awardedMarks }
      );

      setMessage("Mark saved successfully.");

      await openAttempt(selectedAttempt);
      await loadAttempts(selectedExam);
    } catch (err) {
      setError(err.response?.data?.message || "Unable to save mark.");
    }
  }

  if (loading) {
    return <div className="teacher-panel">Loading assigned examinations...</div>;
  }

  return (
    <div className="teacher-marking">
      <div className="teacher-panel">
        <h2>Assigned Examinations</h2>
        <p>Examinations assigned to you for marking.</p>

        {error && <p role="alert" style={{ color: "#b42318" }}>{error}</p>}
        {message && <p style={{ color: "#067647" }}>{message}</p>}

        {exams.length === 0 ? (
          <p>No examinations have been assigned to you.</p>
        ) : (
          exams.map((exam) => (
            <div key={exam.id} style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 16, marginTop: 12 }}>
              <h3>{exam.title}</h3>
              <p>Status: {exam.status}</p>
              <button type="button" onClick={() => loadAttempts(exam)}>
                View submissions
              </button>
            </div>
          ))
        )}
      </div>

      {selectedExam && (
        <div className="teacher-panel">
          <h2>{selectedExam.title} — Submissions</h2>
          <button type="button" onClick={() => {
            setSelectedExam(null);
            setAttempts([]);
            setSelectedAttempt(null);
            setAttemptDetails(null);
          }}>
            Back to examinations
          </button>

          {attempts.length === 0 ? (
            <p>No submitted attempts are currently available for marking.</p>
          ) : (
            attempts.map((attempt) => (
              <div key={attempt.attempt_id} style={{ padding: 12, borderBottom: "1px solid #eee" }}>
                <strong>{attempt.learner_name}</strong>
                <p>Admission number: {attempt.admission_number}</p>
                <p>Status: {attempt.status}</p>
                <button type="button" onClick={() => openAttempt(attempt)}>
                  Mark submission
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {attemptDetails && (
        <div className="teacher-panel">
          <h2>Learner Submission</h2>

          <div>
            <strong>{attemptDetails.attempt?.learner_name || "Learner"}</strong>
            <p>Admission number: {attemptDetails.attempt?.admission_number}</p>
            <p>Assessment number: {attemptDetails.attempt?.assessment_number}</p>
            <p>Class: {attemptDetails.attempt?.class_name}</p>
            <p>Examination: {attemptDetails.attempt?.exam_title}</p>
            <p>Objective score: {attemptDetails.attempt?.objective_score ?? "Pending"}</p>
            <p>Written score: {attemptDetails.attempt?.essay_score ?? "Pending"}</p>
            <p>Total score: {attemptDetails.attempt?.total_score ?? "Pending"}</p>
          </div>

          {(attemptDetails.questions || []).map((question, index) => {
            const questionId = question.question_id;
            const maximumMarks = Number(question.maximum_marks);
            const written =
              question.question_type === "short_answer" ||
              question.question_type === "essay";

            const selectedOption = question.options?.find(
              (option) => String(option.id) === String(question.selected_option_id)
            );

            return (
              <div key={questionId} style={{ borderTop: "1px solid #e2e8f0", padding: "18px 0" }}>
                <h3>
                  Question {index + 1} ({maximumMarks} marks)
                </h3>

                <p>{question.question_text}</p>

                {question.question_type === "multiple_choice" && (
                  <div>
                    <strong>Options and learner's selection</strong>
                    {question.options?.map((option) => (
                      <p key={option.id}>
                        {option.position}. {option.option_text}
                        {String(option.id) === String(question.selected_option_id)
                          ? " — Selected by learner"
                          : ""}
                      </p>
                    ))}
                    <p>
                      Learner's selected answer: {selectedOption?.option_text || "Not answered"}
                    </p>
                    <p>
                      Automatically awarded marks: {question.awarded_marks ?? "See objective score"}
                    </p>
                  </div>
                )}

                {question.question_type === "true_false" && (
                  <div>
                    <strong>Learner's answer:</strong>
                    <p>{selectedOption?.option_text || question.answer_text || "Not answered"}</p>
                  </div>
                )}

                {written && (
                  <>
                    <strong>Learner's answer</strong>
                    <p style={{ whiteSpace: "pre-wrap" }}>
                      {question.answer_text || "No written answer provided."}
                    </p>

                    <label>
                      Awarded marks (maximum {maximumMarks})
                      <input
                        type="number"
                        min="0"
                        max={maximumMarks}
                        step="0.5"
                        value={marks[questionId] ?? ""}
                        onChange={(event) => setMarks((previous) => ({
                          ...previous,
                          [questionId]: event.target.value
                        }))}
                      />
                    </label>

                    <button type="button" onClick={() => saveMark(question)}>
                      Save mark
                    </button>

                    {question.marked_by_name && (
                      <p>Last marked by: {question.marked_by_name}</p>
                    )}
                  </>
                )}
              </div>
            );
          })}

          <button type="button" onClick={() => {
            setAttemptDetails(null);
            setSelectedAttempt(null);
            loadAttempts(selectedExam);
          }}>
            Back to submissions
          </button>
        </div>
      )}
    </div>
  );
}

export default TeacherMarking;
