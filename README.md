# Admission Script Evaluation System

Production-ready web application for university admission test script evaluation with triple-blind marking and head examiner adjudication.

## Stack

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, TanStack Query
- **Backend:** Node.js, Express, TypeScript, MongoDB, JWT
- **Infrastructure:** Docker Compose (MongoDB, Redis, MinIO)

## Quick Start

### Prerequisites

- Node.js 20+
- Docker & Docker Compose (for MongoDB)

### 1. Start database

```bash
docker compose up -d mongodb
```

### 2. Install dependencies

```bash
npm install
```

### 3. Seed demo data

```bash
npm run seed
```

### 4. Start development servers

```bash
npm run dev
```

- **Frontend:** http://localhost:5173
- **API:** http://localhost:4000
- **Health check:** http://localhost:4000/health

## Demo Login Credentials

Password for all accounts: `password123`

| Role | Employee ID |
|------|-------------|
| Super Admin | ADMIN001 |
| Head Examiner | HEAD001 |
| Teacher (Physics) | TCH001, TCH002, TCH003 |

## Project Structure

```
admission-script-evaluation/
├── apps/
│   ├── api/          # Express REST API
│   └── web/          # React frontend
├── packages/
│   └── shared-types/ # Shared TypeScript types
└── docker-compose.yml
```

## Key Features

- JWT authentication with role-based access control
- Teacher evaluation workspace (split-pane: rubric + answer image)
- Triple evaluation with automatic reconciliation
- Escalation to Head Examiner when mark spread > 3
- Progress dashboards for teachers, head examiners, and admins
- Keyboard shortcuts (N, S, Z, ?)
- Audit logging for evaluation submissions

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/auth/login` | Login |
| GET | `/api/v1/evaluations/next` | Get next assignment |
| POST | `/api/v1/evaluations/assignments/:id/submit` | Submit evaluation |
| GET | `/api/v1/adjudications/next` | Get next moderation case |
| POST | `/api/v1/adjudications/:id/decide` | Finalize escalated answer |
| GET | `/api/v1/dashboard/overview` | System overview |

## Environment Variables

Copy `apps/api/.env.example` to `apps/api/.env` and adjust as needed.

## Production Notes

- Change JWT secrets before deployment
- Enable HTTPS and secure cookie settings
- Configure S3/MinIO for PDF and image storage
- Add Redis-backed job queue for PDF processing pipeline
- Enable MFA for admin and head examiner accounts
