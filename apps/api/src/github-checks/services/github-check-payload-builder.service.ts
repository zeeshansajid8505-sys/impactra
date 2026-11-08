import { Injectable, Logger } from '@nestjs/common';
import {
  ReleaseSafetyAssessment,
  ReleaseSafetySignal,
  ReleaseSafetyDecision,
  ReleaseSafetySignalSeverity,
} from '@impactra/database';
import {
  EffectiveReleaseAuthorization,
  ReleaseApprovalStatus,
  ReleaseApprovalResolution,
} from '@impactra/shared';

export const GITHUB_CHECK_NAME = 'Impactra / Release Safety';
export const MAX_SIGNALS_IN_CHECK_OUTPUT = 15;

export interface GitHubCheckWirePayload {
  name: string;
  head_sha: string;
  status: 'completed';
  conclusion: 'success' | 'action_required' | 'failure';
  completed_at: string;
  external_id: string;
  details_url?: string;
  output: {
    title: string;
    summary: string;
    text: string;
  };
}

export interface GovernancePayloadInfo {
  effectiveAuthorization: EffectiveReleaseAuthorization;
  status?: ReleaseApprovalStatus;
  resolution?: ReleaseApprovalResolution | null;
  authorizedBy?: string | null;
  reason?: string | null;
  exceptionReason?: string | null;
}

export interface BuildPayloadOptions {
  assessment: ReleaseSafetyAssessment & {
    signals?: ReleaseSafetySignal[];
  };
  repositoryConnectionId: string;
  headSha: string;
  changeSetId: string;
  appBaseUrl?: string | null;
  governance?: GovernancePayloadInfo | null;
}

const SEVERITY_RANK: Record<ReleaseSafetySignalSeverity, number> = {
  CRITICAL: 5,
  HIGH: 4,
  MEDIUM: 3,
  LOW: 2,
  INFO: 1,
};

@Injectable()
export class GitHubCheckPayloadBuilderService {
  private readonly logger = new Logger(GitHubCheckPayloadBuilderService.name);

  /**
   * Deterministically maps ReleaseSafetyDecision to GitHub Check Run conclusion.
   */
  mapDecisionToConclusion(
    decision: ReleaseSafetyDecision,
  ): 'success' | 'action_required' | 'failure' {
    switch (decision) {
      case 'PASS':
        return 'success';
      case 'REVIEW_REQUIRED':
        return 'action_required';
      case 'BLOCKED':
        return 'failure';
      default: {
        const _exhaustive: never = decision;
        throw new Error(`Unhandled ReleaseSafetyDecision: ${_exhaustive}`);
      }
    }
  }

  /**
   * Deterministically maps EffectiveReleaseAuthorization to GitHub Check Run conclusion.
   */
  mapAuthorizationToConclusion(
    authorization: EffectiveReleaseAuthorization,
  ): 'success' | 'action_required' | 'failure' {
    switch (authorization) {
      case EffectiveReleaseAuthorization.AUTO_APPROVED_BY_POLICY:
      case EffectiveReleaseAuthorization.APPROVED:
      case EffectiveReleaseAuthorization.EXCEPTION_GRANTED:
        return 'success';
      case EffectiveReleaseAuthorization.PENDING_REVIEW:
        return 'action_required';
      case EffectiveReleaseAuthorization.REJECTED:
      case EffectiveReleaseAuthorization.BLOCKED:
      default:
        return 'failure';
    }
  }

