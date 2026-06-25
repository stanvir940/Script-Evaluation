import { AppError } from '../../lib/errors';
import { departmentRepository } from './department.repository';
import { CreateDepartmentDto } from './department.dto';

export class DepartmentService {
  async list() {
    const items = await departmentRepository.findAll();
    return items.map((d) => departmentRepository.toDto(d));
  }

  async create(dto: CreateDepartmentDto) {
    try {
      const doc = await departmentRepository.create(dto);
      return departmentRepository.toDto(doc);
    } catch {
      throw AppError.conflict('Department code already exists');
    }
  }
}

export const departmentService = new DepartmentService();
