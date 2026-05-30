import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import configuration from './config/configuration';
import { PrismaModule } from './core/database/prisma.module';
import { AuthModule } from './core/auth/auth.module';
import { OrderModule } from './modules/order/order.module';
import { CookLeadModule } from './modules/cook-lead/cook-lead.module';
import { CookModule } from './modules/cook/cook.module';
import { GalleryModule } from './modules/gallery/gallery.module';
import { DishesModule } from './modules/dishes/dishes.module';
import { MenusModule } from './modules/menus/menus.module';
import { BasketModule } from './modules/basket/basket.module';
import { StatsModule } from './modules/stats/stats.module';
import { UsersModule } from './modules/users/users.module';
import { StorageModule } from './core/storage/storage.module';
import { JwtAuthGuard } from './core/auth/guards/jwt-auth.guard';
import { RolesGuard } from './core/auth/guards/roles.guard';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { CorsInterceptor } from './common/interceptors/cors.interceptor';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    PrismaModule,
    AuthModule,
    OrderModule,
    CookLeadModule,
    StorageModule,
    CookModule,
    GalleryModule,
    DishesModule,
    MenusModule,
    BasketModule,
    StatsModule,
    UsersModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformInterceptor,
    },
    // {
    //   provide: APP_INTERCEPTOR,
    //   useClass: CorsInterceptor,
    // },
  ],
})
export class AppModule {}