  /**
   * Builds the deterministic title for the GitHub Check output.
   */
  buildOutputTitle(
    decision: ReleaseSafetyDecision,
    effectiveAuthorization?: EffectiveReleaseAuthorization,
  ): string {
    if (effectiveAuthorization) {
      switch (effectiveAuthorization) {
        case EffectiveReleaseAuthorization.AUTO_APPROVED_BY_POLICY:
          return 'Impactra Release Safety: PASS (Auto-Approved)';
        case EffectiveReleaseAuthorization.APPROVED:
          return 'Impactra Release Safety: APPROVED (Review Completed)';
        case EffectiveReleaseAuthorization.EXCEPTION_GRANTED:
          return 'Impactra Release Safety: EXCEPTION GRANTED';
        case EffectiveReleaseAuthorization.REJECTED:
          return 'Impactra Release Safety: REJECTED';
        case EffectiveReleaseAuthorization.PENDING_REVIEW:
          return 'Impactra Release Safety: REVIEW REQUIRED (Pending Approval)';
        case EffectiveReleaseAuthorization.BLOCKED:
          return 'Impactra Release Safety: BLOCKED';
      }
    }

    switch (decision) {
      case 'PASS':
        return 'Impactra Release Safety: PASS';
      case 'REVIEW_REQUIRED':
        return 'Impactra Release Safety: REVIEW REQUIRED';
      case 'BLOCKED':
        return 'Impactra Release Safety: BLOCKED';
      default:
        return `Impactra Release Safety: ${decision}`;
    }
  }

  /**
   * Builds deterministic external_id to uniquely identify this check identity.
   */
  buildExternalId(repositoryConnectionId: string, headSha: string): string {
    return `impactra:release-safety:${repositoryConnectionId}:${headSha}`;
  }

  /**
   * Deterministically sorts signals by:
   * 1. Blocking first
   * 2. Severity descending
   * 3. ScoreDelta descending
   * 4. Rule ID ascending
   */
  sortSignals(signals: ReleaseSafetySignal[]): ReleaseSafetySignal[] {
    return [...signals].sort((a, b) => {
      if (a.blocking !== b.blocking) {
        return a.blocking ? -1 : 1;
      }
      const sevDiff = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
      if (sevDiff !== 0) return sevDiff;
      if (b.scoreDelta !== a.scoreDelta) {
        return b.scoreDelta - a.scoreDelta;
      }
      return a.ruleId.localeCompare(b.ruleId);
    });
  }

