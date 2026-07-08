import { Router } from 'express';
import { getRepository, ingestRepository, ingestUploadedRepository } from '../../controllers/repository.controller';
import { validate } from '../../helpers/validation.helper';
import { uploadZipMiddleware } from '../../middleware/upload.middleware';
import { ingestRepositoryValidation } from '../../validations/repository.validation';

const router = Router();

router.post('/ingest', validate(ingestRepositoryValidation), ingestRepository);
router.post('/ingest/upload', uploadZipMiddleware, ingestUploadedRepository);
router.get('/:id', getRepository);

export default router;
