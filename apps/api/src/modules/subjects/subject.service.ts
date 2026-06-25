import { AppError } from '../../lib/errors';
import { subjectRepository } from './subject.repository';
import { CreateSubjectDto } from './subject.dto';

export class SubjectService {
  async list() {
    const items = await subjectRepository.findAll();
    return items.map((s) => subjectRepository.toDto(s));
  }

  async create(dto: CreateSubjectDto) {
    try {
      const doc = await subjectRepository.create(dto);
      return subjectRepository.toDto(doc);
    } catch {
      throw AppError.conflict('Subject code already exists');
    }
  }
}

export const subjectService = new SubjectService();
