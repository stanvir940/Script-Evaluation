import { Router, Response } from "express";
import { z } from "zod";
import { Types } from "mongoose";
import {
  authenticate,
  authorize,
  AuthRequest,
} from "../../middleware/auth.middleware";
import { validateBody } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../middleware/error-handler.middleware";
import { writeAuditFromRequest } from "../../lib/audit";
import { Student, Script } from "../../models";
import { generateSCode, getNextSCodeSequence } from "../../lib/s-code";
import { savePdf } from "../../lib/storage";
import { processScript } from "../../lib/processor";
import { seedQuestionsForSession } from "../../lib/processor";

const router = Router();

const createStudentSchema = z.object({
  sessionId: z.string().min(1),
  roll: z.string().min(1),
  name: z.string().min(1),
  faculty: z.string().min(1),
  departmentId: z.string().min(1).optional(),
});

const objectIdSchema = z
  .string()
  .refine((value) => Types.ObjectId.isValid(value), "Invalid MongoDB ObjectId");

const bulkStudentSchema = z.object({
  sessionId: objectIdSchema,
  students: z
    .array(
      z.object({
        roll: z.string().min(1),
        name: z.string().min(1),
        faculty: z.string().min(1),
        departmentId: objectIdSchema,
      }),
    )
    .min(1),
});

const uploadPdfSchema = z.object({
  pdfBase64: z.string().min(1),
  filename: z.string().min(1).optional(),
});

router.get(
  "/",
  authenticate,
  authorize("SUPER_ADMIN"),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const filter: Record<string, unknown> = {};
    if (req.query.sessionId) filter.sessionId = req.query.sessionId;
    const students = await Student.find(filter).sort({ roll: 1 });
    const scripts = await Script.find({
      studentId: { $in: students.map((s) => s._id) },
    });
    const scriptByStudent = new Map(
      scripts.map((script) => [script.studentId.toString(), script]),
    );

    res.json({
      success: true,
      data: students.map((s) => {
        const script = scriptByStudent.get(s._id.toString());
        return {
          id: s._id.toString(),
          sessionId: s.sessionId.toString(),
          roll: s.roll,
          name: s.name,
          faculty: s.faculty,
          departmentId: s.departmentId.toString(),
          sCode: s.sCode,
          processingStatus: s.processingStatus,
          scriptId: script?._id.toString(),
          scriptStatus: script?.processingStatus,
          scriptUrl: script?.originalPdfUrl,
        };
      }),
    });
  }),
);

router.post(
  "/",
  authenticate,
  authorize("SUPER_ADMIN"),
  validateBody(createStudentSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    // Auto-generate department ID if not provided
    let { departmentId } = req.body;
    if (!departmentId) {
      const { Department } = await import("../../models");
      const dept = await Department.findOne({ isActive: true });
      if (!dept) {
        res
          .status(400)
          .json({ success: false, error: "No active departments found" });
        return;
      }
      departmentId = dept._id.toString();
    }

    const seq = await getNextSCodeSequence(req.body.sessionId);
    const sCode = await generateSCode(req.body.sessionId, seq);
    const student = await Student.create({
      ...req.body,
      departmentId,
      sCode,
    });
    await seedQuestionsForSession(req.body.sessionId);
    await writeAuditFromRequest(
      req,
      "STUDENT_CREATED",
      "Student",
      student._id.toString(),
      undefined,
      { sCode },
    );
    res
      .status(201)
      .json({ success: true, data: { id: student._id.toString(), sCode } });
  }),
);

router.post(
  "/bulk",
  authenticate,
  authorize("SUPER_ADMIN"),
  validateBody(bulkStudentSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { sessionId, students } = req.body;
    const duplicateRolls = new Set<string>();
    const seenRolls = new Set<string>();

    for (const row of students) {
      const normalizedRoll = row.roll.trim();
      if (seenRolls.has(normalizedRoll)) duplicateRolls.add(normalizedRoll);
      seenRolls.add(normalizedRoll);
    }

    if (duplicateRolls.size > 0) {
      res.status(409).json({
        success: false,
        error: `Duplicate rolls in upload: ${Array.from(duplicateRolls).join(", ")}`,
      });
      return;
    }

    const existing = await Student.find({
      sessionId: new Types.ObjectId(sessionId),
      roll: { $in: Array.from(seenRolls) },
    }).select("roll");

    if (existing.length > 0) {
      res.status(409).json({
        success: false,
        error: `Students already exist: ${existing.map((s) => s.roll).join(", ")}`,
      });
      return;
    }

    await seedQuestionsForSession(sessionId);
    const created = [];

    for (const row of students) {
      const seq = await getNextSCodeSequence(sessionId);
      const sCode = await generateSCode(sessionId, seq);
      const student = await Student.create({
        sessionId,
        roll: row.roll.trim(),
        name: row.name.trim(),
        faculty: row.faculty.trim(),
        departmentId: row.departmentId,
        sCode,
      });
      created.push({ id: student._id.toString(), roll: student.roll, sCode });
    }

    await writeAuditFromRequest(
      req,
      "STUDENTS_BULK_CREATED",
      "AdmissionSession",
      sessionId,
      undefined,
      {
        count: created.length,
      },
    );

    res.status(201).json({ success: true, data: created });
  }),
);

router.post(
  "/:id/upload-pdf",
  authenticate,
  authorize("SUPER_ADMIN"),
  validateBody(uploadPdfSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const student = await Student.findById(req.params.id);
    if (!student) {
      res.status(404).json({ success: false, error: "Student not found" });
      return;
    }

    const { pdfBase64, filename } = req.body;
    const buffer = Buffer.from(pdfBase64, "base64");
    if (buffer.length === 0 || buffer.subarray(0, 4).toString() !== "%PDF") {
      res
        .status(422)
        .json({ success: false, error: "Valid PDF file required" });
      return;
    }

    const stored = await savePdf(
      student.sessionId.toString(),
      buffer,
      filename || "script.pdf",
    );

    const script = await Script.findOneAndUpdate(
      { studentId: student._id },
      {
        sessionId: student.sessionId,
        studentId: student._id,
        sCode: student.sCode,
        originalPdfKey: stored.key,
        originalPdfUrl: stored.url,
        processingStatus: "QUEUED",
      },
      { upsert: true, new: true },
    );

    student.processingStatus = "QUEUED";
    await student.save();

    processScript(script._id.toString()).catch(console.error);

    await writeAuditFromRequest(
      req,
      "SCRIPT_PDF_UPLOADED",
      "Script",
      script._id.toString(),
      undefined,
      {
        studentId: student._id.toString(),
        sCode: student.sCode,
      },
    );

    res.json({
      success: true,
      data: { scriptId: script._id.toString(), status: "QUEUED" },
    });
  }),
);

export default router;
