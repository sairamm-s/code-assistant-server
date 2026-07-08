import Joi from 'joi';

export const sendMessageValidation = Joi.object({
  message: Joi.string().trim().min(1).max(4000).required(),
});
