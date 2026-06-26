# Phase 1

- [x] Authentication
  - APIs: `POST /api/v1/auth/login`, `POST /api/v1/auth/refresh`, `POST /api/v1/auth/logout`, `GET /api/v1/auth/me`
  - Collections: `users`, `refreshtokens`
- [x] Role Management
  - Roles: `SUPER_ADMIN`, `HEAD_EXAMINER`, `TEACHER`
  - Backend: JWT role claims, `authorize(...)` middleware, role validation in user DTOs
  - Frontend: `ProtectedRoute`, role-scoped navigation/routes
  - Collections: `users`
- [x] Teacher CRUD
  - APIs: `GET /api/v1/users`, `POST /api/v1/users`, `PATCH /api/v1/users/:id`, `DELETE /api/v1/users/:id`
  - Frontend: `/admin/users`
  - Collections: `users`

# Phase 2

- [x] Student Upload
  - APIs: `GET /api/v1/students`, `POST /api/v1/students`, `POST /api/v1/students/bulk`
  - Frontend: `/admin/students` CSV upload with session/department selectors and preview
  - Collections: `students`, `auditlogs`
- [x] s_code Generation
  - Backend: generated from `AdmissionSession.sCodePrefix` and per-session sequence
  - Collections: `students`, `admissionsessions`
- [x] PDF Upload
  - APIs: `POST /api/v1/students/:id/upload-pdf`
  - Frontend: per-student PDF upload from `/admin/students`
  - Collections: `scripts`, `students`, `auditlogs`

# Phase 3

- [x] PDF Processing
  - Backend: uploaded scripts are stored read-only, queued, and processed into answer images
  - Processor: FastAPI/PyMuPDF PDF page rendering
  - Collections: `scripts`, `answers`
- [x] Question Segmentation
  - Processor: deterministic per-question crop generation from rendered PDF pages
  - Collections: `answers`
  - TODO: replace layout-based segmentation with OpenCV/OCR detection and manual review

# Phase 4

- [x] Evaluation Task Model — `Answer` docs are created per cropped question image during processing
- [x] Automatic Assignment Engine — `assignTeachersToAnswer` balances load and assigns 3 teachers per answer
- [x] Teacher Dashboard (Dynamic) — `/evaluations/next` and teacher UI pull real tasks from MongoDB
- [x] Evaluation Submission API — `/assignments/:id/submit` persists `Evaluation` documents
- [x] Evaluation Progress Tracking — `Assignment` and `Answer.status` track per-answer progress

# Phase 5

- [x] Annotation Persistence — `AnnotationLayer` stores teacher annotations/actions
- [x] Three Examiner Logic — three evaluations per answer with reconciliation logic
- [x] Head Examiner Dashboard — `/adjudications/next` and moderation UI implemented
- [x] Moderation Workflow — `Adjudication` documents created when mark spread exceeds threshold

# Phase 6

- [x] Moderation — Head examiner can decide cases and finalize marks; adjudication completion updates `Answer` status

# Phase 7

- [x] Result Generation — finalized answers update `Result` summaries; CSV export and merit-list endpoints available

# Phase 8

- [x] OCR — processor exposes `/ocr`; `Answer.ocrText` stored during processing
- [x] AI Score Suggestion — processor `/suggest-score` returns heuristic `suggestedMark` and `confidence`; stored on `Answer` as `suggestedMark` and `suggestedConfidence`
