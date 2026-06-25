import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { Types } from 'mongoose';
import { AuthTokens } from '@dasems/shared-types';
import { config } from '../../config';
import { AppError } from '../../lib/errors';
import { JwtPayload } from '../../middleware/auth.middleware';
import { authRepository } from './auth.repository';
import { LoginDto } from './auth.dto';

function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.jwtAccessSecret, {
    expiresIn: config.jwtAccessExpiry as jwt.SignOptions['expiresIn'],
  });
}

function signRefreshToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.jwtRefreshSecret, {
    expiresIn: config.jwtRefreshExpiry as jwt.SignOptions['expiresIn'],
  });
}

export class AuthService {
  constructor(private readonly repo = authRepository) {}

  async login(dto: LoginDto): Promise<AuthTokens> {
    const user = await this.repo.findUserByEmployeeId(dto.employeeId);
    if (!user) {
      throw AppError.unauthorized('Invalid credentials');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw AppError.unauthorized('Invalid credentials');
    }

    await this.repo.updateLastLogin(user._id);

    const payload: JwtPayload = {
      userId: user._id.toString(),
      role: user.role,
      employeeId: user.employeeId,
    };

    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    await this.repo.createRefreshToken({
      userId: user._id,
      tokenHash,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    return {
      accessToken,
      refreshToken,
      user: this.repo.toAuthUser(user),
    };
  }

  async refresh(refreshToken: string): Promise<{ accessToken: string }> {
    let payload: JwtPayload;
    try {
      payload = jwt.verify(refreshToken, config.jwtRefreshSecret) as JwtPayload;
    } catch {
      throw AppError.unauthorized('Invalid refresh token');
    }

    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const stored = await this.repo.findValidRefreshToken(
      new Types.ObjectId(payload.userId),
      tokenHash
    );

    if (!stored) {
      throw AppError.unauthorized('Refresh token revoked or expired');
    }

    return { accessToken: signAccessToken(payload) };
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await this.repo.revokeRefreshToken(tokenHash);
  }

  async getMe(userId: string) {
    const user = await this.repo.findUserById(userId);
    if (!user || !user.isActive) {
      throw AppError.notFound('User not found');
    }
    return this.repo.toAuthUser(user);
  }
}

export const authService = new AuthService();
