import { NextFunction, Request, Response } from 'express';
import Joi from 'joi';
import { STATUS } from './response.helper';

export const validate = (schema: Joi.ObjectSchema) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const { error } = schema.validate(req.body);
    if (error) {
      res.status(400).json({ status: STATUS.failed, message: error.message });
      return;
    }
    next();
  };
