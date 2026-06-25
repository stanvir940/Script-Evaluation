import { Types } from 'mongoose';
import { User, RefreshToken } from '../../models';
import { IUser } from '../../models/User';

export class AuthRepository {
  findUserByEmployeeId(employeeId: string) {
    return User.findOne({ employeeId, isActive: true });
  }

  findUserById(id: string) {
    return User.findById(id);
  }

  updateLastLogin(userId: Types.ObjectId) {
    return User.findByIdAndUpdate(userId, { lastLoginAt: new Date() });
  }

  createRefreshToken(data: { userId: Types.ObjectId; tokenHash: string; expiresAt: Date }) {
    return RefreshToken.create(data);
  }

  findValidRefreshToken(userId: Types.ObjectId, tokenHash: string) {
    return RefreshToken.findOne({
      userId,
      tokenHash,
      revokedAt: { $exists: false },
      expiresAt: { $gt: new Date() },
    });
  }

  revokeRefreshToken(tokenHash: string) {
    return RefreshToken.updateOne({ tokenHash }, { revokedAt: new Date() });
  }

  toAuthUser(user: IUser) {
    return {
      id: user._id.toString(),
      employeeId: user.employeeId,
      name: user.name,
      role: user.role,
      subjectIds: user.subjectIds.map((id) => id.toString()),
      departmentIds: user.departmentIds.map((id) => id.toString()),
    };
  }
}

export const authRepository = new AuthRepository();
