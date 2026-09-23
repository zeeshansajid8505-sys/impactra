import { Module, Global } from '@nestjs/common';
import { SessionsService } from './sessions.service';
import { TokenService } from '../auth/services/token.service';

@Global()
@Module({
  providers: [SessionsService, TokenService],
  exports: [SessionsService],
})
export class SessionsModule {}
