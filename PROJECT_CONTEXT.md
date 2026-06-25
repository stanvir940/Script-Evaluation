# PROJECT CONTEXT

## Project Name

Digital Admission Script Evaluation & Moderation System (DASEMS)

---

# Project Goal

Develop an enterprise-grade web application that digitizes the written admission examination evaluation process for universities.

The system replaces physical answer script distribution with a secure digital workflow.

Teachers evaluate scanned answer scripts using graphics tablets and stylus pens.

The system provides anonymous evaluation, automatic task assignment, multi-examiner moderation, progress tracking, audit logging, and future AI-assisted evaluation.

This project is intended for real-world deployment in universities.

Therefore, every design decision should prioritize reliability, maintainability, scalability, and usability over visual effects.

---

# Main Users

1. Super Admin
2. Head Examiner
3. Teacher / Examiner

---

# Technology Stack

Frontend

- React
- Vite
- TypeScript
- TailwindCSS
- React Router
- Redux Toolkit
- React Query
- React Hook Form
- Zod
- React Konva (annotation canvas)

Backend

- Node.js
- Express.js

Database

- MongoDB
- Mongoose

Authentication

- JWT
- Refresh Token
- Role-based Access Control

Queue

- Redis
- BullMQ

Storage

- Cloudinary

Python Service

Responsible for

- PDF Processing
- OCR
- OpenCV
- Question Detection
- Image Cropping

Communication

REST API

---

# High Level Architecture

React Frontend

↓

Node.js API

↓

MongoDB

↓

Redis Queue

↓

Python Processing Service

↓

PDF → Images → Question Detection → Question Cropping

↓

Evaluation Tasks

---

# Core Principle

The ORIGINAL uploaded PDF must NEVER be modified.

Everything else is generated from it.

---

# Document Architecture

Original PDF

↓

Read Only

↓

Question Images

↓

Annotation Layers

↓

Evaluation Metadata

---

# Student Identity

The system must never expose student identity to teachers.

Every uploaded student receives

s_code

Example

KUET-2026-000001

Teachers only see

s_code

Question

Answer

Nothing else.

Only Super Admin can map

s_code

↓

Student Name

↓

Roll

---

# Subjects

Physics

10 Questions

Chemistry

10 Questions

Mathematics

10 Questions

English

5 Questions

Every question stores

Question Number

Question Text

Model Answer

Rubric

Maximum Marks

Keywords

Difficulty

Subject

---

# Roles

## Super Admin

Responsibilities

Create Admission Session

Manage Subjects

Manage Teachers

Manage Head Examiners

Upload Student Information

Upload Answer Script PDF

Generate s_code

Monitor System

Generate Final Result

Export Excel

Export PDF

Export CSV

---

## Head Examiner

Monitor Evaluation

View Progress

Assign Teachers

Moderate Conflict Cases

Compare Teacher Evaluations

Finalize Marks

Generate Subject Result

Send Comments

Return Evaluation

---

## Teacher

Evaluate Assigned Questions

Annotate Answers

Give Marks

Write Comments

Submit Evaluation

---

# Processing Pipeline

1.

Upload Original PDF

↓

2.

Store Original

↓

3.

Create Processing Job

↓

4.

Convert PDF Pages

↓

5.

Detect Question Regions

↓

6.

Crop Question Images

↓

7.

Store Question Images

↓

8.

Generate Evaluation Tasks

↓

9.

Assign Teachers

↓

10.

Ready for Evaluation

---

# Processing Status

Every uploaded script moves through these states

UPLOADED

↓

PROCESSING

↓

QUESTION_DETECTED

↓

QUESTIONS_CROPPED

↓

TASKS_CREATED

↓

ASSIGNED

↓

UNDER_EVALUATION

↓

THREE_REVIEWS_COMPLETED

↓

MODERATION_REQUIRED (optional)

↓

FINALIZED

↓

