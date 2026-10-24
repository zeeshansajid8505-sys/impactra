import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { ReleaseApprovalPersistenceService } from './release-approval-persistence.service';
import { ReleaseAuthorizationService } from './release-authorization.service';
import { GitHubCheckPublicationService } from '../../github-checks/services/github-check-publication.service';
import {
  RequestReleaseApprovalDto,
  ResolveReleaseApprovalDto,
  GrantReleaseExceptionDto,
} from '../dto/release-approval.dto';
import {
  ReleaseApprovalStatus,
  ReleaseApprovalResolution,
  ReleaseApprovalWorkflowResponseDto,
  MembershipRole,
} from '@impactra/shared';
import { User } from '@impactra/database';

export const MAX_REASON_LENGTH = 2000;

@Injectable()
export class ReleaseApprovalService {
  private readonly logger = new Logger(ReleaseApprovalService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly persistenceService: ReleaseApprovalPersistenceService,
    private readonly authorizationService: ReleaseAuthorizationService,
    @Inject(forwardRef(() => GitHubCheckPublicationService))
    private readonly gitHubCheckPublicationService?: GitHubCheckPublicationService,
  ) {}

  /**
   * Retrieves the current governance workflow state for a change set.
   */
  async getWorkflow(
    organizationId: string,
    changeSetId: string,
    user?: User,
    role?: MembershipRole,
    assessmentId?: string,
  ): Promise<ReleaseApprovalWorkflowResponseDto> {
    return this.persistenceService.findWorkflow(
      organizationId,
      changeSetId,
      user,
      role,
      assessmentId,
    );
  }

  /**
   * Requests an explicit release approval for a completed ReleaseSafetyAssessment.
   */
  async requestApproval(
    organizationId: string,
    changeSetId: string,
    user: User,
    dto: RequestReleaseApprovalDto,
  ): Promise<ReleaseApprovalWorkflowResponseDto> {
    const changeSet = await this.databaseService.client.changeSet.findFirst({
      where: {
        id: changeSetId,
        organizationId,
      },
      include: {
        repositoryConnection: true,
      },
    });

    if (!changeSet) {
      throw new NotFoundException({
        code: 'CHANGE_SET_NOT_FOUND',
        message: `ChangeSet '${changeSetId}' not found in organization.`,
      });
    }

    // Resolve target assessment
    let targetAssessmentId = dto.assessmentId;
    if (!targetAssessmentId) {
      const latest =
        await this.databaseService.client.releaseSafetyAssessment.findFirst({
          where: {
            changeSetId,
            organizationId,
            status: 'SUCCEEDED',
          },
          orderBy: { createdAt: 'desc' },
        });

      if (!latest) {
        throw new BadRequestException({
          code: 'RELEASE_SAFETY_ASSESSMENT_NOT_SUCCEEDED',
          message:
            'A succeeded Release Safety Assessment is required before requesting release approval.',
        });
      }
      targetAssessmentId = latest.id;
    }

    const assessment =
      await this.databaseService.client.releaseSafetyAssessment.findFirst({
        where: {
          id: targetAssessmentId,
          organizationId,
          changeSetId,
        },
        include: {
          changeRevision: true,
        },
      });

    if (!assessment) {
      throw new NotFoundException({
        code: 'RELEASE_SAFETY_ASSESSMENT_NOT_FOUND',
        message: `ReleaseSafetyAssessment '${targetAssessmentId}' not found.`,
      });
    }

    if (assessment.status !== 'SUCCEEDED') {
      throw new BadRequestException({
        code: 'RELEASE_SAFETY_ASSESSMENT_NOT_SUCCEEDED',
        message: `Release Safety Assessment is not completed (status: ${assessment.status}). Cannot request approval.`,
      });
    }

    // Invariant: PASS does not require human approval
    if (assessment.decision === 'PASS') {
      throw new BadRequestException({
        code: 'RELEASE_APPROVAL_NOT_REQUIRED',
        message:
          'Release Safety policy decision is PASS. Explicit approval is not required.',
      });
    }

    // Validate reason if present
    const sanitizedReason = dto.reason ? dto.reason.trim() : undefined;
    if (sanitizedReason && sanitizedReason.length > MAX_REASON_LENGTH) {
      throw new BadRequestException({
        code: 'RELEASE_APPROVAL_REASON_TOO_LONG',
        message: `Approval request reason cannot exceed ${MAX_REASON_LENGTH} characters.`,
      });
    }

    const { request, reused } =
      await this.persistenceService.createOrReuseRequest({
        organizationId,
        repositoryConnectionId: changeSet.repositoryConnectionId,
        changeSetId,
        changeRevisionId: assessment.changeRevisionId,
        releaseSafetyAssessmentId: assessment.id,
        userId: user.id,
        reason: sanitizedReason,
      });

    this.logger.log(
      `Approval request ${reused ? 'reused' : 'created'} '${request.id}' for assessment '${assessment.id}' by user '${user.id}'.`,
    );

    // Asynchronously refresh GitHub Check publication
    this.triggerCheckRefresh(organizationId, changeSetId, assessment.id);

    return this.persistenceService.findWorkflow(
      organizationId,
      changeSetId,
      user,
      undefined,
      assessment.id,
    );
  }

