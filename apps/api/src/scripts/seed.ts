import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import { Types } from "mongoose";
import { connectDatabase, disconnectDatabase } from "../lib/db";
import mongoose from "mongoose";
import {
  User,
  Institution,
  AdmissionExam,
  AdmissionSession,
  Department,
  Subject,
  Student,
  Answer,
  Assignment,
  Evaluation,
} from "../models";
import { seedQuestionsForSession } from "../lib/processor";
import { assignTeachersToAnswer } from "../lib/reconciliation";
import { saveProcessedImage } from "../lib/storage";
import { Question } from "../models/Question";

dotenv.config();

async function createAnswerImage(
  sessionId: string,
  sCode: string,
  qNum: number,
) {
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"><rect width="800" height="400" fill="#fff"/><text x="400" y="200" text-anchor="middle" font-size="20">${sCode} - Q${qNum}</text></svg>`,
  );
  return saveProcessedImage(sessionId, sCode, qNum, svg);
}

async function seed() {
  await connectDatabase();

  console.log("Clearing database...");
  const collections = [
    "users",
    "institutions",
    "admissionexams",
    "admissionsessions",
    "departments",
    "subjects",
    "questions",
    "students",
    "scripts",
    "answers",
    "assignments",
    "evaluations",
    "annotationlayers",
    "adjudications",
    "results",
    "auditlogs",
    "refreshtokens",
  ];
  const db = mongoose.connection.db;
  if (db) {
    for (const name of collections) {
      try {
        await db.collection(name).deleteMany({});
      } catch {
        /* ignore */
      }
    }
  }

  const passwordHash = await bcrypt.hash("password123", 12);

  const institution = await Institution.create({ name: "KUET", code: "KUET" });
  const departments = await Department.insertMany([
    { code: "ENG", name: "Engineering Faculty" },
    { code: "SCI", name: "Science Faculty" },
  ]);
  const subjects = await Subject.insertMany([
    { code: "PHY", name: "Physics", departmentId: departments[0]._id },
    { code: "CHE", name: "Chemistry", departmentId: departments[0]._id },
    { code: "MAT", name: "Mathematics", departmentId: departments[0]._id },
    { code: "ENG", name: "English", departmentId: departments[1]._id },
  ]);
  const physics = subjects.find((s) => s.code === "PHY")!;

  const admin = await User.create({
    employeeId: "ADMIN001",
    name: "System Administrator",
    passwordHash,
    role: "SUPER_ADMIN",
    subjectIds: [],
    departmentIds: [],
  });

  const [headExaminer, t1, t2, t3] = await User.insertMany([
    {
      employeeId: "HEAD001",
      name: "Prof. Dr. Karim",
      passwordHash,
      role: "HEAD_EXAMINER",
      subjectIds: [],
      departmentIds: [],
    },
    {
      employeeId: "TCH001",
      name: "Dr. Rahman",
      passwordHash,
      role: "TEACHER",
      subjectIds: [physics._id],
      departmentIds: [departments[0]._id],
    },
    {
      employeeId: "TCH002",
      name: "Dr. Ahmed",
      passwordHash,
      role: "TEACHER",
      subjectIds: [physics._id],
      departmentIds: [departments[0]._id],
    },
    {
      employeeId: "TCH003",
      name: "Dr. Khan",
      passwordHash,
      role: "TEACHER",
      subjectIds: [physics._id],
      departmentIds: [departments[0]._id],
    },
  ]);

  const exam = await AdmissionExam.create({
    name: "Undergraduate Admission Test 2026",
    institutionId: institution._id,
    year: 2026,
    status: "ACTIVE",
    createdBy: admin._id,
  });

  const session = await AdmissionSession.create({
    examId: exam._id,
    name: "Admission Test Session 2026",
    status: "ACTIVE",
    moderationThreshold: 3,
    sCodePrefix: "KUET-2026",
    questionMapping: [
      {
        subjectId: subjects[0]._id,
        subjectCode: "PHY",
        startQuestion: 1,
        endQuestion: 10,
      },
      {
        subjectId: subjects[1]._id,
        subjectCode: "CHE",
        startQuestion: 11,
        endQuestion: 20,
      },
      {
        subjectId: subjects[2]._id,
        subjectCode: "MAT",
        startQuestion: 21,
        endQuestion: 30,
      },
      {
        subjectId: subjects[3]._id,
        subjectCode: "ENG",
        startQuestion: 31,
        endQuestion: 35,
      },
    ],
    createdBy: admin._id,
  });

  await seedQuestionsForSession(session._id.toString());

  // Create demo students (PII admin-only; teachers see s_code only)
  const students = [];
  for (let i = 1; i <= 5; i++) {
    const sCode = `KUET-2026-${String(i).padStart(6, "0")}`;
    students.push(
      await Student.create({
        sessionId: session._id,
        roll: `2026-${String(i).padStart(4, "0")}`,
        name: `Student ${i}`,
        faculty: "Engineering",
        departmentId: departments[0]._id,
        sCode,
        processingStatus: "READY",
      }),
    );
  }

  // Create answers for Physics Q1-Q3 only (demo subset)
  const phyQuestions = await Question.find({
    sessionId: session._id,
    subjectId: physics._id,
    questionNumber: { $lte: 3 },
  });

  for (const student of students) {
    for (const question of phyQuestions) {
      const img = await createAnswerImage(
        session._id.toString(),
        student.sCode,
        question.questionNumber,
      );
      const answer = await Answer.create({
        sessionId: session._id,
        scriptId: new Types.ObjectId(),
        studentId: student._id,
        sCode: student.sCode,
        subjectId: physics._id,
        questionId: question._id,
        questionNumber: question.questionNumber,
        maxMarks: question.maxMarks,
        imageKey: img.key,
        imageUrl: img.url,
        pageNumber: 1,
        boundingBox: { x: 0, y: 0, width: 800, height: 400 },
        resolution: { width: 800, height: 400 },
        status: "UNASSIGNED",
      });
      await assignTeachersToAnswer(answer._id, session._id, physics._id);
    }
  }

  // Pre-submit conflicting evaluations on first answer for moderation demo
  const demoAnswer = await Answer.findOne({
    sCode: students[0].sCode,
    questionNumber: 1,
  });
  if (demoAnswer) {
    const assignments = await Assignment.find({
      answerId: demoAnswer._id,
    }).sort({ slot: 1 });
    const marks = [8, 3, 7];
    for (let i = 0; i < 3; i++) {
      const a = assignments[i];
      await Evaluation.create({
        sessionId: session._id,
        assignmentId: a._id,
        answerId: demoAnswer._id,
        teacherId: a.teacherId,
        slot: a.slot,
        mark: marks[i],
        comment: `Evaluation slot ${a.slot}`,
      });
      a.status = "SUBMITTED";
      a.submittedAt = new Date();
      await a.save();
    }
    demoAnswer.evaluationCount = 3;
    demoAnswer.status = "AWAITING_RECONCILIATION";
    await demoAnswer.save();
    const { reconcileAnswer } = await import("../lib/reconciliation");
    await reconcileAnswer(demoAnswer._id);
  }

  console.log("\n✓ DASEMS full seed completed (Phases 1-6 demo data)\n");
  console.log("Credentials (password: password123):");
  console.log("  ADMIN001 | HEAD001 | TCH001 | TCH002 | TCH003");
  console.log(`\nSession ID: ${session._id.toString()}`);
  console.log(
    "5 students, Physics Q1-Q3 answers, 1 escalated case for moderation demo",
  );

  await disconnectDatabase();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