  /**
   * Builds the complete, deterministic GitHub Check Run wire payload.
   */
  buildPayload(options: BuildPayloadOptions): GitHubCheckWirePayload {
    const {
      assessment,
      repositoryConnectionId,
      headSha,
      changeSetId,
      appBaseUrl,
      governance,
    } = options;

    const conclusion = governance
      ? this.mapAuthorizationToConclusion(governance.effectiveAuthorization)
      : this.mapDecisionToConclusion(assessment.decision);

    const title = this.buildOutputTitle(
      assessment.decision,
      governance?.effectiveAuthorization,
    );
    const externalId = this.buildExternalId(repositoryConnectionId, headSha);

    const rawSnapshot = (assessment as any).policySnapshotJson;
    const snapshot = rawSnapshot && typeof rawSnapshot === 'object' ? rawSnapshot : null;
    const policyName = (snapshot?.policyName as string) || (snapshot ? 'Impactra Release Policy' : undefined);
    const policyVer = snapshot?.policyVersion !== undefined ? snapshot.policyVersion : undefined;
    const policyScope = (snapshot?.policyScope as string) || undefined;

    const summaryLines = [
      '### Impactra Release Safety Gate',
      '',
    ];

    if (policyName) {
      summaryLines.push(`- **Policy**: ${policyName}`);
    }
    if (policyVer !== undefined) {
      summaryLines.push(`- **Policy Version**: ${policyVer}`);
    }
    if (policyScope) {
      summaryLines.push(`- **Policy Scope**: ${policyScope}`);
    }

    summaryLines.push(`- **Release Decision**: ${assessment.decision}`);

    if (governance) {
      summaryLines.push(
        `- **Effective Authorization**: ${governance.effectiveAuthorization}`,
      );
      if (
        governance.effectiveAuthorization ===
        EffectiveReleaseAuthorization.EXCEPTION_GRANTED
      ) {
        summaryLines.push('- **Exception**: GRANTED');
        if (governance.authorizedBy) {
          summaryLines.push(`- **Authorized By**: ${governance.authorizedBy}`);
        }
        const reasonText =
          governance.exceptionReason ||
          governance.reason ||
          'Approved by administrative exception.';
        summaryLines.push(`- **Exception Reason**: ${reasonText}`);
      } else if (
        governance.effectiveAuthorization ===
        EffectiveReleaseAuthorization.APPROVED
      ) {
        summaryLines.push('- **Approval**: APPROVED');
        if (governance.authorizedBy) {
          summaryLines.push(`- **Approved By**: ${governance.authorizedBy}`);
        }
        if (governance.reason) {
          summaryLines.push(`- **Approval Reason**: ${governance.reason}`);
        }
      } else if (
        governance.effectiveAuthorization ===
        EffectiveReleaseAuthorization.REJECTED
      ) {
        summaryLines.push('- **Approval**: REJECTED');
        if (governance.authorizedBy) {
          summaryLines.push(`- **Rejected By**: ${governance.authorizedBy}`);
        }
        if (governance.reason) {
          summaryLines.push(`- **Rejection Reason**: ${governance.reason}`);
        }
      }
    }

    summaryLines.push(
      `- **Risk Score**: ${assessment.riskScore} / 100`,
      `- **Risk Level**: ${assessment.riskLevel}`,
      `- **Signals Evaluated**: ${assessment.signalCount}`,
      `- **Blocking Signals**: ${assessment.blockingSignalCount}`,
      `- **Review Signals**: ${assessment.reviewSignalCount}`,
      `- **Policy Version**: ${assessment.policyVersion}`,
    );

    const allSignals = assessment.signals
      ? this.sortSignals(assessment.signals)
      : [];
    const boundedSignals = allSignals.slice(0, MAX_SIGNALS_IN_CHECK_OUTPUT);

    const textLines: string[] = [];

    const snapshotObj = assessment.policySnapshotJson as Record<string, unknown> | null;
    const evalResults = Array.isArray(snapshotObj?.evaluationResults)
      ? (snapshotObj.evaluationResults as Array<{ ruleKey: string; ruleType: string; action: string; matched: boolean; reason: string }>).filter((r) => r.matched)
      : [];

    if (evalResults.length > 0) {
      textLines.push('### Matched Policy Rules', '');
      textLines.push('| Rule Key | Type | Action | Reason |');
      textLines.push('|---|---|---|---|');
      for (const pr of evalResults.slice(0, 5)) {
        textLines.push(
          '| `' + pr.ruleKey + '` | ' + pr.ruleType + ' | ' + pr.action + ' | ' + pr.reason.replace(/\|/g, '\\|') + ' |',
        );
      }
      textLines.push('');
    }

    textLines.push('### Evaluated Safety Signals', '');

    if (boundedSignals.length === 0) {
      textLines.push(
        '_Zero risk signals identified for this change revision._',
      );
    } else {
      textLines.push(
        '| Rule | Severity | Score Δ | Blocking | Review | Title |',
      );
      textLines.push('|---|---|---|---|---|---|');
      for (const sig of boundedSignals) {
        const blockingText = sig.blocking ? '⚠️ **YES**' : 'No';
        const reviewText = sig.requiresReview ? 'Yes' : 'No';
        const sanitizedTitle = sig.title.replace(/\|/g, '\\|').trim();
        textLines.push(
          `| \`${sig.ruleId}\` | ${sig.severity} | +${sig.scoreDelta} | ${blockingText} | ${reviewText} | ${sanitizedTitle} |`,
        );
      }

      if (allSignals.length > MAX_SIGNALS_IN_CHECK_OUTPUT) {
        textLines.push('');
        textLines.push(
          `*Showing ${MAX_SIGNALS_IN_CHECK_OUTPUT} of ${allSignals.length} deterministic signals.*`,
        );
      }
    }

    let detailsUrl: string | undefined;
    if (
      appBaseUrl &&
      appBaseUrl.startsWith('http') &&
      !appBaseUrl.includes('localhost') &&
      !appBaseUrl.includes('.local')
    ) {
      detailsUrl = `${appBaseUrl.replace(/\/+$/, '')}/workspace/changes/${changeSetId}`;
    }

    const payload: GitHubCheckWirePayload = {
      name: GITHUB_CHECK_NAME,
      head_sha: headSha,
      status: 'completed',
      conclusion,
      completed_at: new Date().toISOString(),
      external_id: externalId,
      output: {
        title,
        summary: summaryLines.join('\n'),
        text: textLines.join('\n'),
      },
    };

    if (detailsUrl) {
      payload.details_url = detailsUrl;
    }

    return payload;
  }
}
