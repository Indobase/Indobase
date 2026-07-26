import { PostgresStore } from '@mastra/pg';

export const pStore = new PostgresStore({
  id: 'indobase-social-store',
  connectionString: process.env.DATABASE_URL!,
});
