import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MunicipalPortalController } from './municipal-portal.controller';
import { MunicipalPortalService } from './municipal-portal.service';
import { UploadsModule } from '../uploads/uploads.module';

@Module({
  imports: [
    UploadsModule,
    // Même configuration exacte qu'AuthModule (même secret, même durée
    // de vie) — nécessaire pour émettre un nouveau jeton valide après
    // la rédemption d'une invitation, JwtModule n'étant pas global.
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '7d' },
      }),
    }),
  ],
  controllers: [MunicipalPortalController],
  providers: [MunicipalPortalService],
  exports: [MunicipalPortalService],
})
export class MunicipalPortalModule {}
