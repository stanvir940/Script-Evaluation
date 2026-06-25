import { Types } from 'mongoose';
import { Subject } from '../../models';

export class SubjectRepository {
  findAll() {
    return Subject.find().sort({ code: 1 });
  }

  create(data: { code: string; name: string; departmentId?: string }) {
    return Subject.create({
      code: data.code.toUpperCase(),
      name: data.name,
      departmentId: data.departmentId ? new Types.ObjectId(data.departmentId) : undefined,
    });
  }

  toDto(doc: {
    _id: { toString(): string };
    code: string;
    name: string;
    departmentId?: { toString(): string };
    isActive: boolean;
  }) {
    return {
      id: doc._id.toString(),
      code: doc.code,
      name: doc.name,
      departmentId: doc.departmentId?.toString(),
      isActive: doc.isActive,
    };
  }
}

export const subjectRepository = new SubjectRepository();
