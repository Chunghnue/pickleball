import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { UsersModule } from './users/users.module';
import { MailModule } from './mail/mail.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        host: config.get<string>('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5433),
        username: config.get<string>('DB_USERNAME', 'pickleball'),
        password: config.get<string>('DB_PASSWORD', 'pickleball'),
        database: config.get<string>('DB_NAME', 'pickleball'),
        autoLoadEntities: true,
        synchronize: false,
      }),
    }),
    UsersModule,
    MailModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
