import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const connectionString = process.env.NODE_ENV === 'production' ? process.env.DATABASE_URL : process.env.DATABASE_URL_TEST;
    if (!connectionString) {
      throw new Error(
        'DATABASE_URL is not set. Set it in .env or ensure DB_* vars are set so main.ts can build it.',
      );
    }
    const adapter = new PrismaPg({ connectionString });
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
