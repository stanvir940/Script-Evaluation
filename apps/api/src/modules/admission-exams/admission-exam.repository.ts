import { Types } from 'mongoose';
import { AdmissionExam } from '../../models';

export class AdmissionExamRepository {
  findAll() {
    return AdmissionExam.find().sort({ year: -1 });
  }

  create(data: { name: string; institutionId: string; year: number; createdBy: string }) {
    return AdmissionExam.create({
      name: data.name,
      institutionId: new Types.ObjectId(data.institutionId),
      year: data.year,
      createdBy: new Types.ObjectId(data.createdBy),
    });
  }

  toDto(doc: {
    _id: { toString(): string };
    name: string;
    institutionId: { toString(): string };
    year: number;
    status: string;
  }) {
    return {
      id: doc._id.toString(),
      name: doc.name,
      institutionId: doc.institutionId.toString(),
      year: doc.year,
      status: doc.status,
    };
  }
}

export const admissionExamRepository = new AdmissionExamRepository();
