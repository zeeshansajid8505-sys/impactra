import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  ListIngestionsQueryDto,
  ListTwinNodesQueryDto,
  ListTwinEdgesQueryDto,
  TriggerIngestionDto,
} from './ingestion.dto';

describe('Ingestion DTOs — Pagination and Validation Limits', () => {
  describe('ListIngestionsQueryDto', () => {
    it('accepts valid page and limit', async () => {
      const dto = plainToInstance(ListIngestionsQueryDto, { page: '2', limit: '50' });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
      expect(dto.page).toBe(2);
      expect(dto.limit).toBe(50);
    });

    it('rejects negative or zero page number', async () => {
      const dto1 = plainToInstance(ListIngestionsQueryDto, { page: '0' });
      const errors1 = await validate(dto1);
      expect(errors1.length).toBeGreaterThan(0);

      const dto2 = plainToInstance(ListIngestionsQueryDto, { page: '-5' });
      const errors2 = await validate(dto2);
      expect(errors2.length).toBeGreaterThan(0);
    });

    it('rejects non-numeric page or limit', async () => {
      const dto = plainToInstance(ListIngestionsQueryDto, { page: 'invalid', limit: 'abc' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('rejects limit exceeding hard maximum of 100', async () => {
      const dto = plainToInstance(ListIngestionsQueryDto, { limit: '101' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('limit');
    });
  });

  describe('ListTwinNodesQueryDto & ListTwinEdgesQueryDto', () => {
    it('enforces hard maximum limit of 200 for twin nodes', async () => {
      const dto = plainToInstance(ListTwinNodesQueryDto, { limit: '201' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('limit');
    });

    it('enforces hard maximum limit of 200 for twin edges', async () => {
      const dto = plainToInstance(ListTwinEdgesQueryDto, { limit: '500' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('limit');
    });
  });

  describe('TriggerIngestionDto', () => {
    it('validates commit SHA pattern (7-40 hex chars)', async () => {
      const valid = plainToInstance(TriggerIngestionDto, { commitSha: '97640def' });
      expect(await validate(valid)).toHaveLength(0);

      const invalid = plainToInstance(TriggerIngestionDto, { commitSha: 'not-hex-sha!' });
      const errors = await validate(invalid);
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});
