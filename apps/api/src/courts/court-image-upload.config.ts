import { join } from 'path';

export function getUploadsDir(): string {
  return process.env.UPLOADS_DIR || join(process.cwd(), 'uploads');
}
