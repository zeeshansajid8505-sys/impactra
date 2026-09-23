import { Module } from '@nestjs/common';
import { MembershipsController } from './memberships.controller';
import { MembershipsService } from './memberships.service';
import { TokenService } from '../auth/services/token.service';

@Module({
  controllers: [MembershipsController],
  providers: [MembershipsService, TokenService],
  exports: [MembershipsService],
})
export class MembershipsModule {}
