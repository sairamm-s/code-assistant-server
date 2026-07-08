import { Router } from 'express';
import { getChatHistory, sendMessage } from '../../controllers/chat.controller';
import { validate } from '../../helpers/validation.helper';
import { sendMessageValidation } from '../../validations/chat.validation';

const router = Router();

router.post('/:repositoryId/message', validate(sendMessageValidation), sendMessage);
router.get('/:repositoryId/history', getChatHistory);

export default router;
