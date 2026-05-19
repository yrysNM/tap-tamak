import { execSync } from 'node:child_process';

/**
 * Applies pending Prisma migrations before the app serves traffic.
 * Production hosts often run `node dist/main.js` instead of `start:prod`.
 */
export function runMigrationsOnStartup(): void {
  if (process.env.SKIP_DB_MIGRATIONS === 'true') {
    return;
  }
  if (process.env.NODE_ENV !== 'production') {
    return;
  }

  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: process.env,
  });
}
