import { valueInputSchema } from '@/domain/schemas';
import { ConflictError, ValidationError } from '@/domain/permissions';
import type { ValueRecord } from '@/domain/types';
import { audit, authorize, db, getBatteryOrThrow, latency, pushEvent, sourceName, type Ctx } from '../core';
import type { ValueRepository } from '../types';

const KIND_TEXT: Record<ValueRecord['kind'], string> = {
  sale: 'Sale', swap_fee: 'Swap fee', restoration_fee: 'Restoration fee', recycling_settlement: 'Recycler settlement',
};

export function createValueRepository(ctx: Ctx): ValueRepository {
  return {
    async record(input) {
      await latency(ctx);
      const actor = authorize(ctx, 'value.write');
      const v = valueInputSchema.safeParse(input);
      if (!v.success) throw new ValidationError('Value record is invalid', v.error.issues.map((i) => i.message));
      const d = db(ctx);
      const b = getBatteryOrThrow(ctx, v.data.batteryId);
      // Money can only follow the outcome it pays for.
      if (v.data.kind === 'recycling_settlement' && !d.recycling.some((r) => r.batteryId === b.id)) {
        throw new ConflictError('A recycler settlement needs a recycling record for this battery.');
      }
      const everQualified = d.events.some((e) => e.batteryId === b.id && e.newState === 'qualified');
      if (v.data.kind !== 'recycling_settlement' && v.data.kind !== 'restoration_fee' && !everQualified) {
        throw new ConflictError('Only a battery that was qualified can be sold or swapped.');
      }
      const rec: ValueRecord = {
        id: ctx.store.nextId('val'), batteryId: b.id, kind: v.data.kind, amountAed: v.data.amountAed,
        recordedOn: v.data.recordedOn, counterparty: v.data.counterparty, reference: v.data.reference ?? null,
        source: sourceName(ctx, 'Commercial ledger'), note: v.data.note ?? '', recordedByName: actor.name,
      };
      d.values.push(rec);
      // The timeline says that money was recorded, not how much: amounts stay with the roles that may see them.
      pushEvent(ctx, b.id, 'value', `${KIND_TEXT[rec.kind]} recorded`, `${rec.amountAed === null ? 'Amount not yet known. ' : ''}Counterparty ${rec.counterparty}.`, {
        approvalState: 'not_required', ref: { kind: 'value', id: rec.id },
      });
      audit(ctx, 'value.record', 'battery', b.id, `${KIND_TEXT[rec.kind]}: ${rec.amountAed === null ? 'amount unknown' : `AED ${rec.amountAed}`} from ${rec.counterparty}`);
      ctx.store.save();
      return rec;
    },
  };
}
