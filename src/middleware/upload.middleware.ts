import fs from 'fs';
import multer, { FileFilterCallback } from 'multer';
import { Request } from 'express';
import { getUploadsRootDir } from '../lib/upload-storage';

const MAX_UPLOAD_SIZE_BYTES = 50 * 1024 * 1024;

fs.mkdirSync(getUploadsRootDir(), { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, getUploadsRootDir()),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});

const fileFilter = (req: Request, file: Express.Multer.File, cb: FileFilterCallback): void => {
  const isZip = file.mimetype === 'application/zip' || file.originalname.toLowerCase().endsWith('.zip');
  if (!isZip) {
    cb(new Error('Only .zip files are supported'));
    return;
  }
  cb(null, true);
};

export const uploadZipMiddleware = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_UPLOAD_SIZE_BYTES },
}).single('file');
