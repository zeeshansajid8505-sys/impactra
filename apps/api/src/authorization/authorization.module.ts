import { Module, Global } from '@nestjs/common';
import { PermissionsGuard } from './guards/permissions.guard';

@Global()
@Module({
  providers: [PermissionsGuard],
  exports: [PermissionsGuard],
})
export class AuthorizationModule {}