RESULT_GENERATED

↓

ARCHIVED

---

# Evaluation Workflow

Teacher logs in.

Teacher receives ONE question at a time.

Teacher never manually selects questions.

Teacher sees

Question

Model Answer

Rubric

Student Answer

Maximum Marks

Teacher evaluates.

Teacher annotates answer.

Teacher enters marks.

Teacher submits.

System automatically loads the next assigned question.

---

# Annotation System

Teachers NEVER write directly on PDF.

Instead

Original Question Image

-

Annotation Layer

=

Rendered Evaluation

Annotation Layer stores

Teacher ID

Coordinates

Pen

Highlight

Underline

Rectangle

Arrow

Circle

Text

Color

Width

Timestamp

Pressure (future)

Each teacher owns an independent annotation layer.

Teacher A

Teacher B

Teacher C

Head Examiner

Head Examiner can compare layers.

Original image never changes.

---

# Auto Save

Auto-save every 30 seconds.

Also save after annotation changes.

Support

Undo

Redo

Version History

---

# Three Examiner Rule

Each answer is evaluated independently by

Teacher A

Teacher B

Teacher C

Teachers cannot see each other's evaluations.

After all evaluations

If

Maximum Difference <= Threshold

Final Marks = Average

Else

Moderation Required

Default Threshold

3 Marks

Threshold configurable.

---

# Head Examiner Workflow

View

Teacher A Evaluation

Teacher B Evaluation

Teacher C Evaluation

Annotations

Marks

Comments

Model Answer

Rubric

Student Answer

Head Examiner can

Approve

Override

Comment

Request Re-evaluation

Send Feedback

Finalize Marks

---

# Result Workflow

Head Examiner

↓

Subject Result

↓

Super Admin

↓

Map

s_code

↓

Student Name

↓

Roll

↓

Final Result

↓

Merit List

---

# Audit Log

Log everything

Login

Logout

Upload

Processing

Assignment

Evaluation

Moderation

Result

Annotation

Comments

Nothing is deleted.

---

# Coding Standards

Always use TypeScript.

Use Feature-Based Architecture.

Use reusable components.

Never duplicate business logic.

Use Services.

Use Controllers.

Use Repository Pattern.

Validate every request.

Return consistent API responses.

Use async/await.

Never use "any".

Use interfaces.

Use proper error handling.

Follow SOLID principles.

---

# UI Philosophy

Enterprise software.

Not startup software.

Not Dribbble.

No glassmorphism.

No unnecessary animations.

Large readable typography.

Fast.

Minimal.

Professional.

Teachers may evaluate thousands of answers.

Optimize for productivity.

---

# Future AI Features

The architecture must allow future integration of

OCR

LLM

Handwriting Recognition

Automatic Score Suggestion

Rubric Matching

Keyword Detection

AI-assisted Evaluation

without changing the existing architecture.

---

# Development Strategy

Implement incrementally.

Phase 1

Authentication

Roles

Database

Phase 2

Question Bank

Teacher Management

Student Upload

PDF Upload

Phase 3

Python Processing Service

Question Detection

Question Cropping

Phase 4

Evaluation Tasks

Teacher Dashboard

Annotation Layer

Phase 5

Three Examiner Workflow

Moderation

Head Examiner Dashboard

Phase 6

Result Generation

Analytics

Reports

Phase 7

AI Modules

OCR

Rubric Matching

Score Suggestion

Always complete one phase before moving to the next.

Never generate unnecessary features.

project-root/
│
├── PROJECT_CONTEXT.md ← Overall project vision (above)
├── DEVELOPMENT_PLAN.md ← Phase-by-phase task checklist
├── DATABASE_SCHEMA.md ← Collections, relationships, indexes
├── API_SPEC.md ← All REST endpoints
├── UI_GUIDELINES.md ← Design system and layout rules
├── CODING_STANDARDS.md ← Naming, folder structure, conventions
