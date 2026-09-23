import { Module, Global } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './services/password.service';
import { TokenService } from './services/token.service';
import { AuthGuard } from './guards/auth.guard';
import { SessionsModule } from '../sessions/sessions.module';
import { RateLimiterGuard } from '../common/guards/rate-limiter.guard';
import { CsrfOriginGuard } from '../common/guards/csrf-origin.guard';

@Global()
@Module({
  imports: [SessionsModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    TokenService,
    AuthGuard,
    RateLimiterGuard,
    CsrfOriginGuard,
  ],
  exports: [AuthService, PasswordService, TokenService, AuthGuard],
})
export class AuthModule {}
