import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import {
  Prisma,
  ReleasePolicy,
  ReleasePolicyRule,
  ReleasePolicyEvent,
  ReleasePolicyStatus,
  ReleasePolicyEventType,
  ReleasePolicyScope,
} from '@impactra/database';
import {
  ReleasePolicyDto,
  ReleasePolicyRuleDto,
  ReleasePolicyEventDto,
} from '@impactra/shared';

@Injectable()
export class ReleasePolicyPersistenceService {
  private readonly logger = new Logger(ReleasePolicyPersistenceService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Lists all release policies for an organization, optionally filtered.
   */
  async listPolicies(
    organizationId: string,
    filters?: {
      repositoryConnectionId?: string;
      status?: ReleasePolicyStatus;
      isDefault?: boolean;
    },
  ): Promise<ReleasePolicyDto[]> {
    const where: Prisma.ReleasePolicyWhereInput = {
      organizationId,
      ...(filters?.repositoryConnectionId !== undefined && {
        repositoryConnectionId: filters.repositoryConnectionId,
      }),
      ...(filters?.status !== undefined && {
        status: filters.status,
      }),
      ...(filters?.isDefault !== undefined && {
        isDefault: filters.isDefault,
      }),
    };

    const policies = await this.databaseService.client.releasePolicy.findMany({
      where,
      include: {
        rules: {
          orderBy: [{ order: 'asc' }, { ruleKey: 'asc' }],
        },
        createdByUser: {
          select: { id: true, name: true, email: true },
        },
        activatedByUser: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
    });

    return policies.map((p) => this.mapPolicyToDto(p));
  }

  /**
   * Retrieves a single policy with rules and audit events.
   */
  async getPolicyById(
    organizationId: string,
    policyId: string,
  ): Promise<ReleasePolicyDto | null> {
    const policy = await this.databaseService.client.releasePolicy.findFirst({
      where: {
        id: policyId,
        organizationId,
      },
      include: {
        rules: {
          orderBy: [{ order: 'asc' }, { ruleKey: 'asc' }],
        },
        events: {
          orderBy: { createdAt: 'desc' },
          include: {
            actorUser: {
              select: { id: true, name: true, email: true },
            },
          },
        },
        createdByUser: {
          select: { id: true, name: true, email: true },
        },
        activatedByUser: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!policy) return null;
    return this.mapPolicyToDto(policy);
  }

  /**
   * Fetches active policies for policy resolution.
   */
  async getActivePolicies(
    organizationId: string,
    repositoryConnectionId?: string,
  ): Promise<
    (ReleasePolicy & {
      rules: ReleasePolicyRule[];
    })[]
  > {
    const where: Prisma.ReleasePolicyWhereInput = {
      organizationId,
      status: ReleasePolicyStatus.ACTIVE,
      OR: [
        { repositoryConnectionId: null }, // organization level
        ...(repositoryConnectionId
          ? [{ repositoryConnectionId }] // repository level
          : []),
      ],
    };

    return this.databaseService.client.releasePolicy.findMany({
      where,
      include: {
        rules: {
          orderBy: [{ order: 'asc' }, { ruleKey: 'asc' }],
        },
      },
      orderBy: [{ version: 'desc' }],
    });
  }

  /**
   * Computes the next deterministic version for a policy family.
   */
  async getNextVersion(
    organizationId: string,
    name: string,
    repositoryConnectionId?: string | null,
  ): Promise<number> {
    const latest = await this.databaseService.client.releasePolicy.findFirst({
      where: {
        organizationId,
        name: name.trim(),
        repositoryConnectionId: repositoryConnectionId ?? null,
      },
      orderBy: { version: 'desc' },
      select: { version: true },
    });

    return latest ? latest.version + 1 : 1;
  }

  /**
   * Creates a new DRAFT policy and records the initial CREATED event.
   */
  async createDraftPolicy(
    data: Prisma.ReleasePolicyCreateInput,
    rules: Array<Omit<Prisma.ReleasePolicyRuleCreateManyPolicyInput, 'releasePolicyId'>>,
    actorUserId: string,
  ): Promise<ReleasePolicyDto> {
    return this.databaseService.client.$transaction(async (tx) => {
      const policy = await tx.releasePolicy.create({
        data,
      });

      if (rules.length > 0) {
        await tx.releasePolicyRule.createMany({
          data: rules.map((r, idx) => ({
            releasePolicyId: policy.id,
            ruleKey: r.ruleKey || `rule_${idx + 1}`,
            ruleType: r.ruleType,
            enabled: r.enabled !== false,
            severity: r.severity ?? null,
            action: r.action,
            thresholdNumeric: r.thresholdNumeric ?? null,
            thresholdText: r.thresholdText ?? null,
            configuration: (r.configuration ?? {}) as Prisma.InputJsonValue,
            order: r.order ?? idx,
          })),
        });
      }

      await tx.releasePolicyEvent.create({
        data: {
          organizationId: policy.organizationId,
          releasePolicyId: policy.id,
          policyVersion: policy.version,
          eventType: ReleasePolicyEventType.CREATED,
          actorUserId,
          previousStatus: null,
          newStatus: ReleasePolicyStatus.DRAFT,
          changeSummary: `Created draft policy '${policy.name}' version ${policy.version} with ${rules.length} rule(s).`,
        },
      });

      const fullPolicy = await tx.releasePolicy.findUnique({
        where: { id: policy.id },
        include: {
          rules: { orderBy: [{ order: 'asc' }, { ruleKey: 'asc' }] },
          createdByUser: { select: { id: true, name: true, email: true } },
          activatedByUser: { select: { id: true, name: true, email: true } },
          events: true,
        },
      });

      return this.mapPolicyToDto(fullPolicy!);
    });
  }

  /**
   * Updates an existing DRAFT policy and its rules.
   */
  async updateDraftPolicy(
    policyId: string,
    updates: {
      name?: string;
      description?: string | null;
      repositoryConnectionId?: string | null;
      isDefault?: boolean;
      targetBranchPattern?: string | null;
    },
    rules: Array<Omit<Prisma.ReleasePolicyRuleCreateManyPolicyInput, 'releasePolicyId'>> | undefined,
    actorUserId: string,
  ): Promise<ReleasePolicyDto> {
    return this.databaseService.client.$transaction(async (tx) => {
      const existing = await tx.releasePolicy.findUnique({
        where: { id: policyId },
      });

      if (!existing) {
        throw new NotFoundException(`ReleasePolicy '${policyId}' not found.`);
      }

      const updated = await tx.releasePolicy.update({
        where: { id: policyId },
        data: {
          ...(updates.name !== undefined && { name: updates.name.trim() }),
          ...(updates.description !== undefined && { description: updates.description }),
          ...(updates.repositoryConnectionId !== undefined && {
            repositoryConnectionId: updates.repositoryConnectionId,
          }),
          ...(updates.isDefault !== undefined && { isDefault: updates.isDefault }),
          ...(updates.targetBranchPattern !== undefined && {
            targetBranchPattern: updates.targetBranchPattern,
          }),
        },
      });

      if (rules !== undefined) {
        await tx.releasePolicyRule.deleteMany({
          where: { releasePolicyId: policyId },
        });

        if (rules.length > 0) {
          await tx.releasePolicyRule.createMany({
            data: rules.map((r, idx) => ({
              releasePolicyId: policyId,
              ruleKey: r.ruleKey || `rule_${idx + 1}`,
              ruleType: r.ruleType,
              enabled: r.enabled !== false,
              severity: r.severity ?? null,
              action: r.action,
              thresholdNumeric: r.thresholdNumeric ?? null,
              thresholdText: r.thresholdText ?? null,
              configuration: (r.configuration ?? {}) as Prisma.InputJsonValue,
              order: r.order ?? idx,
            })),
          });
        }
      }

      await tx.releasePolicyEvent.create({
        data: {
          organizationId: updated.organizationId,
          releasePolicyId: updated.id,
          policyVersion: updated.version,
          eventType: ReleasePolicyEventType.UPDATED,
          actorUserId,
          previousStatus: existing.status,
          newStatus: updated.status,
          changeSummary: `Updated draft policy '${updated.name}'.`,
        },
      });

      const fullPolicy = await tx.releasePolicy.findUnique({
        where: { id: policyId },
        include: {
          rules: { orderBy: [{ order: 'asc' }, { ruleKey: 'asc' }] },
          createdByUser: { select: { id: true, name: true, email: true } },
          activatedByUser: { select: { id: true, name: true, email: true } },
          events: true,
        },
      });

      return this.mapPolicyToDto(fullPolicy!);
    });
  }

  /**
   * Atomically activates a policy and supersedes conflicting previous active policies.
   */
  async activatePolicyAtomically(
    policyId: string,
    actorUserId: string,
    conflictingPolicyIds: string[],
  ): Promise<ReleasePolicyDto> {
    return this.databaseService.client.$transaction(async (tx) => {
      const now = new Date();

      // Supersede conflicting prior active policies
      for (const priorId of conflictingPolicyIds) {
        const prior = await tx.releasePolicy.findUnique({ where: { id: priorId } });
        if (prior && prior.status === ReleasePolicyStatus.ACTIVE) {
          await tx.releasePolicy.update({
            where: { id: priorId },
            data: {
              status: ReleasePolicyStatus.SUPERSEDED,
              supersededAt: now,
            },
          });

          await tx.releasePolicyEvent.create({
            data: {
              organizationId: prior.organizationId,
              releasePolicyId: prior.id,
              policyVersion: prior.version,
              eventType: ReleasePolicyEventType.SUPERSEDED,
              actorUserId,
              previousStatus: ReleasePolicyStatus.ACTIVE,
              newStatus: ReleasePolicyStatus.SUPERSEDED,
              changeSummary: `Policy superseded by activation of policy '${policyId}'.`,
            },
          });
        }
      }

      // Activate the target policy
      const activated = await tx.releasePolicy.update({
        where: { id: policyId },
        data: {
          status: ReleasePolicyStatus.ACTIVE,
          activatedAt: now,
          activatedByUserId: actorUserId,
        },
      });

      await tx.releasePolicyEvent.create({
        data: {
          organizationId: activated.organizationId,
          releasePolicyId: activated.id,
          policyVersion: activated.version,
          eventType: ReleasePolicyEventType.ACTIVATED,
          actorUserId,
          previousStatus: ReleasePolicyStatus.DRAFT,
          newStatus: ReleasePolicyStatus.ACTIVE,
          changeSummary: `Activated policy '${activated.name}' version ${activated.version}.`,
        },
      });

      const fullPolicy = await tx.releasePolicy.findUnique({
        where: { id: policyId },
        include: {
          rules: { orderBy: [{ order: 'asc' }, { ruleKey: 'asc' }] },
          createdByUser: { select: { id: true, name: true, email: true } },
          activatedByUser: { select: { id: true, name: true, email: true } },
          events: { orderBy: { createdAt: 'desc' } },
        },
      });

      return this.mapPolicyToDto(fullPolicy!);
    });
  }

  /**
   * Archives a policy.
   */
  async archivePolicy(
    organizationId: string,
    policyId: string,
    actorUserId: string,
  ): Promise<ReleasePolicyDto> {
    return this.databaseService.client.$transaction(async (tx) => {
      const policy = await tx.releasePolicy.findFirst({
        where: { id: policyId, organizationId },
      });

      if (!policy) {
        throw new NotFoundException(`ReleasePolicy '${policyId}' not found.`);
      }

      const now = new Date();
      const archived = await tx.releasePolicy.update({
        where: { id: policyId },
        data: {
          status: ReleasePolicyStatus.ARCHIVED,
          archivedAt: now,
        },
      });

      await tx.releasePolicyEvent.create({
        data: {
          organizationId,
          releasePolicyId: policyId,
          policyVersion: policy.version,
          eventType: ReleasePolicyEventType.ARCHIVED,
          actorUserId,
          previousStatus: policy.status,
          newStatus: ReleasePolicyStatus.ARCHIVED,
          changeSummary: `Archived policy '${policy.name}' version ${policy.version}.`,
        },
      });

      const fullPolicy = await tx.releasePolicy.findUnique({
        where: { id: policyId },
        include: {
          rules: { orderBy: [{ order: 'asc' }, { ruleKey: 'asc' }] },
          createdByUser: { select: { id: true, name: true, email: true } },
          activatedByUser: { select: { id: true, name: true, email: true } },
          events: { orderBy: { createdAt: 'desc' } },
        },
      });

      return this.mapPolicyToDto(fullPolicy!);
    });
  }

  /**
   * Maps a Prisma ReleasePolicy entity to shared ReleasePolicyDto.
   */
  mapPolicyToDto(
    policy: ReleasePolicy & {
      rules?: ReleasePolicyRule[];
      events?: (ReleasePolicyEvent & {
        actorUser?: { id: string; name: string; email: string } | null;
      })[];
      createdByUser?: { id: string; name: string; email: string } | null;
      activatedByUser?: { id: string; name: string; email: string } | null;
    },
  ): ReleasePolicyDto {
    return {
      id: policy.id,
      organizationId: policy.organizationId,
      repositoryConnectionId: policy.repositoryConnectionId,
      originPolicyId: policy.originPolicyId,
      name: policy.name,
      description: policy.description,
      status: policy.status,
      version: policy.version,
      isDefault: policy.isDefault,
      targetBranchPattern: policy.targetBranchPattern,
      createdByUserId: policy.createdByUserId,
      createdByUser: policy.createdByUser ?? null,
      activatedByUserId: policy.activatedByUserId,
      activatedByUser: policy.activatedByUser ?? null,
      createdAt: policy.createdAt.toISOString(),
      updatedAt: policy.updatedAt.toISOString(),
      activatedAt: policy.activatedAt ? policy.activatedAt.toISOString() : null,
      supersededAt: policy.supersededAt ? policy.supersededAt.toISOString() : null,
      archivedAt: policy.archivedAt ? policy.archivedAt.toISOString() : null,
      rules: policy.rules?.map((r) => this.mapRuleToDto(r)),
      events: policy.events?.map((e) => this.mapEventToDto(e)),
      ruleCount: policy.rules?.length ?? 0,
    };
  }

  mapRuleToDto(rule: ReleasePolicyRule): ReleasePolicyRuleDto {
    return {
      id: rule.id,
      releasePolicyId: rule.releasePolicyId,
      ruleKey: rule.ruleKey,
      ruleType: rule.ruleType,
      enabled: rule.enabled,
      severity: rule.severity,
      action: rule.action,
      thresholdNumeric: rule.thresholdNumeric,
      thresholdText: rule.thresholdText,
      configuration: (rule.configuration as Record<string, unknown>) ?? {},
      order: rule.order,
      createdAt: rule.createdAt.toISOString(),
      updatedAt: rule.updatedAt.toISOString(),
    };
  }

  mapEventToDto(
    event: ReleasePolicyEvent & {
      actorUser?: { id: string; name: string; email: string } | null;
    },
  ): ReleasePolicyEventDto {
    return {
      id: event.id,
      organizationId: event.organizationId,
      releasePolicyId: event.releasePolicyId,
      policyVersion: event.policyVersion,
      eventType: event.eventType,
      actorUserId: event.actorUserId,
      actorUser: event.actorUser ?? null,
      previousStatus: event.previousStatus,
      newStatus: event.newStatus,
      changeSummary: event.changeSummary,
      metadataJson: (event.metadataJson as Record<string, unknown>) ?? {},
      createdAt: event.createdAt.toISOString(),
    };
  }
}
