import { Injectable } from '@nestjs/common';
import {
  ReleaseSafetyDecision,
  EffectiveReleaseAuthorization,
  ReleaseApprovalStatus,
  ReleaseApprovalResolution,
} from '@impactra/shared';

export interface ApprovalRequestSummary {
  status: ReleaseApprovalStatus;
  resolution?: ReleaseApprovalResolution | null;
}

@Injectable()
export class ReleaseAuthorizationService {
  /**
   * Deterministically derives the effective release authorization from the authoritative
   * Release Safety decision and current human approval request state.
   */
  deriveEffectiveAuthorization(
    decision: ReleaseSafetyDecision | null | undefined,
    approvalRequest?: ApprovalRequestSummary | null,
  ): EffectiveReleaseAuthorization {
    if (!decision) {
      return EffectiveReleaseAuthorization.BLOCKED;
    }

    switch (decision) {
      case 'PASS':
        return EffectiveReleaseAuthorization.AUTO_APPROVED_BY_POLICY;

      case 'REVIEW_REQUIRED': {
        if (!approvalRequest) {
          return EffectiveReleaseAuthorization.PENDING_REVIEW;
        }

        if (approvalRequest.status === ReleaseApprovalStatus.APPROVED) {
          if (
            approvalRequest.resolution === ReleaseApprovalResolution.EXCEPTION
          ) {
            return EffectiveReleaseAuthorization.EXCEPTION_GRANTED;
          }
          return EffectiveReleaseAuthorization.APPROVED;
        }

        if (approvalRequest.status === ReleaseApprovalStatus.REJECTED) {
          return EffectiveReleaseAuthorization.REJECTED;
        }

        return EffectiveReleaseAuthorization.PENDING_REVIEW;
      }

      case 'BLOCKED': {
        if (!approvalRequest) {
          return EffectiveReleaseAuthorization.BLOCKED;
        }

        if (
          approvalRequest.status === ReleaseApprovalStatus.APPROVED &&
          approvalRequest.resolution === ReleaseApprovalResolution.EXCEPTION
        ) {
          return EffectiveReleaseAuthorization.EXCEPTION_GRANTED;
        }

        if (approvalRequest.status === ReleaseApprovalStatus.REJECTED) {
          return EffectiveReleaseAuthorization.REJECTED;
        }

        return EffectiveReleaseAuthorization.BLOCKED;
      }

      default: {
        return EffectiveReleaseAuthorization.BLOCKED;
      }
    }
  }

  /**
   * Deterministically maps effective release authorization to GitHub Check Run wire conclusion.
   */
  mapAuthorizationToGitHubConclusion(
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
        return 'failure';

      default:
        return 'failure';
    }
  }
}
