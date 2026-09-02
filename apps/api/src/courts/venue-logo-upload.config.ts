import { randomUUID } from 'crypto';
import { mkdirSync } from 'fs';
import { extname, join } from 'path';
import { BadRequestException } from '@nestjs/common';
import { diskStorage } from 'multer';
import type { Request } from 'express';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { getUploadsDir } from './court-image-upload.config';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

export const venueLogoUploadOptions: MulterOptions = {
  storage: diskStorage({
    destination: (req: Request, _file, callback) => {
      const venueId = req.params.id as string;
      const dir = join(getUploadsDir(), 'venues', venueId);
      mkdirSync(dir, { recursive: true });
      callback(null, dir);
    },
    filename: (_req, file, callback) => {
      callback(null, `${randomUUID()}${extname(file.originalname)}`);
    },
  }),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      callback(new BadRequestException('Chỉ chấp nhận ảnh JPG/PNG/WEBP'), false);
      return;
    }
    callback(null, true);
  },
};
