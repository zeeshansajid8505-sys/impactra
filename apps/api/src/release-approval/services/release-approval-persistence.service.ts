import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import {
  ReleaseApprovalRequest,
  ReleaseApprovalEvent,
  ReleaseSafetyAssessment,
  ChangeSet,
  ChangeRevision,
} from '@impactra/database';

export interface SafeUserSummary {
  id: string;
  name: string;
  email: string;
}

export interface ReleaseApprovalEventWithActor extends ReleaseApprovalEvent {
  actorUser?: SafeUserSummary | null;
}

export interface ReleaseApprovalRequestWithRelations
  extends ReleaseApprovalRequest {
  releaseSafetyAssessment?: ReleaseSafetyAssessment | null;
  changeSet?: ChangeSet | null;
  changeRevision?: ChangeRevision | null;
  requestedByUser?: SafeUserSummary | null;
  resolvedByUser?: SafeUserSummary | null;
  events?: ReleaseApprovalEventWithActor[];
}
import { ReleaseAuthorizationService } from './release-authorization.service';
import { hasPermission } from '../../authorization/permissions.policy';
import { Permission } from '../../authorization/permissions.enum';
import {
  ReleaseApprovalStatus,
  ReleaseApprovalResolution,
  ReleaseApprovalEventType,
  ReleaseApprovalWorkflowResponseDto,
  ReleaseApprovalDto,
  ReleaseApprovalEventDto,
  MembershipRole,
} from '@impactra/shared';

