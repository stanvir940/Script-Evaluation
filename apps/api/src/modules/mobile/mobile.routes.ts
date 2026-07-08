/**
 * mobile.routes.ts
 * Location: apps/api/src/modules/mobile/mobile.routes.ts
 *
 * Mount in apps/api/src/app.ts:
 *   import mobileRouter from "./modules/mobile/mobile.routes";
 *   app.use("/api/mobile", mobileRouter);
 *
 *   cd apps/api && npm install multer && npm install -D @types/multer
 */

import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { authenticate } from "../../middleware/auth.middleware";
import { Script, Student, AdmissionSession } from "../../models";
import { asyncHandler } from "../../middleware/error-handler.middleware";

const router = Router();

// ── Multer: save PDF to uploads/mobile-inbox/ ─────────────────────────────────
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dir = path.join(process.cwd(), "uploads", "mobile-inbox");
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, "_");
      cb(null, `${Date.now()}-${safe}`);
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) =>
    file.mimetype === "application/pdf"
      ? cb(null, true)
      : cb(new Error("Only PDF files accepted.")),
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/mobile/scripts/upload
// Mobile admin sends: PDF file + rollNumber + examName
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  "/scripts/upload",
  authenticate,
  upload.single("script"),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ message: "No PDF received." });
      return;
    }

    const rollNumber = (req.body.rollNumber ?? "").trim();
    const examName = (req.body.examName ?? "").trim();

    if (!rollNumber) {
      res.status(400).json({ message: "rollNumber is required." });
      return;
    }

    const script = await Script.create({
      originalPdfKey: `mobile-inbox/${req.file.filename}`,
      processingStatus: "PENDING_ASSIGNMENT",
      uploadSource: "MOBILE",
      mobileRollNumber: rollNumber,
      mobileExamName: examName || null,
      uploadedAt: new Date(),
    });

    console.log(`[mobile] upload  id=${script._id}  roll=${rollNumber}`);
    res
      .status(201)
      .json({ scriptId: script._id, message: "Uploaded successfully." });
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/mobile/scripts/pending
// Web admin dashboard calls this to list all unassigned mobile uploads
// Returns: scriptId, rollNumber, examName, uploadedAt, pdf download link
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  "/scripts/pending",
  authenticate,
  asyncHandler(async (_req: Request, res: Response) => {
    const scripts = await Script.find({
      processingStatus: "PENDING_ASSIGNMENT",
      uploadSource: "MOBILE",
    })
      .sort({ uploadedAt: -1 })
      .lean();

    res.json({ scripts });
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/mobile/scripts/:scriptId/assign
// Web admin picks a script from the pending list and links it to a student
// Body: { studentId, sessionId }
// After this, the normal processScript() pipeline runs automatically
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  "/scripts/:scriptId/assign",
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const { studentId, sessionId } = req.body;

    if (!studentId || !sessionId) {
      res
        .status(400)
        .json({ message: "studentId and sessionId are required." });
      return;
    }

    const script = await Script.findById(req.params.scriptId);
    if (!script) {
      res.status(404).json({ message: "Script not found." });
      return;
    }
    if (script.processingStatus !== "PENDING_ASSIGNMENT") {
      res
        .status(409)
        .json({
          message: `Script already in status '${script.processingStatus}'.`,
        });
      return;
    }

    const [student, session] = await Promise.all([
      Student.findById(studentId),
      AdmissionSession.findById(sessionId),
    ]);
    if (!student) {
      res.status(404).json({ message: "Student not found." });
      return;
    }
    if (!session) {
      res.status(404).json({ message: "Session not found." });
      return;
    }

    script.studentId = student._id;
    script.sessionId = session._id;
    script.processingStatus = "QUEUED";
    await script.save();

    student.processingStatus = "QUEUED";
    await student.save();

    const { processScript } = await import("../../lib/processor");
    processScript(script._id.toString()).catch((err: Error) =>
      console.error(`[mobile/assign] processScript failed:`, err.message),
    );

    res.json({
      message: "Assigned and queued for processing.",
      scriptId: script._id,
    });
  }),
);

export default router;
