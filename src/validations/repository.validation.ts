import Joi from 'joi';

export const ingestRepositoryValidation = Joi.object({
  source: Joi.string().valid('github').required(),
  url: Joi.string()
    .uri()
    .pattern(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?$/)
    .required()
    .messages({
      'string.pattern.base': 'url must be a valid GitHub repository URL (https://github.com/{owner}/{repo})',
    }),
});
