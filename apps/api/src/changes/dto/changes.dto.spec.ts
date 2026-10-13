import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  SyncPullRequestDto,
  ListChangeSetsQueryDto,
  ListChangedFilesQueryDto,
  ListTwinChangeMappingsQueryDto,
  ListDependencyDeltasQueryDto,
} from './changes.dto';
import {
  ChangedFileStatus,
  TwinMappingType,
  DependencyDeltaType,
} from '@impactra/shared';

describe('Changes DTOs', () => {
  describe('SyncPullRequestDto', () => {
    it('validates a valid pull request number', async () => {
      const dto = plainToInstance(SyncPullRequestDto, { prNumber: 42 });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('rejects non-integer or zero pull request number', async () => {
      const dto1 = plainToInstance(SyncPullRequestDto, { prNumber: 0 });
      const errors1 = await validate(dto1);
      expect(errors1.length).toBeGreaterThan(0);

      const dto2 = plainToInstance(SyncPullRequestDto, { prNumber: 'invalid' });
      const errors2 = await validate(dto2);
      expect(errors2.length).toBeGreaterThan(0);
    });
  });

  describe('ListChangeSetsQueryDto', () => {
    it('sets default page and limit', () => {
      const dto = new ListChangeSetsQueryDto();
      expect(dto.page).toBe(1);
      expect(dto.limit).toBe(20);
    });

    it('validates query properties', async () => {
      const dto = plainToInstance(ListChangeSetsQueryDto, {
        page: 2,
        limit: 50,
        repositoryId: 'repo-1',
        status: 'open',
        search: 'feat',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });

  describe('Enum Query DTOs', () => {
    it('validates valid ChangedFileStatus in ListChangedFilesQueryDto', async () => {
      const dto = plainToInstance(ListChangedFilesQueryDto, {
        status: ChangedFileStatus.ADDED,
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('validates valid TwinMappingType in ListTwinChangeMappingsQueryDto', async () => {
      const dto = plainToInstance(ListTwinChangeMappingsQueryDto, {
        mappingType: TwinMappingType.EXACT_PATH,
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('validates valid DependencyDeltaType in ListDependencyDeltasQueryDto', async () => {
      const dto = plainToInstance(ListDependencyDeltasQueryDto, {
        deltaType: DependencyDeltaType.EDGE_ADDED,
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });
});
