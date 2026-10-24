import { ReleaseAuthorizationService } from './release-authorization.service';
import {
  EffectiveReleaseAuthorization,
  ReleaseApprovalStatus,
  ReleaseApprovalResolution,
} from '@impactra/shared';

describe('ReleaseAuthorizationService', () => {
  let service: ReleaseAuthorizationService;

  beforeEach(() => {
    service = new ReleaseAuthorizationService();
  });

  describe('deriveEffectiveAuthorization', () => {
    it('returns AUTO_APPROVED_BY_POLICY when policy decision is PASS', () => {
      const auth = service.deriveEffectiveAuthorization('PASS', null);
      expect(auth).toBe(EffectiveReleaseAuthorization.AUTO_APPROVED_BY_POLICY);
    });

    it('returns PENDING_REVIEW when decision is REVIEW_REQUIRED and no request exists', () => {
      const auth = service.deriveEffectiveAuthorization('REVIEW_REQUIRED', null);
      expect(auth).toBe(EffectiveReleaseAuthorization.PENDING_REVIEW);
    });

    it('returns PENDING_REVIEW when decision is REVIEW_REQUIRED and request is PENDING', () => {
      const auth = service.deriveEffectiveAuthorization('REVIEW_REQUIRED', {
        status: ReleaseApprovalStatus.PENDING,
      });
      expect(auth).toBe(EffectiveReleaseAuthorization.PENDING_REVIEW);
    });

    it('returns APPROVED when decision is REVIEW_REQUIRED and request is APPROVED with APPROVE resolution', () => {
      const auth = service.deriveEffectiveAuthorization('REVIEW_REQUIRED', {
        status: ReleaseApprovalStatus.APPROVED,
        resolution: ReleaseApprovalResolution.APPROVE,
      });
      expect(auth).toBe(EffectiveReleaseAuthorization.APPROVED);
    });

    it('returns EXCEPTION_GRANTED when decision is REVIEW_REQUIRED and resolution is EXCEPTION', () => {
      const auth = service.deriveEffectiveAuthorization('REVIEW_REQUIRED', {
        status: ReleaseApprovalStatus.APPROVED,
        resolution: ReleaseApprovalResolution.EXCEPTION,
      });
      expect(auth).toBe(EffectiveReleaseAuthorization.EXCEPTION_GRANTED);
    });

    it('returns REJECTED when decision is REVIEW_REQUIRED and request is REJECTED', () => {
      const auth = service.deriveEffectiveAuthorization('REVIEW_REQUIRED', {
        status: ReleaseApprovalStatus.REJECTED,
        resolution: ReleaseApprovalResolution.REJECT,
      });
      expect(auth).toBe(EffectiveReleaseAuthorization.REJECTED);
    });

    it('returns BLOCKED when decision is BLOCKED and no request exists', () => {
      const auth = service.deriveEffectiveAuthorization('BLOCKED', null);
      expect(auth).toBe(EffectiveReleaseAuthorization.BLOCKED);
    });

    it('returns BLOCKED when decision is BLOCKED and request is PENDING', () => {
      const auth = service.deriveEffectiveAuthorization('BLOCKED', {
        status: ReleaseApprovalStatus.PENDING,
      });
      expect(auth).toBe(EffectiveReleaseAuthorization.BLOCKED);
    });

    it('returns EXCEPTION_GRANTED when decision is BLOCKED and request is APPROVED with EXCEPTION resolution', () => {
      const auth = service.deriveEffectiveAuthorization('BLOCKED', {
        status: ReleaseApprovalStatus.APPROVED,
        resolution: ReleaseApprovalResolution.EXCEPTION,
      });
      expect(auth).toBe(EffectiveReleaseAuthorization.EXCEPTION_GRANTED);
    });

    it('returns REJECTED when decision is BLOCKED and request is REJECTED', () => {
      const auth = service.deriveEffectiveAuthorization('BLOCKED', {
        status: ReleaseApprovalStatus.REJECTED,
        resolution: ReleaseApprovalResolution.REJECT,
      });
      expect(auth).toBe(EffectiveReleaseAuthorization.REJECTED);
    });

    it('returns BLOCKED when decision is undefined or null', () => {
      expect(service.deriveEffectiveAuthorization(null, null)).toBe(
        EffectiveReleaseAuthorization.BLOCKED,
      );
      expect(service.deriveEffectiveAuthorization(undefined, null)).toBe(
        EffectiveReleaseAuthorization.BLOCKED,
      );
    });
  });

  describe('mapAuthorizationToGitHubConclusion', () => {
    it('maps AUTO_APPROVED_BY_POLICY to success', () => {
      expect(
        service.mapAuthorizationToGitHubConclusion(
          EffectiveReleaseAuthorization.AUTO_APPROVED_BY_POLICY,
        ),
      ).toBe('success');
    });

    it('maps APPROVED to success', () => {
      expect(
        service.mapAuthorizationToGitHubConclusion(
          EffectiveReleaseAuthorization.APPROVED,
        ),
      ).toBe('success');
    });

    it('maps EXCEPTION_GRANTED to success', () => {
      expect(
        service.mapAuthorizationToGitHubConclusion(
          EffectiveReleaseAuthorization.EXCEPTION_GRANTED,
        ),
      ).toBe('success');
    });

    it('maps PENDING_REVIEW to action_required', () => {
      expect(
        service.mapAuthorizationToGitHubConclusion(
          EffectiveReleaseAuthorization.PENDING_REVIEW,
        ),
      ).toBe('action_required');
    });

    it('maps REJECTED to failure', () => {
      expect(
        service.mapAuthorizationToGitHubConclusion(
          EffectiveReleaseAuthorization.REJECTED,
        ),
      ).toBe('failure');
    });

    it('maps BLOCKED to failure', () => {
      expect(
        service.mapAuthorizationToGitHubConclusion(
          EffectiveReleaseAuthorization.BLOCKED,
        ),
      ).toBe('failure');
    });
  });
});
