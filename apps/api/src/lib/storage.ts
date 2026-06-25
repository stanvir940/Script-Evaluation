import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';

const uploadsRoot = path.resolve(process.cwd(), config.uploadsDir);

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export async function saveFile(
  buffer: Buffer,
  subfolder: string,
  filename: string
): Promise<{ key: string; url: string }> {
  const dir = path.join(uploadsRoot, subfolder);
  ensureDir(dir);
  const key = `${subfolder}/${filename}`;
  const fullPath = path.join(uploadsRoot, key);
  await fs.promises.writeFile(fullPath, buffer);
  const url = `/api/v1/files/${key.split('/').map(encodeURIComponent).join('/')}`;
  return { key, url };
}

export async function savePdf(sessionId: string, buffer: Buffer, originalName: string) {
  const ext = path.extname(originalName) || '.pdf';
  const filename = `${uuidv4()}${ext}`;
  return saveFile(buffer, `pdfs/${sessionId}`, filename);
}

export function getFilePath(key: string): string {
  return path.join(uploadsRoot, key);
}

export function fileExists(key: string): boolean {
  return fs.existsSync(getFilePath(key));
}

export async function saveProcessedImage(
  sessionId: string,
  sCode: string,
  questionNumber: number,
  buffer: Buffer
): Promise<{ key: string; url: string }> {
  const filename = `${sCode.replace(/[^a-zA-Z0-9-]/g, '_')}_Q${questionNumber}.png`;
  return saveFile(buffer, `answers/${sessionId}`, filename);
}
