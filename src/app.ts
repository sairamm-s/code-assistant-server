import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { STATUS } from './helpers/response.helper';
import repositoryRoute from './routes/v1/repository.route';
import chatRoute from './routes/v1/chat.route';
import logger from './lib/logger';

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

app.get('/api/v1/health', (req: Request, res: Response) => {
  res.json({ status: STATUS.success, data: { ok: true } });
});

app.use('/api/v1/repository', repositoryRoute);
app.use('/api/v1/chat', chatRoute);

app.use((req: Request, res: Response) => {
  res.status(404).json({ status: STATUS.failed, message: 'Not found' });
});

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ status: STATUS.failed, message: 'Internal server error' });
});

export default app;
