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
import { savePdf, deletePdf } from "../../lib/storage";
import { processScript } from "../../lib/processor";
import { seedQuestionsForSession } from "../../lib/processor";
import {
  supabaseAdmin,
  SCRIPTS_TABLE,
  SCRIPTS_BUCKET,
} from "../../lib/supabaseAdmin";

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

const assignMobileScriptSchema = z.object({
  mobileScriptId: z.string().min(1),
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
          // Point the frontend at our own proxy route instead of the raw
          // storage URL — signed URLs expire, this link never does.
          scriptUrl: script
            ? `/api/students/${s._id.toString()}/pdf`
            : undefined,
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

// ── Stream a student's assigned script PDF through the backend ─────────────
// Why proxy instead of linking straight to storage: (1) signed URLs expire,
// so a link saved/opened later can 404 — this route re-resolves it every
// time; (2) it stays behind `authenticate`/`authorize`, so the PDF isn't
// reachable by anyone who merely has the URL if the bucket is ever made
// public or the link leaks; (3) one route works no matter which storage
// backend `savePdf` uses under the hood.
router.get(
  "/:id/pdf",
  authenticate,
  authorize("SUPER_ADMIN"),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const student = await Student.findById(req.params.id);
    if (!student) {
      res.status(404).json({ success: false, error: "Student not found" });
      return;
    }

    const script = await Script.findOne({ studentId: student._id });
    if (!script || !script.originalPdfUrl) {
      res
        .status(404)
        .json({ success: false, error: "No script uploaded for this student" });
      return;
    }

    const upstream = await fetch(script.originalPdfUrl);
    if (!upstream.ok || !upstream.body) {
      res
        .status(502)
        .json({ success: false, error: "Could not load PDF from storage" });
      return;
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${student.sCode}.pdf"`,
    );
    const contentLength = upstream.headers.get("content-length");
    if (contentLength) res.setHeader("Content-Length", contentLength);

    // Stream the response straight through rather than buffering the whole
    // file in memory first — scales fine to large scanned scripts.
    const reader = upstream.body.getReader();
    res.on("close", () => reader.cancel().catch(() => {}));
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
  }),
);

// ── Remove a student's currently assigned script (PDF + DB record) ─────────
// Lets an admin undo a bad assignment (wrong file, wrong student) and put
// the student back into a clean "no script yet" state without touching the
// mobile-scripts pending queue at all.
router.delete(
  "/:id/pdf",
  authenticate,
  authorize("SUPER_ADMIN"),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const student = await Student.findById(req.params.id);
    if (!student) {
      res.status(404).json({ success: false, error: "Student not found" });
      return;
    }

    const script = await Script.findOne({ studentId: student._id });
    if (!script) {
      res
        .status(404)
        .json({ success: false, error: "No script found for this student" });
      return;
    }

    if (script.originalPdfKey) {
      try {
        // NOTE: `deletePdf` needs to exist in lib/storage.ts and match
        // whatever backend `savePdf` writes to (S3/local/etc). Not
        // guessing at a Supabase-specific call here since this key was
        // written by savePdf, not necessarily into SCRIPTS_BUCKET.
        await deletePdf(script.originalPdfKey);
      } catch (err) {
        console.error("PDF storage cleanup failed:", err);
      }
    }

    await Script.deleteOne({ _id: script._id });

    student.processingStatus = "NOT_UPLOADED";
    await student.save();

    await writeAuditFromRequest(
      req,
      "SCRIPT_PDF_DELETED",
      "Script",
      script._id.toString(),
      undefined,
      {
        studentId: student._id.toString(),
        sCode: student.sCode,
      },
    );

    res.json({ success: true });
  }),
);

// ── List pending scripts uploaded from the mobile app (not yet assigned) ──
router.get(
  "/mobile-scripts",
  authenticate,
  authorize("SUPER_ADMIN"),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const status = (req.query.status as string) || "pending";
    const { data, error } = await supabaseAdmin
      .from(SCRIPTS_TABLE)
      .select("*")
      .eq("status", status)
      .order("created_at", { ascending: false });

    if (error) {
      res.status(500).json({ success: false, error: error.message });
      return;
    }
    res.json({ success: true, data });
  }),
);

// ── Assign a mobile-uploaded script to a specific student ──────────────────
router.post(
  "/:id/assign-mobile-script",
  authenticate,
  authorize("SUPER_ADMIN"),
  validateBody(assignMobileScriptSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const student = await Student.findById(req.params.id);
    if (!student) {
      res.status(404).json({ success: false, error: "Student not found" });
      return;
    }

    const { mobileScriptId } = req.body;
    const { data: row, error } = await supabaseAdmin
      .from(SCRIPTS_TABLE)
      .select("*")
      .eq("id", mobileScriptId)
      .single();

    if (error || !row) {
      res
        .status(404)
        .json({ success: false, error: "Mobile script not found" });
      return;
    }

    // Mobile app now only submits a single real PDF per script.
    const fileUrls: string[] = row.file_urls || [];
    if (fileUrls.length === 0) {
      res
        .status(422)
        .json({ success: false, error: "Mobile script has no file attached" });
      return;
    }

    const pdfRes = await fetch(fileUrls[0]);
    if (!pdfRes.ok) {
      res
        .status(502)
        .json({ success: false, error: "Could not fetch PDF from storage" });
      return;
    }
    const buffer = Buffer.from(await pdfRes.arrayBuffer());
    if (buffer.subarray(0, 4).toString() !== "%PDF") {
      res.status(422).json({
        success: false,
        error: "Mobile file is not a valid PDF",
      });
      return;
    }

    const stored = await savePdf(
      student.sessionId.toString(),
      buffer,
      "script.pdf",
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

    // Mark the mobile row as consumed so it drops off the pending list.
    await supabaseAdmin
      .from(SCRIPTS_TABLE)
      .update({ status: "assigned" })
      .eq("id", row.id);

    await writeAuditFromRequest(
      req,
      "MOBILE_SCRIPT_ASSIGNED",
      "Script",
      script._id.toString(),
      undefined,
      {
        studentId: student._id.toString(),
        sCode: student.sCode,
        mobileScriptId,
      },
    );

    res.json({
      success: true,
      data: { scriptId: script._id.toString(), status: "QUEUED" },
    });
  }),
);

// ── Delete a mobile-uploaded script (storage files + DB row) ───────────────
router.delete(
  "/mobile-scripts/:mobileScriptId",
  authenticate,
  authorize("SUPER_ADMIN"),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { mobileScriptId } = req.params;

    const { data: row, error: fetchError } = await supabaseAdmin
      .from(SCRIPTS_TABLE)
      .select("*")
      .eq("id", mobileScriptId)
      .single();

    if (fetchError || !row) {
      res
        .status(404)
        .json({ success: false, error: "Mobile script not found" });
      return;
    }

    const paths: string[] = row.file_paths || [];
    if (paths.length > 0) {
      const { error: storageError } = await supabaseAdmin.storage
        .from(SCRIPTS_BUCKET)
        .remove(paths);
      if (storageError) {
        console.error("Storage cleanup failed:", storageError);
      }
    }

    const { error: deleteError } = await supabaseAdmin
      .from(SCRIPTS_TABLE)
      .delete()
      .eq("id", mobileScriptId);

    if (deleteError) {
      res.status(500).json({ success: false, error: deleteError.message });
      return;
    }

    await writeAuditFromRequest(
      req,
      "MOBILE_SCRIPT_DELETED",
      "Script",
      mobileScriptId,
      undefined,
      { roll_number: row.roll_number, exam_name: row.exam_name },
    );

    res.json({ success: true });
  }),
);

export default router;
