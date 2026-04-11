import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Build URL from DB_* vars if DATABASE_URL not set (e.g. for prisma generate)
const databaseUrl =
  process.env.DATABASE_URL ||
  `postgresql://${process.env.DB_USERNAME ?? 'postgres'}:${encodeURIComponent(process.env.DB_PASSWORD ?? 'admin')}@${process.env.DB_HOST ?? 'localhost'}:${process.env.DB_PORT ?? '5432'}/${process.env.DB_DATABASE ?? 'tap_tamak'}`;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: databaseUrl,
  },
});
