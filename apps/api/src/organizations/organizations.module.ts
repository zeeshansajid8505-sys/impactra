import { Module } from '@nestjs/common';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { TenantGuard } from './guards/tenant.guard';

@Module({
  controllers: [OrganizationsController],
  providers: [OrganizationsService, TenantGuard],
  exports: [OrganizationsService, TenantGuard],
})
export class OrganizationsModule {}
