# Completed

✅ Authentication
- API: `POST /api/v1/auth/login`
- API: `POST /api/v1/auth/refresh`
- API: `POST /api/v1/auth/logout`
- API: `GET /api/v1/auth/me`
- Collections: `users`, `refreshtokens`

✅ User Roles
- Roles: `SUPER_ADMIN`, `HEAD_EXAMINER`, `TEACHER`
- Backend: JWT role claims and `authorize(...)` middleware
- Frontend: protected routes and role-scoped navigation
- Collections: `users`

✅ Teacher CRUD
- APIs: `GET /api/v1/users`, `POST /api/v1/users`, `PATCH /api/v1/users/:id`, `DELETE /api/v1/users/:id`
- Frontend: `/admin/users`
- Collections: `users`

✅ Head Examiner CRUD

✅ Student Upload
- APIs: `GET /api/v1/students`, `POST /api/v1/students`, `POST /api/v1/students/bulk`
- Frontend: `/admin/students`
- Collections: `students`, `auditlogs`

✅ s_code Generation
- Backend: `AdmissionSession.sCodePrefix` plus per-session student sequence
- Collections: `students`, `admissionsessions`

✅ PDF Upload
- API: `POST /api/v1/students/:id/upload-pdf`
- Frontend: `/admin/students`
- Collections: `scripts`, `students`, `auditlogs`

✅ PDF Processing
- Backend: `processScript`
- Processor: FastAPI/PyMuPDF
- Collections: `scripts`, `answers`

⬜ OCR

✅ Question Segmentation
- Processor: deterministic per-question crop generation
- Collections: `answers`

⬜ Assignment Engine

⬜ Evaluation

⬜ Moderation

⬜ Result

TODO:
- Add rate limiting for authentication endpoints.
- Add login/logout audit events.
- Add XLSX import support for student uploads.
- Add server-side department/session existence checks for student uploads.
- Replace deterministic question segmentation with OpenCV/OCR-based detection.
- Add manual question crop review and correction before assignment.

Last Updated:
2026-06-26