@Injectable()
export class ReleaseApprovalPersistenceService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly authorizationService: ReleaseAuthorizationService,
  ) {}

  /**
   * Retrieves the full governance workflow for a change set.
   * Scoped strictly to organizationId tenant boundary.
   */
  async findWorkflow(
    organizationId: string,
    changeSetId: string,
    user?: { id: string },
    role?: MembershipRole,
    assessmentId?: string,
  ): Promise<ReleaseApprovalWorkflowResponseDto> {
    const changeSet = await this.databaseService.client.changeSet.findFirst({
      where: {
        id: changeSetId,
        organizationId,
      },
    });

    if (!changeSet) {
      throw new NotFoundException(
        `ChangeSet '${changeSetId}' not found in organization.`,
      );
    }

    const latestAssessment = assessmentId
      ? await this.databaseService.client.releaseSafetyAssessment.findFirst({
          where: {
            id: assessmentId,
            changeSetId,
            organizationId,
            status: 'SUCCEEDED',
          },
        })
      : await this.databaseService.client.releaseSafetyAssessment.findFirst({
          where: {
            changeSetId,
            organizationId,
            status: 'SUCCEEDED',
          },
          orderBy: { createdAt: 'desc' },
        });

    if (!latestAssessment) {
      return {
        changeSetId,
        organizationId,
        assessmentId: null,
        policyDecision: null,
        riskScore: null,
        riskLevel: null,
        effectiveAuthorization:
          this.authorizationService.deriveEffectiveAuthorization(null, null),
        approvalRequest: null,
        events: [],
        canRequest: false,
        canResolve: false,
        canException: false,
      };
    }

    const requestRecord =
      await this.databaseService.client.releaseApprovalRequest.findUnique({
        where: {
          releaseSafetyAssessmentId: latestAssessment.id,
        },
        include: {
          requestedByUser: {
            select: { id: true, name: true, email: true },
          },
          resolvedByUser: {
            select: { id: true, name: true, email: true },
          },
          events: {
            include: {
              actorUser: {
                select: { id: true, name: true, email: true },
              },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
      });

    const effectiveAuthorization =
      this.authorizationService.deriveEffectiveAuthorization(
        latestAssessment.decision,
        requestRecord
          ? {
              status: requestRecord.status as ReleaseApprovalStatus,
              resolution:
                requestRecord.resolution as ReleaseApprovalResolution | null,
            }
          : null,
      );

    const isPending = requestRecord?.status === ReleaseApprovalStatus.PENDING;
    const isApproved = requestRecord?.status === ReleaseApprovalStatus.APPROVED;

    const canRequest = Boolean(
      role &&
        hasPermission(role, Permission.RELEASE_APPROVAL_REQUEST) &&
        latestAssessment.decision !== 'PASS' &&
        !isPending &&
        !isApproved,
    );

    const canResolve = Boolean(
      role &&
        hasPermission(role, Permission.RELEASE_APPROVAL_RESOLVE) &&
        isPending &&
        (!user || requestRecord.requestedByUserId !== user.id),
    );

    const canException = Boolean(
      role &&
        hasPermission(role, Permission.RELEASE_APPROVAL_EXCEPTION) &&
        (!requestRecord || isPending) &&
        latestAssessment.decision === 'BLOCKED',
    );

    return {
      changeSetId,
      organizationId,
      assessmentId: latestAssessment.id,
      policyDecision: latestAssessment.decision,
      riskScore: latestAssessment.riskScore,
      riskLevel: latestAssessment.riskLevel,
      effectiveAuthorization,
      approvalRequest: requestRecord ? this.mapRequestDto(requestRecord) : null,
      events: requestRecord?.events
        ? requestRecord.events.map((e) => this.mapEventDto(e))
        : [],
      canRequest,
      canResolve,
      canException,
    };
  }

  /**
   * Finds an approval request by ID within an organization tenant.
   */
  async findRequestById(organizationId: string, approvalId: string): Promise<ReleaseApprovalRequestWithRelations | null> {
    return this.databaseService.client.releaseApprovalRequest.findFirst({
      where: {
        id: approvalId,
        organizationId,
      },
      include: {
        releaseSafetyAssessment: true,
        changeSet: true,
        changeRevision: true,
        requestedByUser: {
          select: { id: true, name: true, email: true },
        },
        resolvedByUser: {
          select: { id: true, name: true, email: true },
        },
        events: {
          include: {
            actorUser: {
              select: { id: true, name: true, email: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  /**
   * Creates or reuses a pending approval request for a ReleaseSafetyAssessment.
   * Enforces idempotency: only one active workflow per assessment.
   */
  async createOrReuseRequest(params: {
    organizationId: string;
    repositoryConnectionId: string;
    changeSetId: string;
    changeRevisionId: string;
    releaseSafetyAssessmentId: string;
    userId: string;
    reason?: string;
  }): Promise<{ request: ReleaseApprovalRequestWithRelations; reused: boolean }> {
    const {
      organizationId,
      repositoryConnectionId,
      changeSetId,
      changeRevisionId,
      releaseSafetyAssessmentId,
      userId,
      reason,
    } = params;

    const existing =
      await this.databaseService.client.releaseApprovalRequest.findUnique({
        where: { releaseSafetyAssessmentId },
        include: {
          requestedByUser: { select: { id: true, name: true, email: true } },
          resolvedByUser: { select: { id: true, name: true, email: true } },
          events: {
            include: {
              actorUser: { select: { id: true, name: true, email: true } },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
      });

    if (existing) {
      return { request: existing, reused: true };
    }

    return this.databaseService.client.$transaction(async (tx) => {
      const created = await tx.releaseApprovalRequest.create({
        data: {
          organizationId,
          repositoryConnectionId,
          changeSetId,
          changeRevisionId,
          releaseSafetyAssessmentId,
          status: ReleaseApprovalStatus.PENDING,
          requestedByUserId: userId,
          requestedAt: new Date(),
          reason: reason || null,
        },
      });

      await tx.releaseApprovalEvent.create({
        data: {
          organizationId,
          approvalRequestId: created.id,
          eventType: ReleaseApprovalEventType.REQUESTED,
          actorUserId: userId,
          previousStatus: null,
          newStatus: ReleaseApprovalStatus.PENDING,
          reason: reason || null,
        },
      });

      const full = await tx.releaseApprovalRequest.findUnique({
        where: { id: created.id },
        include: {
          requestedByUser: { select: { id: true, name: true, email: true } },
          resolvedByUser: { select: { id: true, name: true, email: true } },
          events: {
            include: {
              actorUser: { select: { id: true, name: true, email: true } },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
      });

      return { request: full!, reused: false };
    });
  }

  /**
   * Resolves an approval request with APPROVE or REJECT.
   */
  async resolveRequest(params: {
    organizationId: string;
    approvalId: string;
    actorUserId: string;
    resolution: ReleaseApprovalResolution;
    reason: string;
  }): Promise<ReleaseApprovalRequestWithRelations | null> {
    const { organizationId, approvalId, actorUserId, resolution, reason } =
      params;

    const newStatus =
      resolution === ReleaseApprovalResolution.APPROVE
        ? ReleaseApprovalStatus.APPROVED
        : ReleaseApprovalStatus.REJECTED;

    const eventType =
      resolution === ReleaseApprovalResolution.APPROVE
        ? ReleaseApprovalEventType.APPROVED
        : ReleaseApprovalEventType.REJECTED;

    return this.databaseService.client.$transaction(async (tx) => {
      const updated = await tx.releaseApprovalRequest.update({
        where: { id: approvalId },
        data: {
          status: newStatus,
          resolution,
          reason,
          resolvedByUserId: actorUserId,
          resolvedAt: new Date(),
        },
      });

      await tx.releaseApprovalEvent.create({
        data: {
          organizationId,
          approvalRequestId: approvalId,
          eventType,
          actorUserId,
          previousStatus: ReleaseApprovalStatus.PENDING,
          newStatus,
          reason,
        },
      });

      return tx.releaseApprovalRequest.findUnique({
        where: { id: updated.id },
        include: {
          requestedByUser: { select: { id: true, name: true, email: true } },
          resolvedByUser: { select: { id: true, name: true, email: true } },
          events: {
            include: {
              actorUser: { select: { id: true, name: true, email: true } },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
      });
    });
  }

  /**
   * Grants an explicit policy exception for an approval request.
   */
  async grantException(params: {
    organizationId: string;
    approvalId: string;
    actorUserId: string;
    reason: string;
  }): Promise<ReleaseApprovalRequestWithRelations | null> {
    const { organizationId, approvalId, actorUserId, reason } = params;

    return this.databaseService.client.$transaction(async (tx) => {
      const updated = await tx.releaseApprovalRequest.update({
        where: { id: approvalId },
        data: {
          status: ReleaseApprovalStatus.APPROVED,
          resolution: ReleaseApprovalResolution.EXCEPTION,
          reason,
          exceptionGranted: true,
          exceptionReason: reason,
          resolvedByUserId: actorUserId,
          resolvedAt: new Date(),
        },
      });

      await tx.releaseApprovalEvent.create({
        data: {
          organizationId,
          approvalRequestId: approvalId,
          eventType: ReleaseApprovalEventType.EXCEPTION_GRANTED,
          actorUserId,
          previousStatus: ReleaseApprovalStatus.PENDING,
          newStatus: ReleaseApprovalStatus.APPROVED,
          reason,
        },
      });

      return tx.releaseApprovalRequest.findUnique({
        where: { id: updated.id },
        include: {
          requestedByUser: { select: { id: true, name: true, email: true } },
          resolvedByUser: { select: { id: true, name: true, email: true } },
          events: {
            include: {
              actorUser: { select: { id: true, name: true, email: true } },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
      });
    });
  }

  private mapRequestDto(record: any): ReleaseApprovalDto {
    return {
      id: record.id,
      organizationId: record.organizationId,
      repositoryConnectionId: record.repositoryConnectionId,
      changeSetId: record.changeSetId,
      changeRevisionId: record.changeRevisionId,
      releaseSafetyAssessmentId: record.releaseSafetyAssessmentId,
      status: record.status as ReleaseApprovalStatus,
      requestedByUserId: record.requestedByUserId,
      requestedByUser: record.requestedByUser,
      requestedAt: record.requestedAt.toISOString(),
      resolvedByUserId: record.resolvedByUserId,
      resolvedByUser: record.resolvedByUser,
      resolvedAt: record.resolvedAt ? record.resolvedAt.toISOString() : null,
      resolution: record.resolution as ReleaseApprovalResolution | null,
      reason: record.reason,
      exceptionGranted: record.exceptionGranted,
      exceptionReason: record.exceptionReason,
      expiresAt: record.expiresAt ? record.expiresAt.toISOString() : null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      events: record.events?.map((e: any) => this.mapEventDto(e)),
    };
  }

  private mapEventDto(record: any): ReleaseApprovalEventDto {
    return {
      id: record.id,
      organizationId: record.organizationId,
      approvalRequestId: record.approvalRequestId,
      eventType: record.eventType as ReleaseApprovalEventType,
      actorUserId: record.actorUserId,
      actorUser: record.actorUser,
      previousStatus: record.previousStatus as ReleaseApprovalStatus | null,
      newStatus: record.newStatus as ReleaseApprovalStatus,
      reason: record.reason,
      metadataJson: record.metadataJson || {},
      createdAt: record.createdAt.toISOString(),
    };
  }
}
