import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { Types } from 'mongoose';
import { AuthTokens, AuthUser } from '@ase/shared-types';
import { User, RefreshToken } from '../../models';
import { config } from '../../config';
import { JwtPayload } from '../../middleware/auth.middleware';

function toAuthUser(user: InstanceType<typeof User>): AuthUser {
  return {
    id: user._id.toString(),
    employeeId: user.employeeId,
    name: user.name,
    role: user.role,
    subjects: user.subjects.map((s: { toString: () => string }) => s.toString()),
  };
}

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

export async function login(employeeId: string, password: string): Promise<AuthTokens> {
  const user = await User.findOne({ employeeId, isActive: true });
  if (!user) {
    throw new Error('Invalid credentials');
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new Error('Invalid credentials');
  }

  user.lastLoginAt = new Date();
  await user.save();

  const payload: JwtPayload = {
    userId: user._id.toString(),
    role: user.role,
    employeeId: user.employeeId,
  };

  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await RefreshToken.create({ userId: user._id, tokenHash, expiresAt });

  return {
    accessToken,
    refreshToken,
    user: toAuthUser(user),
  };
}

export async function refresh(refreshToken: string): Promise<{ accessToken: string }> {
  let payload: JwtPayload;
  try {
    payload = jwt.verify(refreshToken, config.jwtRefreshSecret) as JwtPayload;
  } catch {
    throw new Error('Invalid refresh token');
  }

  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const stored = await RefreshToken.findOne({
    userId: new Types.ObjectId(payload.userId),
    tokenHash,
    revokedAt: { $exists: false },
    expiresAt: { $gt: new Date() },
  });

  if (!stored) {
    throw new Error('Refresh token revoked or expired');
  }

  const accessToken = signAccessToken(payload);
  return { accessToken };
}

export async function logout(refreshToken: string): Promise<void> {
  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  await RefreshToken.updateOne({ tokenHash }, { revokedAt: new Date() });
}

export async function getMe(userId: string): Promise<AuthUser | null> {
  const user = await User.findById(userId);
  if (!user || !user.isActive) return null;
  return toAuthUser(user);
}
