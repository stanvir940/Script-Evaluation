import bcrypt from "bcryptjs";
import { Types } from "mongoose";
import { AppError } from "../../lib/errors";
import { userRepository } from "./user.repository";
import { CreateUserDto, UpdateUserDto } from "./user.dto";

export class UserService {
  constructor(private readonly repo = userRepository) {}

  async list() {
    const users = await this.repo.findAll();
    return users.map((u) => this.repo.toDto(u));
  }

  async create(dto: CreateUserDto) {
    const existing = await this.repo.findByEmployeeId(dto.employeeId);
    if (existing) {
      throw AppError.conflict("Employee ID already exists");
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.repo.create({
      employeeId: dto.employeeId,
      name: dto.name,
      email: dto.email,
      passwordHash,
      role: dto.role,
      subjectIds: dto.subjectIds.map((id) => new Types.ObjectId(id)),
      departmentIds: dto.departmentIds.map((id) => new Types.ObjectId(id)),
      isActive: dto.isActive ?? true,
    });

    return this.repo.toDto(user);
  }

  async update(id: string, dto: UpdateUserDto) {
    const user = await this.repo.findById(id);
    if (!user) throw AppError.notFound("User not found");

    const update: Record<string, unknown> = {};
    if (dto.name !== undefined) update.name = dto.name;
    if (dto.email !== undefined) update.email = dto.email;
    if (dto.role !== undefined) update.role = dto.role;
    if (dto.isActive !== undefined) update.isActive = dto.isActive;
    if (dto.password !== undefined) {
      update.passwordHash = await bcrypt.hash(dto.password, 12);
    }
    if (dto.subjectIds !== undefined) {
      update.subjectIds = dto.subjectIds.map((sid) => new Types.ObjectId(sid));
    }
    if (dto.departmentIds !== undefined) {
      update.departmentIds = dto.departmentIds.map(
        (did) => new Types.ObjectId(did),
      );
    }

    const updated = await this.repo.update(id, update);
    if (!updated) throw AppError.notFound("User not found");
    return this.repo.toDto(updated);
  }

  async delete(id: string) {
    const deleted = await this.repo.deleteById(id);
    if (!deleted) throw AppError.notFound("User not found");
    return deleted;
  }
}

export const userService = new UserService();
