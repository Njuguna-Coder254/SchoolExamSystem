
import { useCallback, useEffect, useState } from "react";
import api from "./api";
import "./LearnerManagement.css";

const emptyForm = {
  fullName: "",
  assessmentNumber: "",
  admissionNumber: "",
  classId: "",
};

export default function LearnerManagement({ user }) {
  const [form, setForm] = useState({ ...emptyForm });
  const [classes, setClasses] = useState([]);
  const [learners, setLearners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState(null);

  const isAdmin = user?.role === "admin";

  const loadData = useCallback(async () => {
    setLoading(true);

    try {
      const [classResponse, learnerResponse] = await Promise.all([
        api.get("/school/classes"),
        api.get("/learners"),
      ]);

      setClasses(classResponse.data.classes || []);
      setLearners(learnerResponse.data.learners || []);
    } catch (error) {
      setMessage(
        error.response?.data?.message ||
          "Unable to load learner information. Check your login and backend."
      );
      setMessageType("error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  function resetForm() {
    setForm({ ...emptyForm });
    setEditingId(null);
  }

  function handleEdit(learner) {
    setForm({
      fullName: learner.full_name || "",
      assessmentNumber: learner.assessment_number || "",
      admissionNumber: learner.admission_number || "",
      classId: String(learner.class_id || ""),
    });

    setEditingId(learner.id);
    setMessage("");
    setMessageType("success");

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");

    const fullName = form.fullName.trim();
    const assessmentNumber = form.assessmentNumber.trim();
    const admissionNumber = form.admissionNumber.trim();
    const classId = Number(form.classId);

    if (
      !fullName ||
      !assessmentNumber ||
      !admissionNumber ||
      !form.classId
    ) {
      setMessage("Complete all required fields.");
      setMessageType("error");
      return;
    }

    if (fullName.length > 150 || assessmentNumber.length > 50 ||
        admissionNumber.length > 50) {
      setMessage("Please check the length of the entered details.");
      setMessageType("error");
      return;
    }

    const assessmentDigits = assessmentNumber.replace(/\D/g, "");

    if (assessmentDigits.length < 5) {
      setMessage(
        "The assessment number must contain at least five digits."
      );
      setMessageType("error");
      return;
    }

    if (!Number.isSafeInteger(classId) || classId <= 0) {
      setMessage("Select a valid class.");
      setMessageType("error");
      return;
    }

    const payload = {
      fullName,
      assessmentNumber,
      username: assessmentNumber,
      admissionNumber,
      classId,
    };

    setSaving(true);

    try {
      const response = editingId
        ? await api.put(`/learners/${editingId}`, payload)
        : await api.post("/learners", payload);

      setMessage(
        response.data.message ||
          (editingId
            ? "Learner details updated successfully."
            : "Learner registered successfully.")
      );
      setMessageType("success");
      resetForm();

      await loadData();
    } catch (error) {
      setMessage(
        error.response?.data?.message ||
          (editingId
            ? "Unable to update learner details. Please try again."
            : "Unable to register the learner. Please try again.")
      );
      setMessageType("error");
    } finally {
      setSaving(false);
    }
  }

  const filteredLearners = learners.filter((learner) => {
    const term = search.trim().toLowerCase();

    if (!term) return true;

    return [
      learner.full_name,
      learner.username,
      learner.assessment_number,
      learner.admission_number,
      learner.class_name,
    ].some((value) => String(value || "").toLowerCase().includes(term));
  });

  return (
    <div className="learner-page">
      <div className="learner-header">
        <div>
          <p className="learner-eyebrow">SCHOOL ADMINISTRATION</p>
          <h1>Learner Management</h1>
          <p className="learner-subtitle">
            Register learners, assign classes and manage learner records.
          </p>
        </div>

        <button
          type="button"
          className="learner-refresh"
          onClick={loadData}
          disabled={loading || saving}
        >
          {loading ? "Loading..." : "Refresh records"}
        </button>
      </div>

      {message && (
        <div
          className={`learner-message ${messageType}`}
          role="status"
        >
          {message}
        </div>
      )}

      {isAdmin && (
        <section className="learner-panel">
          <div className="learner-panel-heading">
            <div>
              <h2>
                {editingId ? "Update learner details" : "Register a learner"}
              </h2>
              <p>
                {editingId
                  ? "Edit the learner's details and save your changes."
                  : "Create a learner login and assign an existing class."}
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="learner-form-grid">
              <div className="learner-field">
                <label htmlFor="fullName">Learner full name</label>
                <input
                  id="fullName"
                  name="fullName"
                  value={form.fullName}
                  onChange={handleChange}
                  maxLength={150}
                  placeholder="Enter full name"
                  autoComplete="name"
                  required
                />
              </div>

              <div className="learner-field">
                <label htmlFor="assessmentNumber">
                  Assessment number
                </label>
                <input
                  id="assessmentNumber"
                  name="assessmentNumber"
                  value={form.assessmentNumber}
                  onChange={handleChange}
                  maxLength={50}
                  placeholder="Enter assessment number"
                  autoComplete="off"
                  required
                />
                <small>
                  This will also be the learner's login username.
                </small>
              </div>

              <div className="learner-field">
                <label htmlFor="admissionNumber">Admission number</label>
                <input
                  id="admissionNumber"
                  name="admissionNumber"
                  value={form.admissionNumber}
                  onChange={handleChange}
                  maxLength={50}
                  placeholder="e.g. ADM001"
                  required
                />
              </div>

              <div className="learner-field">
                <label htmlFor="classId">Assign class</label>
                <select
                  id="classId"
                  name="classId"
                  value={form.classId}
                  onChange={handleChange}
                  required
                >
                  <option value="">Select a class</option>
                  {classes.map((schoolClass) => (
                    <option key={schoolClass.id} value={schoolClass.id}>
                      {schoolClass.name}
                    </option>
                  ))}
                </select>

                {classes.length === 0 && !loading && (
                  <small>No classes available. Add a class first.</small>
                )}
              </div>
            </div>

            <div className="learner-form-actions">
              <button
                type="submit"
                className="learner-primary"
                disabled={saving || loading || classes.length === 0}
              >
                {saving
                  ? "Saving..."
                  : editingId
                    ? "Update learner"
                    : "Register learner"}
              </button>

              <button
                type="button"
                className="learner-secondary"
                onClick={() => {
                  resetForm();
                  setMessage("");
                }}
                disabled={saving}
              >
                {editingId ? "Cancel edit" : "Clear form"}
              </button>
            </div>
          </form>
        </section>
      )}

      {!isAdmin && (
        <div className="learner-readonly-note">
          You can view learner records, but only an administrator can
          register or update learners.
        </div>
      )}

      <section className="learner-panel">
        <div className="learner-list-heading">
          <div>
            <h2>Registered learners</h2>
            <p>
              {filteredLearners.length} learner
              {filteredLearners.length === 1 ? "" : "s"} shown
            </p>
          </div>

          <input
            className="learner-search"
            type="search"
            aria-label="Search learners"
            placeholder="Search name, assessment, admission or class..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        {loading ? (
          <p className="learner-empty">Loading learner records...</p>
        ) : filteredLearners.length === 0 ? (
          <p className="learner-empty">
            {learners.length === 0
              ? "No learners have been registered yet."
              : "No learners match your search."}
          </p>
        ) : (
          <div className="learner-table-wrap">
            <table className="learner-table">
              <thead>
                <tr>
                  <th>Assessment No.</th>
                  <th>Admission No.</th>
                  <th>Learner name</th>
                  <th>Username</th>
                  <th>Class</th>
                  <th>Account status</th>
                  {isAdmin && <th>Actions</th>}
                </tr>
              </thead>

              <tbody>
                {filteredLearners.map((learner) => (
                  <tr key={learner.id}>
                    <td>{learner.assessment_number || "—"}</td>
                    <td>{learner.admission_number}</td>
                    <td>{learner.full_name}</td>
                    <td>{learner.username}</td>
                    <td>{learner.class_name}</td>
                    <td>
                      <span
                        className={`learner-status ${
                          learner.is_active ? "active" : "inactive"
                        }`}
                      >
                        {learner.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>

                    {isAdmin && (
                      <td>
                        <button
                          type="button"
                          className="learner-secondary"
                          onClick={() => handleEdit(learner)}
                          disabled={saving}
                        >
                          Update
                        </button>
                      </td>
                    )}
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
