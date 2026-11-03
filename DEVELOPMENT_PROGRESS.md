# School Examination System – Development Progress

## Completed in this update

- Replaced the limited dashboard summary endpoint with live database aggregates for learners, active teachers, examinations, examination schedule status, submitted attempts awaiting marking, marked attempts, classes and subjects.
- Restricted the dashboard summary endpoint to the Center Admin (`admin`) role.
- Refreshed the Center Admin overview with statistic cards, examination activity, completion percentage and marking progress.
- Left `LearnerExamPortal.jsx` and `LearnerExamPortal.css` unchanged. The new dashboard styles are scoped to Center Admin overview classes.
- Added `backend/.env.example` so the project can be configured without sharing real credentials.

## Important interpretation of dashboard figures

- “Awaiting marking” counts attempts whose database status is `submitted`.
- “Marked scripts” counts attempts whose status is `marked`.
- “Completed examinations” counts exams with status `completed` or an end time in the past.
- Completion percentage is completed examinations divided by all examination records. Draft and cancelled exams remain in the denominator in this first version.

## Not yet implemented

- Integrated exam and question authoring with rich text editing.
- Teacher exam submission and Center Admin approval workflow.
- Class/subject teaching allocations and backend enforcement for exam creation.
- Timetable/calendar and conflict validation.
- Results and reports.
- Full staff profile improvements.

## Setup

1. Keep your existing PostgreSQL database and take a backup before applying future schema changes.
2. Copy `backend/.env.example` to `backend/.env`.
3. Fill in your local database credentials and generate a new random `JWT_SECRET` (at least 32 characters).
4. In `backend`, run `npm ci`, then `npm run dev`.
5. In `frontend`, run `npm ci`, then `npm run dev`.
6. Sign in with a Center Admin account and open Overview.

Never commit or share the real `.env` file. The archive intentionally excludes `.env`, `node_modules`, and build output.
