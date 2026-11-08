import { EffectiveReleaseAuthorization } from '@impactra/shared';
import {
  GitHubCheckPayloadBuilderService,
  GITHUB_CHECK_NAME,
  MAX_SIGNALS_IN_CHECK_OUTPUT,
} from './github-check-payload-builder.service';
import {
  ReleaseSafetyAssessment,
  ReleaseSafetySignal,
  ReleaseSafetyDecision,
  ReleaseRiskLevel,
  ReleaseSafetySignalCategory,
  ReleaseSafetySignalSeverity,
} from '@impactra/database';

describe('GitHubCheckPayloadBuilderService', () => {
  let service: GitHubCheckPayloadBuilderService;

  beforeEach(() => {
    service = new GitHubCheckPayloadBuilderService();
  });

  describe('mapDecisionToConclusion', () => {
    it('maps PASS to success', () => {
      expect(service.mapDecisionToConclusion('PASS')).toBe('success');
    });

    it('maps REVIEW_REQUIRED to action_required', () => {
      expect(service.mapDecisionToConclusion('REVIEW_REQUIRED')).toBe(
        'action_required',
      );
    });

    it('maps BLOCKED to failure', () => {
      expect(service.mapDecisionToConclusion('BLOCKED')).toBe('failure');
    });
  });

  describe('buildOutputTitle', () => {
    it('generates appropriate titles for all decisions', () => {
      expect(service.buildOutputTitle('PASS')).toBe(
        'Impactra Release Safety: PASS',
      );
      expect(service.buildOutputTitle('REVIEW_REQUIRED')).toBe(
        'Impactra Release Safety: REVIEW REQUIRED',
      );
      expect(service.buildOutputTitle('BLOCKED')).toBe(
        'Impactra Release Safety: BLOCKED',
      );
    });
  });

  describe('buildExternalId', () => {
    it('generates deterministic external ID', () => {
      const extId = service.buildExternalId('repo-123', 'commit-sha-abc');
      expect(extId).toBe('impactra:release-safety:repo-123:commit-sha-abc');
    });
  });

  describe('sortSignals', () => {
    it('sorts blocking signals first, then severity desc, scoreDelta desc, ruleId asc', () => {
      const signals: ReleaseSafetySignal[] = [
        {
          id: 'sig-1',
          organizationId: 'org-1',
          assessmentId: 'ass-1',
          ruleId: 'RULE_B',
          ruleVersion: 'v1',
          category: 'CHANGE_SIZE' as ReleaseSafetySignalCategory,
          severity: 'LOW' as ReleaseSafetySignalSeverity,
          scoreDelta: 5,
          blocking: false,
          requiresReview: false,
          title: 'Low signal B',
          description: '',
          evidenceType: 'TEST',
          evidenceReferenceId: null,
          evidenceStableKey: null,
          evidenceJson: {},
          createdAt: new Date(),
        },
        {
          id: 'sig-2',
          organizationId: 'org-1',
          assessmentId: 'ass-1',
          ruleId: 'RULE_A',
          ruleVersion: 'v1',
          category: 'CHANGE_SIZE' as ReleaseSafetySignalCategory,
          severity: 'HIGH' as ReleaseSafetySignalSeverity,
          scoreDelta: 25,
          blocking: false,
          requiresReview: true,
          title: 'High signal A',
          description: '',
          evidenceType: 'TEST',
          evidenceReferenceId: null,
          evidenceStableKey: null,
          evidenceJson: {},
          createdAt: new Date(),
        },
        {
          id: 'sig-3',
          organizationId: 'org-1',
          assessmentId: 'ass-1',
          ruleId: 'RULE_C',
          ruleVersion: 'v1',
          category: 'BLAST_RADIUS' as ReleaseSafetySignalCategory,
          severity: 'MEDIUM' as ReleaseSafetySignalSeverity,
          scoreDelta: 10,
          blocking: true,
          requiresReview: true,
          title: 'Blocking signal C',
          description: '',
          evidenceType: 'TEST',
          evidenceReferenceId: null,
          evidenceStableKey: null,
          evidenceJson: {},
          createdAt: new Date(),
        },
      ];

      const sorted = service.sortSignals(signals);
      expect(sorted[0].id).toBe('sig-3'); // blocking
      expect(sorted[1].id).toBe('sig-2'); // HIGH severity
      expect(sorted[2].id).toBe('sig-1'); // LOW severity
    });
  });

  describe('buildPayload', () => {
    const baseAssessment: ReleaseSafetyAssessment = {
      id: 'ass-123',
      organizationId: 'org-1',
      changeSetId: 'cs-1',
      changeRevisionId: 'rev-1',
      blastRadiusAnalysisId: 'blast-1',
      status: 'SUCCEEDED',
      policyVersion: 'impactra-release-safety-v1',
      riskScore: 65,
      riskLevel: 'HIGH' as ReleaseRiskLevel,
      decision: 'REVIEW_REQUIRED' as ReleaseSafetyDecision,
      signalCount: 2,
      blockingSignalCount: 0,
      reviewSignalCount: 1,
      startedAt: new Date(),
      completedAt: new Date(),
      failedAt: null,
      failureCode: null,
      failureMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('builds a valid wire payload for REVIEW_REQUIRED', () => {
      const signals: ReleaseSafetySignal[] = [
        {
          id: 'sig-1',
          organizationId: 'org-1',
          assessmentId: 'ass-123',
          ruleId: 'RS_RULE_LARGE_CHANGE',
          ruleVersion: 'v1',
          category: 'CHANGE_SIZE' as ReleaseSafetySignalCategory,
          severity: 'HIGH' as ReleaseSafetySignalSeverity,
          scoreDelta: 20,
          blocking: false,
          requiresReview: true,
          title: 'High change volume',
          description: 'Over 500 lines modified',
          evidenceType: 'DIFF',
          evidenceReferenceId: null,
          evidenceStableKey: null,
          evidenceJson: {},
          createdAt: new Date(),
        },
      ];

      const payload = service.buildPayload({
        assessment: { ...baseAssessment, signals },
        repositoryConnectionId: 'repo-1',
        headSha: '0123456789abcdef0123456789abcdef01234567',
        changeSetId: 'cs-1',
        appBaseUrl: 'https://impactra.example.com',
      });

      expect(payload.name).toBe(GITHUB_CHECK_NAME);
      expect(payload.head_sha).toBe('0123456789abcdef0123456789abcdef01234567');
      expect(payload.status).toBe('completed');
      expect(payload.conclusion).toBe('action_required');
      expect(payload.external_id).toBe(
        'impactra:release-safety:repo-1:0123456789abcdef0123456789abcdef01234567',
      );
      expect(payload.details_url).toBe(
        'https://impactra.example.com/workspace/changes/cs-1',
      );
      expect(payload.output.title).toBe(
        'Impactra Release Safety: REVIEW REQUIRED',
      );
      expect(payload.output.summary).toContain('REVIEW_REQUIRED');
      expect(payload.output.summary).toContain('65 / 100');
      expect(payload.output.text).toContain('RS_RULE_LARGE_CHANGE');
    });

    it('omits details_url when appBaseUrl is localhost or local', () => {
      const payload = service.buildPayload({
        assessment: baseAssessment,
        repositoryConnectionId: 'repo-1',
        headSha: 'abcdef',
        changeSetId: 'cs-1',
        appBaseUrl: 'http://localhost:3000',
      });

      expect(payload.details_url).toBeUndefined();
    });

    it('bounds signals to MAX_SIGNALS_IN_CHECK_OUTPUT (15)', () => {
      const signals: ReleaseSafetySignal[] = Array.from({ length: 25 }, (_, i) => ({
        id: `sig-${i}`,
        organizationId: 'org-1',
        assessmentId: 'ass-123',
        ruleId: `RULE_${String(i).padStart(2, '0')}`,
        ruleVersion: 'v1',
        category: 'CHANGE_SIZE' as ReleaseSafetySignalCategory,
        severity: 'LOW' as ReleaseSafetySignalSeverity,
        scoreDelta: 1,
        blocking: false,
        requiresReview: false,
        title: `Signal ${i}`,
        description: '',
        evidenceType: 'TEST',
        evidenceReferenceId: null,
        evidenceStableKey: null,
        evidenceJson: {},
        createdAt: new Date(),
      }));

      const payload = service.buildPayload({
        assessment: { ...baseAssessment, signals },
        repositoryConnectionId: 'repo-1',
        headSha: 'abcdef',
        changeSetId: 'cs-1',
      });

      expect(payload.output.text).toContain(
        `Showing ${MAX_SIGNALS_IN_CHECK_OUTPUT} of 25 deterministic signals`,
      );
    });

    it('handles zero signals gracefully', () => {
      const payload = service.buildPayload({
        assessment: { ...baseAssessment, signals: [] },
        repositoryConnectionId: 'repo-1',
        headSha: 'abcdef',
        changeSetId: 'cs-1',
      });

      expect(payload.output.text).toContain(
        'Zero risk signals identified for this change revision.',
      );
    });

    it('incorporates APPROVED governance state into payload conclusion and summary', () => {
      const payload = service.buildPayload({
        assessment: baseAssessment,
        repositoryConnectionId: 'repo-1',
        headSha: 'abcdef',
        changeSetId: 'cs-1',
        governance: {
          effectiveAuthorization: EffectiveReleaseAuthorization.APPROVED,
          authorizedBy: 'Lead Architect',
          reason: 'Architecture risk reviewed and accepted.',
        },
      });

      expect(payload.conclusion).toBe('success');
      expect(payload.output.title).toContain('APPROVED');
      expect(payload.output.summary).toContain('**Effective Authorization**: APPROVED');
      expect(payload.output.summary).toContain('**Approval**: APPROVED');
      expect(payload.output.summary).toContain('**Approved By**: Lead Architect');
      expect(payload.output.summary).toContain('**Approval Reason**: Architecture risk reviewed and accepted.');
    });

    it('incorporates EXCEPTION_GRANTED governance state for BLOCKED assessment into payload', () => {
      const blockedAssessment = {
        ...baseAssessment,
        decision: 'BLOCKED' as ReleaseSafetyDecision,
        riskScore: 85,
      };

      const payload = service.buildPayload({
        assessment: blockedAssessment,
        repositoryConnectionId: 'repo-1',
        headSha: 'abcdef',
        changeSetId: 'cs-1',
        governance: {
          effectiveAuthorization: EffectiveReleaseAuthorization.EXCEPTION_GRANTED,
          authorizedBy: 'VP Engineering',
          exceptionReason: 'Emergency production hotfix override.',
        },
      });

      expect(payload.conclusion).toBe('success');
      expect(payload.output.title).toContain('EXCEPTION GRANTED');
      expect(payload.output.summary).toContain('**Release Decision**: BLOCKED');
      expect(payload.output.summary).toContain('**Effective Authorization**: EXCEPTION_GRANTED');
      expect(payload.output.summary).toContain('**Exception**: GRANTED');
      expect(payload.output.summary).toContain('**Authorized By**: VP Engineering');
      expect(payload.output.summary).toContain('**Exception Reason**: Emergency production hotfix override.');
    });

    it('incorporates REJECTED governance state into payload conclusion', () => {
      const payload = service.buildPayload({
        assessment: baseAssessment,
        repositoryConnectionId: 'repo-1',
        headSha: 'abcdef',
        changeSetId: 'cs-1',
        governance: {
          effectiveAuthorization: EffectiveReleaseAuthorization.REJECTED,
          authorizedBy: 'QA Lead',
          reason: 'Breaking regression identified in blast radius.',
        },
      });

      expect(payload.conclusion).toBe('failure');
      expect(payload.output.title).toContain('REJECTED');
      expect(payload.output.summary).toContain('**Effective Authorization**: REJECTED');
      expect(payload.output.summary).toContain('**Approval**: REJECTED');
    });
  it('incorporates Release Policy snapshot context and matched rules into output', () => {
      const payload = service.buildPayload({
        assessment: {
          ...baseAssessment,
          policySnapshotJson: {
            policyName: 'Production Strict Safety Policy',
            policyVersion: 3,
            policyScope: 'REPOSITORY_BRANCH',
            evaluationResults: [
              {
                ruleKey: 'strict_max_risk_score',
                ruleType: 'MAX_RISK_SCORE',
                action: 'REQUIRE_REVIEW',
                matched: true,
                reason: 'Score 65 exceeds configured threshold 50.',
              },
            ],
          },
        },
        repositoryConnectionId: 'repo-1',
        headSha: 'abcdef',
        changeSetId: 'cs-1',
      });

      expect(payload.output.summary).toContain('**Policy**: Production Strict Safety Policy');
      expect(payload.output.summary).toContain('**Policy Version**: 3');
      expect(payload.output.summary).toContain('**Policy Scope**: REPOSITORY_BRANCH');
      expect(payload.output.text).toContain('Matched Policy Rules');
      expect(payload.output.text).toContain('strict_max_risk_score');
      expect(payload.output.text).toContain('MAX_RISK_SCORE');
    });
  });
});