  /**
   * Approves a pending release approval request.
   */
  async approve(
    organizationId: string,
    changeSetId: string,
    approvalId: string,
    user: User,
    dto: ResolveReleaseApprovalDto,
  ): Promise<ReleaseApprovalWorkflowResponseDto> {
    const reason = this.validateReason(dto.reason);

    const request = await this.findAndValidateRequest(
      organizationId,
      changeSetId,
      approvalId,
    );

    if (request.status !== ReleaseApprovalStatus.PENDING) {
      throw new ConflictException({
        code: 'RELEASE_APPROVAL_ALREADY_RESOLVED',
        message: `Release approval request '${approvalId}' is already resolved (status: ${request.status}).`,
      });
    }

    // Self-approval safety: requester cannot approve their own release
    if (request.requestedByUserId === user.id) {
      throw new ForbiddenException({
        code: 'SELF_APPROVAL_NOT_ALLOWED',
        message:
          'Self-approval is not allowed. A different authorized user must approve this release.',
      });
    }

    // Invariant: BLOCKED releases cannot be approved normally
    if (request.releaseSafetyAssessment?.decision === 'BLOCKED') {
      throw new BadRequestException({
        code: 'RELEASE_BLOCKED',
        message:
          'Cannot approve a BLOCKED release. A policy exception must be granted by an authorized administrator.',
      });
    }

    await this.persistenceService.resolveRequest({
      organizationId,
      approvalId: request.id,
      actorUserId: user.id,
      resolution: ReleaseApprovalResolution.APPROVE,
      reason,
    });

    this.logger.log(
      `Approval request '${request.id}' APPROVED by user '${user.id}'.`,
    );

    this.triggerCheckRefresh(
      organizationId,
      changeSetId,
      request.releaseSafetyAssessmentId,
    );

    return this.persistenceService.findWorkflow(
      organizationId,
      changeSetId,
      user,
      undefined,
      request.releaseSafetyAssessmentId,
    );
  }

  /**
   * Rejects a pending release approval request.
   */
  async reject(
    organizationId: string,
    changeSetId: string,
    approvalId: string,
    user: User,
    dto: ResolveReleaseApprovalDto,
  ): Promise<ReleaseApprovalWorkflowResponseDto> {
    const reason = this.validateReason(dto.reason);

    const request = await this.findAndValidateRequest(
      organizationId,
      changeSetId,
      approvalId,
    );

    if (request.status !== ReleaseApprovalStatus.PENDING) {
      throw new ConflictException({
        code: 'RELEASE_APPROVAL_ALREADY_RESOLVED',
        message: `Release approval request '${approvalId}' is already resolved (status: ${request.status}).`,
      });
    }

    await this.persistenceService.resolveRequest({
      organizationId,
      approvalId: request.id,
      actorUserId: user.id,
      resolution: ReleaseApprovalResolution.REJECT,
      reason,
    });

    this.logger.log(
      `Approval request '${request.id}' REJECTED by user '${user.id}'.`,
    );

    this.triggerCheckRefresh(
      organizationId,
      changeSetId,
      request.releaseSafetyAssessmentId,
    );

    return this.persistenceService.findWorkflow(
      organizationId,
      changeSetId,
      user,
      undefined,
      request.releaseSafetyAssessmentId,
    );
  }

