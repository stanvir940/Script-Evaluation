import { Department } from '../../models';

export class DepartmentRepository {
  findAll() {
    return Department.find().sort({ code: 1 });
  }

  create(data: { code: string; name: string }) {
    return Department.create({ ...data, code: data.code.toUpperCase() });
  }

  toDto(doc: { _id: { toString(): string }; code: string; name: string; isActive: boolean }) {
    return { id: doc._id.toString(), code: doc.code, name: doc.name, isActive: doc.isActive };
  }
}

export const departmentRepository = new DepartmentRepository();
