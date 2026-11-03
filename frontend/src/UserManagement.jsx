
import { useCallback, useEffect, useState } from "react";
import api from "./api";
import "./UserManagement.css";

const emptyForm = {
  fullName: "",
  username: "",
  password: "",
  role: "teacher",
};

export default function UserManagement() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [teachingAssignments, setTeachingAssignments] = useState([]);
  const [assignmentForm, setAssignmentForm] = useState({ teacherId: "", classId: "", subjectId: "" });

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [response, classResponse, subjectResponse, assignmentResponse] = await Promise.all([
        api.get("/users"), api.get("/school/classes"), api.get("/school/subjects"), api.get("/users/teaching-assignments")
      ]);
      setUsers(response.data.users || []);
      setClasses(classResponse.data.classes || []);
      setSubjects(subjectResponse.data.subjects || []);
      setTeachingAssignments(assignmentResponse.data.assignments || []);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Unable to load user accounts. Confirm that you are logged in as an administrator."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  function updateForm(event) {
    const { name, value } = event.target;
    setForm((previous) => ({ ...previous, [name]: value }));
  }

  async function createUser(event) {
    event.preventDefault();
    setMessage("");
    setError("");
    setSaving(true);

    try {
      const response = await api.post("/users", form);

      setMessage(
        response.data.message || "Staff account created successfully."
      );
      setForm(emptyForm);
      await loadUsers();
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Unable to create the account. Please try again."
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(user) {
    const nextStatus = !user.is_active;
    const action = nextStatus ? "activate" : "deactivate";

    if (
      !window.confirm(
        `Are you sure you want to ${action} ${user.full_name}'s account?`
      )
    ) {
      return;
    }

    setMessage("");
    setError("");

    try {
      const response = await api.patch(`/users/${user.id}/status`, {
        isActive: nextStatus,
      });

      setMessage(response.data.message || "Account status updated.");
      await loadUsers();
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Unable to update the account status."
      );
    }
  }

  async function saveTeachingAssignment(event) {
    event.preventDefault();
    setError(""); setMessage("");
    try {
      const response = await api.post("/users/teaching-assignments", assignmentForm);
      setMessage(response.data.message);
      setAssignmentForm({ teacherId: "", classId: "", subjectId: "" });
      await loadUsers();
    } catch (err) {
      setError(err.response?.data?.message || "Unable to assign teacher.");
    }
  }

  async function removeTeachingAssignment(id) {
    if (!window.confirm("Remove this teacher's class and subject assignment?")) return;
    try {
      const response = await api.delete(`/users/teaching-assignments/${id}`);
      setMessage(response.data.message);
      await loadUsers();
    } catch (err) {
      setError(err.response?.data?.message || "Unable to remove assignment.");
    }
  }

  const filteredUsers = users.filter((user) => {
    const term = search.trim().toLowerCase();

    return (
      !term ||
      user.full_name?.toLowerCase().includes(term) ||
      user.username?.toLowerCase().includes(term) ||
      user.role?.toLowerCase().includes(term)
    );
  });

  return (
    <div className="user-management-page">
      <header className="user-management-header">
        <div>
          <span className="user-eyebrow">ADMINISTRATION</span>
          <h1>User Management</h1>
          <p>Create staff accounts and manage their access.</p>
        </div>

        <button
          type="button"
          className="user-refresh-button"
          onClick={loadUsers}
          disabled={loading}
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
      </header>

      {message && (
        <div className="user-alert user-alert-success" role="status">
          {message}
        </div>
      )}

      {error && (
        <div className="user-alert user-alert-error" role="alert">
          {error}
        </div>
      )}

      <section className="user-panel">
        <div className="user-panel-heading">
          <div>
            <h2>Create Staff Account</h2>
            <p>Register teachers who will prepare and mark examinations.</p>
          </div>
        </div>

        <form className="user-form" onSubmit={createUser}>
          <div className="user-form-grid">
            <label>
              Full name
              <input
                name="fullName"
                value={form.fullName}
                onChange={updateForm}
                placeholder="Enter full name"
                maxLength={150}
                autoComplete="name"
                required
              />
            </label>

            <label>
              Username
              <input
                name="username"
                value={form.username}
                onChange={updateForm}
                placeholder="Enter username"
                minLength={3}
                maxLength={80}
                autoComplete="off"
                pattern="[A-Za-z0-9_.-]{3,80}"
                title="Use 3–80 letters, numbers, dots, underscores or hyphens."
                required
              />
            </label>

            <label>
              Temporary password
              <input
                type="password"
                name="password"
                value={form.password}
                onChange={updateForm}
                placeholder="At least 10 characters"
                minLength={10}
                maxLength={200}
                autoComplete="new-password"
                required
              />
            </label>

            <label>
              Staff role
              <select
                name="role"
                value={form.role}
                onChange={updateForm}
                required
              >
                <option value="teacher">Teacher</option>
              </select>
            </label>
          </div>

          <div className="user-form-actions">
            <button
              type="submit"
              className="user-primary-button"
              disabled={saving}
            >
              {saving ? "Creating..." : "Create Staff Account"}
            </button>
          </div>
        </form>
      </section>

      <section className="user-panel">
        <div className="user-panel-heading"><div><h2>Teaching Assignments</h2><p>Assign each teacher to the classes and subjects they teach.</p></div></div>
        <form className="user-form" onSubmit={saveTeachingAssignment}>
          <div className="user-form-grid">
            <label>Teacher<select required value={assignmentForm.teacherId} onChange={e=>setAssignmentForm(v=>({...v,teacherId:e.target.value}))}><option value="">Select teacher</option>{users.filter(u=>u.role==="teacher"&&u.is_active).map(u=><option key={u.id} value={u.id}>{u.full_name}</option>)}</select></label>
            <label>Class<select required value={assignmentForm.classId} onChange={e=>setAssignmentForm(v=>({...v,classId:e.target.value}))}><option value="">Select class</option>{classes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <label>Subject<select required value={assignmentForm.subjectId} onChange={e=>setAssignmentForm(v=>({...v,subjectId:e.target.value}))}><option value="">Select subject</option>{subjects.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          </div>
          <div className="user-form-actions"><button className="user-primary-button" type="submit">Save teaching assignment</button></div>
        </form>
        <div className="user-table-wrapper"><table className="user-table"><thead><tr><th>Teacher</th><th>Class</th><th>Subject</th><th>Action</th></tr></thead><tbody>{teachingAssignments.map(a=><tr key={a.id}><td>{a.teacher_name}</td><td>{a.class_name}</td><td>{a.subject_name}</td><td><button type="button" className="user-refresh-button" onClick={()=>removeTeachingAssignment(a.id)}>Remove</button></td></tr>)}</tbody></table></div>
      </section>

      <section className="user-panel">
        <div className="user-panel-heading user-list-heading">
          <div>
            <h2>System Users</h2>
            <p>{users.length} account(s) registered</p>
          </div>

          <input
            className="user-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, username or role"
            aria-label="Search user accounts"
          />
        </div>

        {loading ? (
          <p className="user-empty-state">Loading user accounts...</p>
        ) : filteredUsers.length === 0 ? (
          <p className="user-empty-state">
            {users.length === 0
              ? "No user accounts found."
              : "No accounts match your search."}
          </p>
        ) : (
          <div className="user-table-wrapper">
            <table className="user-table">
              <thead>
                <tr>
                  <th>Full Name</th>
                  <th>Username</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.id}>
                    <td data-label="Full Name">{user.full_name}</td>
                    <td data-label="Username">{user.username}</td>
                    <td data-label="Role">
                      <span className="user-role-badge">
                        {user.role}
                      </span>
                    </td>
                    <td data-label="Status">
                      <span
                        className={`user-status ${
                          user.is_active ? "is-active" : "is-inactive"
                        }`}
                      >
                        {user.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td data-label="Created">
                      {user.created_at
                        ? new Date(user.created_at).toLocaleDateString()
                        : "—"}
                    </td>
                    <td data-label="Action">
                      <button
                        type="button"
                        className={`user-status-button ${
                          user.is_active ? "deactivate" : "activate"
                        }`}
                        onClick={() => toggleStatus(user)}
                        disabled={String(user.id) === ""}
                      >
                        {user.is_active ? "Deactivate" : "Activate"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="user-security-note">
        Account creation and status changes are restricted by the backend to
        administrators. Passwords are never displayed in this table.
      </p>
    </div>
  );
}
