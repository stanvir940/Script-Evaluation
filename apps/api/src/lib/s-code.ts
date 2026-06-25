import { Types } from 'mongoose';
import { AdmissionSession, Student } from '../models';

export async function generateSCode(
  sessionId: string,
  sequence: number
): Promise<string> {
  const session = await AdmissionSession.findById(sessionId);
  if (!session) throw new Error('Session not found');
  return `${session.sCodePrefix}-${String(sequence).padStart(6, '0')}`;
}

export async function getNextSCodeSequence(sessionId: string): Promise<number> {
  const count = await Student.countDocuments({ sessionId: new Types.ObjectId(sessionId) });
  return count + 1;
}
