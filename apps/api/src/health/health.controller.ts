import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { HealthService } from './health.service';
import { HealthResponse } from '@impactra/shared';

@ApiTags('Health & Readiness')
@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('health')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'API Liveness Probe',
    description:
      'Reports basic liveness of the API process. Returns uptime and basic service metadata.',
  })
  @ApiResponse({
    status: 200,
    description: 'API process is alive and operational',
    schema: {
      example: {
        status: 'ok',
        timestamp: '2026-09-20T12:00:00.000Z',
        uptime: 42.5,
        service: 'impactra-api',
        version: '0.1.0',
      },
    },
  })
  getHealth(): HealthResponse {
    return this.healthService.getLiveness();
  }

  @Get('ready')
  @ApiOperation({
    summary: 'API Readiness Probe',
    description:
      'Verifies connectivity to all required infrastructure dependencies (PostgreSQL, Redis, MinIO). Returns 200 when ready, 503 if any dependency is degraded or disconnected.',
  })
  @ApiResponse({
    status: 200,
    description: 'All core infrastructure dependencies are reachable and healthy',
    schema: {
      example: {
        status: 'ready',
        timestamp: '2026-09-20T12:00:00.000Z',
        service: 'impactra-api',
        dependencies: {
          postgres: { status: 'healthy', latencyMs: 2 },
          redis: { status: 'healthy', latencyMs: 1 },
          minio: { status: 'healthy', latencyMs: 4 },
        },
      },
    },
  })
  @ApiResponse({
    status: 503,
    description: 'One or more required infrastructure dependencies are offline',
    schema: {
      example: {
        status: 'not_ready',
        timestamp: '2026-09-20T12:00:00.000Z',
        service: 'impactra-api',
        dependencies: {
          postgres: { status: 'unhealthy', error: 'Connection refused' },
          redis: { status: 'healthy', latencyMs: 1 },
          minio: { status: 'healthy', latencyMs: 4 },
        },
      },
    },
  })
  async getReadiness(@Res() res: Response): Promise<void> {
    const { isReady, payload } = await this.healthService.getReadiness();
    const statusCode = isReady
      ? HttpStatus.OK
      : HttpStatus.SERVICE_UNAVAILABLE;

    res.status(statusCode).json(payload);
  }
}
