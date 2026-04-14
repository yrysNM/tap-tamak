import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Build URL from DB_* vars if DATABASE_URL not set (e.g. for prisma generate)
const databaseUrl =
  process.env.NODE_ENV === 'production' ?
  process.env.DATABASE_URL :
  process.env.DATABASE_URL_TEST;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: databaseUrl,
  },
});
