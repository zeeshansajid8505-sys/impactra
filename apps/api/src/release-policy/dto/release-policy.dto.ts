import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsInt,
  IsNumber,
  IsEnum,
  IsArray,
  ValidateNested,
  MaxLength,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  ReleasePolicyAction,
  ReleasePolicyRuleType,
  ReleasePolicyStatus,
  ReleaseSafetySignalSeverity,
} from '@impactra/database';

export const RELEASE_POLICY_ERROR_CODES = {
  NOT_FOUND: 'RELEASE_POLICY_NOT_FOUND',
  INVALID_STATE: 'RELEASE_POLICY_INVALID_STATE',
  ALREADY_ACTIVE: 'RELEASE_POLICY_ALREADY_ACTIVE',
  RULE_INVALID: 'RELEASE_POLICY_RULE_INVALID',
  THRESHOLD_INVALID: 'RELEASE_POLICY_THRESHOLD_INVALID',
  SCOPE_CONFLICT: 'RELEASE_POLICY_SCOPE_CONFLICT',
  VERSION_CONFLICT: 'RELEASE_POLICY_VERSION_CONFLICT',
  REPOSITORY_NOT_FOUND: 'RELEASE_POLICY_REPOSITORY_NOT_FOUND',
  PREVIEW_FAILED: 'RELEASE_POLICY_PREVIEW_FAILED',
  ACTIVATION_FAILED: 'RELEASE_POLICY_ACTIVATION_FAILED',
} as const;

export class CreateReleasePolicyRuleDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  ruleKey?: string;

  @IsEnum(ReleasePolicyRuleType)
  ruleType!: ReleasePolicyRuleType;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsEnum(ReleaseSafetySignalSeverity)
  severity?: ReleaseSafetySignalSeverity | null;

  @IsEnum(ReleasePolicyAction)
  action!: ReleasePolicyAction;

  @IsOptional()
  @IsNumber()
  thresholdNumeric?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  thresholdText?: string | null;

  @IsOptional()
  configuration?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  order?: number;
}

export class CreateReleasePolicyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  repositoryConnectionId?: string | null;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  targetBranchPattern?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateReleasePolicyRuleDto)
  rules?: CreateReleasePolicyRuleDto[];
}

export class UpdateReleasePolicyRuleDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  ruleKey?: string;

  @IsEnum(ReleasePolicyRuleType)
  ruleType!: ReleasePolicyRuleType;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsEnum(ReleaseSafetySignalSeverity)
  severity?: ReleaseSafetySignalSeverity | null;

  @IsEnum(ReleasePolicyAction)
  action!: ReleasePolicyAction;

  @IsOptional()
  @IsNumber()
  thresholdNumeric?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  thresholdText?: string | null;

  @IsOptional()
  configuration?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  order?: number;
}

export class UpdateReleasePolicyDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  repositoryConnectionId?: string | null;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  targetBranchPattern?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateReleasePolicyRuleDto)
  rules?: UpdateReleasePolicyRuleDto[];
}

export class PreviewReleasePolicyDto {
  @IsString()
  @IsNotEmpty()
  changeSetId!: string;

  @IsOptional()
  @IsString()
  changeRevisionId?: string;
}

export class ListReleasePoliciesQueryDto {
  @IsOptional()
  @IsString()
  repositoryConnectionId?: string;

  @IsOptional()
  @IsEnum(ReleasePolicyStatus)
  status?: ReleasePolicyStatus;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
