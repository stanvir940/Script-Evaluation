import { AppError } from '../../lib/errors';
import { sessionRepository } from './session.repository';
import { CreateSessionDto } from './session.dto';

export class SessionService {
  async list() {
    const items = await sessionRepository.findAll();
    return items.map((s) => sessionRepository.toDto(s));
  }

  async create(dto: CreateSessionDto, createdBy: string) {
    try {
      const doc = await sessionRepository.create({ ...dto, createdBy });
      return sessionRepository.toDto(doc);
    } catch {
      throw AppError.conflict('Session name already exists for this exam');
    }
  }
}

export const sessionService = new SessionService();
