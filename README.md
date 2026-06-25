# DASEMS — Digital Admission Script Evaluation & Moderation System

Full-stack university admission script evaluation platform (Phases 1–6).

## Stack

| Layer | Technology |
|-------|------------|
| Frontend | React, Vite, TypeScript, Tailwind, Redux Toolkit, React Query, React Konva |
| Backend | Node.js, Express, MongoDB, JWT |
| Processing | Python FastAPI, PyMuPDF, Pillow |
| Queue | Redis (optional, inline fallback) |
| Storage | Local filesystem (Cloudinary-ready config) |

## Quick Start

```bash
# Start infrastructure
docker compose up -d mongodb redis

# Optional: Python processor
cd services/processor && pip install -r requirements.txt
uvicorn main:app --reload --port 5001

# Install & seed
npm install
npm run seed

# Run API + Web (+ processor if configured)
npm run dev
```

- **Web:** http://localhost:5173  
- **API:** http://localhost:4000/health  
- **Processor:** http://localhost:5001/health  

## Demo Credentials

Password: `password123`

| Role | ID |
|------|-----|
| Super Admin | ADMIN001 |
| Head Examiner | HEAD001 |
| Teacher | TCH001, TCH002, TCH003 |

After seed, copy the **Session ID** from terminal output for admin pages (Question Bank, Students, Results).

## Phase Coverage

| Phase | Features |
|-------|----------|
| 1 | Auth, RBAC, sessions, departments, subjects, users, audit |
| 2 | Question bank, student upload (s_code), PDF upload API |
| 3 | Python PDF processor, answer cropping pipeline |
| 4 | Assignment engine, teacher dashboard, evaluation + Konva annotations |
| 5 | Three-examiner reconciliation, head examiner moderation |
| 6 | Results sync, CSV export, merit list, analytics dashboard |

## Key Flows

1. **Admin** creates session → students get anonymous `s_code` (e.g. `KUET-2026-000001`)
2. **Admin** uploads PDFs → processor crops answers → 3 teachers assigned per answer
3. **Teacher** evaluates blind (s_code only) with annotation layer + marks
4. **System** auto-averages or escalates if mark spread > threshold
5. **Head Examiner** reviews escalated cases with layer comparison
6. **Admin** exports results mapping s_code → roll → marks

## Architecture

See [docs/PHASE-1-ARCHITECTURE.md](./docs/PHASE-1-ARCHITECTURE.md)
