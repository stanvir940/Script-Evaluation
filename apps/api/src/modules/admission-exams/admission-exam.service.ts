import { AppError } from '../../lib/errors';
import { admissionExamRepository } from './admission-exam.repository';
import { CreateAdmissionExamDto } from './admission-exam.dto';

export class AdmissionExamService {
  async list() {
    const items = await admissionExamRepository.findAll();
    return items.map((e) => admissionExamRepository.toDto(e));
  }

  async create(dto: CreateAdmissionExamDto, createdBy: string) {
    try {
      const doc = await admissionExamRepository.create({ ...dto, createdBy });
      return admissionExamRepository.toDto(doc);
    } catch {
      throw AppError.conflict('Exam for this institution and year already exists');
    }
  }
}

export const admissionExamService = new AdmissionExamService();
