import prisma from './lib/prisma';

export const connectDb = (): Promise<void> =>
  prisma
    .$connect()
    .then(() => console.info('Database connected'))
    .catch((err) => {
      console.error('Database connection failed', err);
      process.exit(1);
    });
