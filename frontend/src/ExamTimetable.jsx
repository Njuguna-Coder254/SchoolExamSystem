import { useEffect, useState } from "react";
import api from "./api";

function ExamTimetable() {
  const [exams, setExams] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true); setError("");
    try {
      const response = await api.get("/exams");
      setExams((response.data.exams || []).filter(e => ["Grade 7","Grade 8","Grade 9"].includes(e.class_name)));
    } catch (err) {
      setError(err.response?.data?.message || "Unable to load the examination timetable.");
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const days = [...new Set(exams.map(e => new Date(e.starts_at).toLocaleDateString("en-KE", {weekday:"long",day:"numeric",month:"long",year:"numeric",timeZone:"Africa/Nairobi"})))];
  return <section className="content-panel timetable-page">
    <div className="exam-toolbar"><div><h2>Junior School Examination Timetable</h2><p>Scheduled examinations for Grades 7, 8 and 9 · Nairobi time</p></div><button className="secondary-button" onClick={load}>Refresh timetable</button></div>
    {error && <div className="error-message">{error}</div>}
    {loading ? <p>Loading timetable…</p> : exams.length === 0 ? <p>No Grade 7–9 examinations are currently scheduled.</p> :
      <div className="timetable-days">{days.map(day => <section className="timetable-day" key={day}><h3>{day}</h3>{exams.filter(e => new Date(e.starts_at).toLocaleDateString("en-KE", {weekday:"long",day:"numeric",month:"long",year:"numeric",timeZone:"Africa/Nairobi"})===day).sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at)).map(e=><article className="timetable-event" key={e.id}><div className="timetable-time">{new Date(e.starts_at).toLocaleTimeString("en-KE",{hour:"2-digit",minute:"2-digit",timeZone:"Africa/Nairobi"})}<span>to</span>{new Date(e.ends_at).toLocaleTimeString("en-KE",{hour:"2-digit",minute:"2-digit",timeZone:"Africa/Nairobi"})}</div><div><strong>{e.title}</strong><p>{e.class_name} · {e.subject}</p></div><span className={`exam-status status-${e.status}`}>{e.status.replace("_"," ")}</span></article>)}</section>)}</div>}
  </section>;
}
export default ExamTimetable;
