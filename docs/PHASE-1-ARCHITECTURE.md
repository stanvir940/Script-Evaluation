# DASEMS — Phase 1 Architecture

**Digital Admission Script Evaluation & Moderation System**

Phase 1 establishes the secure foundation. No PDF processing, evaluation tasks, annotations, or moderation logic in this phase.

---

## 1. Architectural Decisions

### 1.1 Modular Monolith (Node API)

A single Express application with **feature modules** and clear boundaries. Each module owns routes → controller → service → repository. This allows later extraction of the Python processing service and queue workers without rewriting domain logic.

**Why not microservices now?** University IT teams need operable software first. A monolith reduces deployment complexity during Phases 1–4.

### 1.2 Repository / Service / Controller Pattern

| Layer | Responsibility |
|-------|----------------|
| **Controller** | HTTP I/O, status codes, call service |
| **Service** | Business rules, orchestration, audit triggers |
| **Repository** | MongoDB queries only — no business logic |
| **DTO (Zod)** | Request validation at the edge |

This enforces SOLID separation and keeps controllers thin.

### 1.3 Identity vs. Evaluation Data Separation

**Teachers must never see student PII.** Phase 1 schemas separate:

- **Admin domain:** roll, name, faculty, department (Phase 2 student upload)
- **Evaluation domain:** `s_code` only (Phase 2+)

Phase 1 creates `AdmissionSession.sCodePrefix` (e.g. `KUET-2026`) so anonymous codes can be generated consistently in Phase 2.

### 1.4 Authentication Strategy

- **Access token (JWT):** 15 minutes, stateless, carries `userId`, `role`, `employeeId`
- **Refresh token:** 7 days, stored hashed in MongoDB, revocable on logout
- **RBAC middleware:** server-side enforcement on every protected route

Passwords: bcrypt cost factor 12.

### 1.5 Frontend State Strategy

| Concern | Tool | Reason |
|---------|------|--------|
| Auth session | Redux Toolkit | Spec requirement; global, synchronous access for route guards |
| Server data | TanStack Query | Caching, refetch, mutation lifecycle for CRUD |
| Forms | React Hook Form + Zod | Phase 2+ admin forms; login uses RHF in Phase 1 |

### 1.6 Audit Log (Append-Only)

Every login, user change, and admin configuration write creates an immutable `AuditLog` record. No deletes — compliance requirement for public universities.

### 1.7 What Phase 1 Does NOT Include

- PDF upload / Cloudinary integration (Phase 2–3)
- Redis / BullMQ (Phase 3)
- Python processing service (Phase 3)
- Question bank (Phase 2)
- Evaluation tasks, annotations, Konva (Phase 4)
- Three-examiner reconciliation (Phase 5)
- Results export (Phase 6)

Existing prototype evaluation code is **removed from the active app** and will be rebuilt against Phase 1 schemas in later phases.

---

## 2. Phase 1 Folder Structure

```
dasems/
├── docs/
│   └── PHASE-1-ARCHITECTURE.md
├── packages/
│   └── shared-types/          # Cross-app TypeScript contracts
├── apps/
│   ├── api/
│   │   └── src/
│   │       ├── config/
│   │       ├── lib/             # db, errors, response helpers
│   │       ├── middleware/      # auth, rbac, validate, error-handler, audit
│   │       ├── models/          # Mongoose schemas (Phase 1 only)
│   │       ├── modules/
│   │       │   ├── auth/
│   │       │   ├── users/
│   │       │   ├── admission-exams/
│   │       │   ├── sessions/
│   │       │   ├── departments/
│   │       │   └── subjects/
│   │       ├── scripts/
│   │       │   └── seed.ts
│   │       ├── app.ts
│   │       └── index.ts
│   └── web/
│       └── src/
│           ├── app/             # store, router, providers
│           ├── features/
│           │   ├── auth/
│           │   └── admin/       # session, dept, subject shells
│           ├── shared/          # layout, ui, api client
│           └── pages/
└── docker-compose.yml           # MongoDB (+ Redis in Phase 3)
```

---

## 3. Phase 1 Database Schema

### User
`employeeId`, `email`, `passwordHash`, `name`, `role`, `subjectIds[]`, `departmentIds[]`, `isActive`, `lastLoginAt`

### Institution
University metadata: `name`, `code` (e.g. KUET)

### AdmissionExam
Top-level exam event: `name`, `institutionId`, `year`, `status`

### AdmissionSession
Evaluation cycle within an exam: `examId`, `name`, `status`, `moderationThreshold` (default 3), `sCodePrefix`, `evaluationDeadline`

### Department
`code`, `name`, `isActive`

### Subject
`code`, `name`, `departmentId?`, `isActive`

### RefreshToken
Hashed refresh tokens for revocation

### AuditLog
Append-only action log

---

## 4. Phase 1 API Surface

| Method | Endpoint | Role | Purpose |
|--------|----------|------|---------|
| POST | `/api/v1/auth/login` | Public | Login |
| POST | `/api/v1/auth/refresh` | Public | Rotate access token |
| POST | `/api/v1/auth/logout` | Auth | Revoke refresh token |
| GET | `/api/v1/auth/me` | Auth | Current user |
| GET/POST | `/api/v1/users` | SUPER_ADMIN | List/create users |
| PATCH | `/api/v1/users/:id` | SUPER_ADMIN | Update/activate/deactivate |
| GET/POST | `/api/v1/admission-exams` | SUPER_ADMIN | Manage exams |
| GET/POST | `/api/v1/sessions` | SUPER_ADMIN | Manage sessions |
| GET/POST | `/api/v1/departments` | SUPER_ADMIN | Manage departments |
| GET/POST | `/api/v1/subjects` | SUPER_ADMIN | Manage subjects |
| GET | `/api/v1/audit-logs` | SUPER_ADMIN | View audit trail |
| GET | `/health` | Public | Health check |

---

## 5. Phase 1 Frontend Screens

| Screen | Role | Status |
|--------|------|--------|
| Login | All | Functional |
| Super Admin Dashboard | SUPER_ADMIN | Shell + links to admin CRUD |
| Session Management | SUPER_ADMIN | List/create sessions |
| Department Management | SUPER_ADMIN | List/create departments |
| Subject Management | SUPER_ADMIN | List/create subjects |
| User Management | SUPER_ADMIN | List/create teachers & head examiners |
| Teacher Dashboard | TEACHER | Placeholder — Phase 4 |
| Head Examiner Dashboard | HEAD_EXAMINER | Placeholder — Phase 5 |

---

## 6. Security Checklist (Phase 1)

- [x] JWT access + refresh with revocation
- [x] RBAC on all admin routes
- [x] Zod validation on all write endpoints
- [x] Helmet + CORS
- [x] bcrypt password hashing
- [x] Audit log on auth and admin mutations
- [ ] Rate limiting (Phase 2 hardening)
- [ ] MFA for Super Admin (Phase 6 hardening)

---

## 7. Exit Criteria for Phase 1

1. Super Admin can log in and create sessions, departments, subjects, users
2. Teachers and Head Examiners can log in and see role-appropriate placeholder dashboards
3. All mutations are audit-logged
4. TypeScript builds cleanly with zero `any`
5. Seed script populates demo institution + session + admin users

**Await approval before starting Phase 2.**
