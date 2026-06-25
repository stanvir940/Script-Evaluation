import { Router, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { authenticate, AuthRequest } from '../../middleware/auth.middleware';

const router = Router();

const PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
  <rect width="800" height="600" fill="#f5f5f5"/>
  <rect x="40" y="40" width="720" height="520" fill="#fff" stroke="#d0d0d0" stroke-width="2"/>
  <text x="400" y="280" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" fill="#4a4a4a">Student Answer Script</text>
  <text x="400" y="320" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" fill="#737373">Placeholder image for development</text>
</svg>`;

router.get('/:key', authenticate, (req: AuthRequest, res: Response) => {
  const key = decodeURIComponent(String(req.params.key));

  if (key.startsWith('placeholder/')) {
    res.setHeader('Content-Type', 'image/svg+xml');
    res.send(PLACEHOLDER_SVG.replace('Student Answer Script', key.replace('placeholder/', '')));
    return;
  }

  const uploadsDir = path.join(process.cwd(), 'uploads');
  const filePath = path.join(uploadsDir, key);

  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
    return;
  }

  res.setHeader('Content-Type', 'image/svg+xml');
  res.send(PLACEHOLDER_SVG);
});

export default router;
