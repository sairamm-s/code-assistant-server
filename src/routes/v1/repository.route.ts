import { Router } from 'express';
import { getRepository, ingestRepository } from '../../controllers/repository.controller';
import { validate } from '../../helpers/validation.helper';
import { ingestRepositoryValidation } from '../../validations/repository.validation';

const router = Router();

router.post('/ingest', validate(ingestRepositoryValidation), ingestRepository);
router.get('/:id', getRepository);

export default router;
