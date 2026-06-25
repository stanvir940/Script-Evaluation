import { Types } from 'mongoose';
import { AdmissionSession } from '../../models';

export class SessionRepository {
  findAll() {
    return AdmissionSession.find().sort({ createdAt: -1 });
  }

  create(data: {
    examId: string;
    name: string;
    moderationThreshold: number;
    sCodePrefix: string;
    evaluationDeadline?: string;
    createdBy: string;
  }) {
    return AdmissionSession.create({
      examId: new Types.ObjectId(data.examId),
      name: data.name,
      moderationThreshold: data.moderationThreshold,
      sCodePrefix: data.sCodePrefix.toUpperCase(),
      evaluationDeadline: data.evaluationDeadline ? new Date(data.evaluationDeadline) : undefined,
      createdBy: new Types.ObjectId(data.createdBy),
    });
  }

  toDto(doc: {
    _id: { toString(): string };
    examId: { toString(): string };
    name: string;
    status: string;
    moderationThreshold: number;
    sCodePrefix: string;
    evaluationDeadline?: Date;
  }) {
    return {
      id: doc._id.toString(),
      examId: doc.examId.toString(),
      name: doc.name,
      status: doc.status,
      moderationThreshold: doc.moderationThreshold,
      sCodePrefix: doc.sCodePrefix,
      evaluationDeadline: doc.evaluationDeadline?.toISOString(),
    };
  }
}

export const sessionRepository = new SessionRepository();