  /**
   * Grants an explicit policy exception for an assessment/request.
   */
  async grantException(
    organizationId: string,
    changeSetId: string,
    approvalId: string,
    user: User,
    dto: GrantReleaseExceptionDto,
  ): Promise<ReleaseApprovalWorkflowResponseDto> {
    const reason = this.validateReason(dto.reason);

    let request = await this.persistenceService.findRequestById(
      organizationId,
      approvalId,
    );

    // If approvalId is 'latest' or not yet created for a BLOCKED change set, find or create
    if (!request && (approvalId === 'latest' || approvalId === changeSetId)) {
      const latestAssessment =
        await this.databaseService.client.releaseSafetyAssessment.findFirst({
          where: {
            changeSetId,
            organizationId,
            status: 'SUCCEEDED',
          },
          orderBy: { createdAt: 'desc' },
          include: { changeSet: true, changeRevision: true },
        });

      if (!latestAssessment) {
        throw new NotFoundException({
          code: 'RELEASE_SAFETY_ASSESSMENT_NOT_FOUND',
          message: 'No completed Release Safety Assessment found to grant exception for.',
        });
      }

      const { request: createdOrReused } =
        await this.persistenceService.createOrReuseRequest({
          organizationId,
          repositoryConnectionId:
            latestAssessment.changeSet.repositoryConnectionId,
          changeSetId,
          changeRevisionId: latestAssessment.changeRevisionId,
          releaseSafetyAssessmentId: latestAssessment.id,
          userId: user.id,
          reason: 'Automatic request for administrative exception workflow.',
        });

      request = await this.persistenceService.findRequestById(
        organizationId,
        createdOrReused.id,
      );
    }

    if (!request) {
      throw new NotFoundException({
        code: 'RELEASE_APPROVAL_NOT_FOUND',
        message: `Release approval request '${approvalId}' not found.`,
      });
    }

    if (request.organizationId !== organizationId) {
      throw new ForbiddenException({
        code: 'CROSS_TENANT_ACCESS_DENIED',
        message: 'Cannot access release approval across tenant boundary.',
      });
    }

    if (request.changeSetId !== changeSetId) {
      throw new NotFoundException({
        code: 'RELEASE_APPROVAL_NOT_FOUND',
        message: `Approval request '${approvalId}' does not belong to ChangeSet '${changeSetId}'.`,
      });
    }

    if (request.status !== ReleaseApprovalStatus.PENDING) {
      throw new ConflictException({
        code: 'RELEASE_APPROVAL_ALREADY_RESOLVED',
        message: `Release approval request '${approvalId}' is already resolved (status: ${request.status}).`,
      });
    }

    await this.persistenceService.grantException({
      organizationId,
      approvalId: request.id,
      actorUserId: user.id,
      reason,
    });

    this.logger.log(
      `Approval request '${request.id}' EXCEPTION GRANTED by user '${user.id}'.`,
    );

    this.triggerCheckRefresh(
      organizationId,
      changeSetId,
      request.releaseSafetyAssessmentId,
    );

    return this.persistenceService.findWorkflow(
      organizationId,
      changeSetId,
      user,
      undefined,
      request.releaseSafetyAssessmentId,
    );
  }

  private validateReason(rawReason?: string): string {
    if (!rawReason) {
      throw new BadRequestException({
        code: 'RELEASE_APPROVAL_REASON_REQUIRED',
        message: 'A non-empty reason is required for auditable governance actions.',
      });
    }

    const trimmed = rawReason.trim();
    if (trimmed.length === 0) {
      throw new BadRequestException({
        code: 'RELEASE_APPROVAL_REASON_REQUIRED',
        message: 'Reason cannot be whitespace-only.',
      });
    }

    if (trimmed.length > MAX_REASON_LENGTH) {
      throw new BadRequestException({
        code: 'RELEASE_APPROVAL_REASON_TOO_LONG',
        message: `Reason cannot exceed ${MAX_REASON_LENGTH} characters.`,
      });
    }

    return trimmed;
  }

  private async findAndValidateRequest(
    organizationId: string,
    changeSetId: string,
    approvalId: string,
  ) {
    const request = await this.persistenceService.findRequestById(
      organizationId,
      approvalId,
    );

    if (!request) {
      throw new NotFoundException({
        code: 'RELEASE_APPROVAL_NOT_FOUND',
        message: `Release approval request '${approvalId}' not found.`,
      });
    }

    if (request.organizationId !== organizationId) {
      throw new ForbiddenException({
        code: 'CROSS_TENANT_ACCESS_DENIED',
        message: 'Cannot access release approval across tenant boundary.',
      });
    }

    if (request.changeSetId !== changeSetId) {
      throw new NotFoundException({
        code: 'RELEASE_APPROVAL_NOT_FOUND',
        message: `Approval request '${approvalId}' does not belong to ChangeSet '${changeSetId}'.`,
      });
    }

    return request;
  }

  private triggerCheckRefresh(
    organizationId: string,
    changeSetId: string,
    assessmentId: string,
  ): void {
    if (!this.gitHubCheckPublicationService) {
      return;
    }

    // Asynchronously refresh GitHub Check publication without blocking the database transaction
    Promise.resolve()
      .then(() =>
        this.gitHubCheckPublicationService!.triggerPublication(
          organizationId,
          changeSetId,
          assessmentId,
        ),
      )
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Asynchronous GitHub Check refresh failed for assessment '${assessmentId}': ${msg}`,
        );
      });
  }
}
