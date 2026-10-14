import { mapHeaders, normalizeRow, parseCsv, SAMPLE_CSV } from '@/domain/csv';
import { NotFoundError, ValidationError } from '@/domain/permissions';
import type { ImportIssue, ImportJob, ImportRow } from '@/domain/types';
import { audit, db, hashText, latency, pushEvent, authorize, type Ctx } from '../core';
import type { ImportService } from '../types';
import { newPublicRef, newUuid, normaliseSerial } from './batteries';

const MAX_ROWS = 2000;
const MAX_BYTES = 1_000_000;

function norm(s: string) {
  return s.toLowerCase().replace(/\(fictional\)/g, '').replace(/[^a-z0-9]/g, '');
}

export function createImportService(ctx: Ctx): ImportService {
  /** Classifies a normalised row against the current database. Pure with respect to the db. */
  function classify(row: ImportRow, seen: Map<string, number>, batteryNo: { n: number }): ImportRow {
    const d = db(ctx);
    const f = row.fields;
    const issues: ImportIssue[] = [...row.issues.filter((i) => !i.field.startsWith('identity') && !i.field.startsWith('family'))];
    const out: ImportRow = { ...row, issues, outcome: 'create', batteryId: null, note: '' };
    if (issues.some((i) => i.severity === 'error')) {
      return { ...out, outcome: 'quarantine', note: 'Validation errors. Row is quarantined, not imported.' };
    }
    const family = d.families.find((x) => norm(x.manufacturer) === norm(String(f.manufacturer.normalized)) && norm(x.model) === norm(String(f.model.normalized)));
    if (!family) {
      issues.push({ severity: 'error', field: 'family', message: `No approved battery family matches "${f.manufacturer.normalized} ${f.model.normalized}". Add the family in Admin first.` });
      return { ...out, outcome: 'quarantine', note: 'Unknown battery family.' };
    }
    if (family.ratedVoltageV !== f.voltage.normalized || family.ratedCapacityAh !== f.capacity.normalized) {
      issues.push({ severity: 'warning', field: 'voltage', message: `Rating ${f.voltage.normalized} V / ${f.capacity.normalized} Ah differs from the family rating ${family.ratedVoltageV} V / ${family.ratedCapacityAh} Ah. The family rating will be used.` });
    }
    const serial = f.serial.normalized as string | null;
    const legacy = f.legacy_id.normalized as string | null;
    let existingId: string | null = null;

    if (serial) {
      const key = `${family.id}:${normaliseSerial(serial)}`;
      const prior = seen.get(key);
      if (prior !== undefined) {
        issues.push({ severity: 'error', field: 'identity', message: `Serial matches row ${prior} in this file. Not merged automatically.` });
        return { ...out, outcome: 'quarantine', note: `Possible duplicate of row ${prior}.` };
      }
      const exact = d.batteries.find((b) => b.familyId === family.id && b.manufacturerSerial?.toLowerCase() === serial.toLowerCase());
      const near = d.batteries.find((b) => b.familyId === family.id && b.manufacturerSerial && normaliseSerial(b.manufacturerSerial) === normaliseSerial(serial) && b.manufacturerSerial.toLowerCase() !== serial.toLowerCase());
      if (near && !exact) {
        issues.push({ severity: 'error', field: 'identity', message: `Serial "${serial}" is similar to existing "${near.manufacturerSerial}" (${near.label}). Not merged; resolve in identity review.` });
        return { ...out, outcome: 'quarantine', note: 'Ambiguous identity.' };
      }
      seen.set(key, row.rowNumber);
      existingId = exact?.id ?? null;
    } else if (legacy) {
      const key = `legacy:${legacy.toLowerCase()}`;
      const prior = seen.get(key);
      if (prior !== undefined) {
        issues.push({ severity: 'error', field: 'identity', message: `Legacy ID "${legacy}" repeats row ${prior}.` });
        return { ...out, outcome: 'quarantine', note: 'Duplicate legacy ID in file.' };
      }
      seen.set(key, row.rowNumber);
      const al = d.aliases.find((a) => a.kind === 'legacy_lab_id' && a.value.toLowerCase() === legacy.toLowerCase());
      existingId = al?.batteryId ?? null;
    } else {
      issues.push({ severity: 'error', field: 'identity', message: 'Row has neither a serial nor a legacy ID, so it cannot be matched to a physical battery.' });
      return { ...out, outcome: 'quarantine', note: 'No identity key.' };
    }

    if (existingId) {
      const b = d.batteries.find((x) => x.id === existingId)!;
      const changes: string[] = [];
      if (!b.manufacturedOn && f.manufactured.normalized) changes.push('manufacture date');
      if (b.lifecycleState === 'received' && f.location.normalized && b.physicalLocation !== f.location.normalized) changes.push('location');
      const acq = d.costs.find((c) => c.batteryId === b.id && c.kind === 'acquisition');
      if (acq && acq.amountAed === null && f.acquisition_cost.normalized !== null) changes.push('acquisition cost');
      if (changes.length === 0) {
        return { ...out, outcome: 'skip', batteryId: b.id, note: `Unchanged. Already imported as ${b.label}.` };
      }
      return { ...out, outcome: 'update', batteryId: b.id, note: `Will update ${changes.join(', ')} on ${b.label}. No new battery is created.` };
    }
    batteryNo.n += 1;
    return { ...out, outcome: 'create', note: 'New battery record with a new permanent ID.' };
  }

  function counts(rows: ImportRow[]) {
    return {
      created: rows.filter((r) => r.outcome === 'create').length,
      updated: rows.filter((r) => r.outcome === 'update').length,
      skipped: rows.filter((r) => r.outcome === 'skip').length,
      quarantined: rows.filter((r) => r.outcome === 'quarantine').length,
    };
  }

  return {
    sampleCsv: () => SAMPLE_CSV,

    async templates() {
      await latency(ctx);
      authorize(ctx, 'battery.import');
      return db(ctx).importTemplates;
    },

    async list() {
      await latency(ctx);
      authorize(ctx, 'battery.import');
      return [...db(ctx).imports].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },

    async preview({ fileName, text, templateId }) {
      await latency(ctx);
      const actor = authorize(ctx, 'battery.import');
      const d = db(ctx);
      const template = d.importTemplates.find((t) => t.id === templateId);
      if (!template) throw new NotFoundError('Import template');
      if (!/\.csv$/i.test(fileName)) throw new ValidationError('Only .csv files are accepted.');
      if (text.length > MAX_BYTES) throw new ValidationError('File is larger than 1 MB.');
      const { headers, rows } = parseCsv(text);
      if (headers.length === 0 || rows.length === 0) throw new ValidationError('The file has no data rows.');
      if (rows.length > MAX_ROWS) throw new ValidationError(`The file has more than ${MAX_ROWS} rows.`);
      const map = mapHeaders(template, headers);
      const now = new Date(ctx.store.now());
      const seen = new Map<string, number>();
      const counter = { n: 0 };
      const parsed: ImportRow[] = rows.map((cells, i) => {
        const { fields, issues } = normalizeRow(headers, cells, map, now);
        return { rowNumber: i + 2, fields, issues, outcome: 'create', batteryId: null, note: '' };
      });
      const classified = parsed.map((r) => classify(r, seen, counter));
      const hash = hashText(text);
      const prior = d.imports.find((j) => j.fileHash === hash && j.status === 'committed');
      const job: ImportJob = {
        id: ctx.store.nextId('imp'), fileName, fileHash: hash, templateId, mappingVersion: `${template.name} ${template.version}`,
        actorName: actor.name, createdAt: ctx.store.now(), committedAt: null, status: 'previewed', rows: classified, counts: counts(classified),
      };
      job.priorCommitAt = prior?.committedAt ?? null;
      d.imports.push(job);
      audit(ctx, 'import.preview', 'import', job.id, `Previewed ${fileName}: ${classified.length} rows`);
      ctx.store.save();
      return job;
    },

    async commit(jobId) {
      await latency(ctx);
      const actor = authorize(ctx, 'battery.import');
      const d = db(ctx);
      const job = d.imports.find((j) => j.id === jobId);
      if (!job) throw new NotFoundError('Import job');
      if (job.status === 'committed') throw new ValidationError('This import was already committed.');
      // Re-classify against the current database so re-imports and double commits stay idempotent.
      const seen = new Map<string, number>();
      const counter = { n: 0 };
      const rows = job.rows.map((r) => classify(r, seen, counter));
      const now = ctx.store.now();
      const refs = new Set(d.batteries.map((b) => b.publicRef).concat(d.aliases.filter((a) => a.kind === 'retired_qr_reference').map((a) => a.value)));
      let nextNo = d.batteries.reduce((m, b) => Math.max(m, Number(b.label.replace(/\D/g, '')) || 0), 0);
      let evidenceId: string | null = null;
      const ensureEvidence = () => {
        if (!evidenceId) {
          evidenceId = ctx.store.nextId('ev');
          d.evidence.push({ id: evidenceId, batteryId: null, kind: 'import_source', fileName: job.fileName, sizeKb: Math.max(1, Math.round(job.rows.length / 4)), uploadedAt: now, uploadedByName: actor.name, checksum: job.fileHash.padEnd(64, '0'), classification: 'internal', storageKey: null, contentType: null, scanStatus: null });
        }
        return evidenceId;
      };

      for (const r of rows) {
        const f = r.fields;
        if (r.outcome === 'create') {
          const family = d.families.find((x) => norm(x.manufacturer) === norm(String(f.manufacturer.normalized)) && norm(x.model) === norm(String(f.model.normalized)))!;
          nextNo += 1;
          const id = newUuid();
          const ref = newPublicRef(refs);
          refs.add(ref);
          d.batteries.push({
            id, label: `B-${String(nextNo).padStart(4, '0')}`, publicRef: ref, manufacturerSerial: f.serial.normalized as string | null,
            familyId: family.id, manufacturedOn: f.manufactured.normalized as string | null, tenantId: actor.tenantId,
            lifecycleState: 'received', siteId: null, currentAssignmentId: null,
            physicalLocation: (f.location.normalized as string | null) ?? 'Receiving bay', restorationBatchId: null, replacesBatteryId: null,
            createdAt: now, updatedAt: now, sourceSystem: 'Intake CSV import', internalNotes: '',
          });
          r.batteryId = id;
          if (f.legacy_id.normalized) d.aliases.push({ id: ctx.store.nextId('al'), batteryId: id, kind: 'legacy_lab_id', value: String(f.legacy_id.normalized), source: job.fileName });
          d.aliases.push({ id: ctx.store.nextId('al'), batteryId: id, kind: 'spreadsheet_row', value: `${job.fileName}#row${r.rowNumber}`, source: job.mappingVersion });
          d.costs.push({
            id: ctx.store.nextId('cost'), batteryId: id, batchId: null, kind: 'acquisition',
            amountAed: f.acquisition_cost.normalized as number | null, allocation: 'direct', recordedOn: now.slice(0, 10),
            note: f.acquisition_cost.normalized === null ? 'Not supplied in import (unknown, not zero)' : `Imported from ${job.fileName} row ${r.rowNumber}`,
            source: `Import ${job.fileName}`, allocationBasis: null,
          });
          pushEvent(ctx, id, 'intake', 'Received via CSV import', `Imported from ${job.fileName}, row ${r.rowNumber}, mapping ${job.mappingVersion}.`, {
            newState: 'received', sourceSystem: 'Intake CSV import', evidenceIds: [ensureEvidence()], dateCertainty: 'approximate',
          });
        } else if (r.outcome === 'update' && r.batteryId) {
          const b = d.batteries.find((x) => x.id === r.batteryId)!;
          const before: string[] = [];
          if (!b.manufacturedOn && f.manufactured.normalized) { b.manufacturedOn = f.manufactured.normalized as string; before.push('manufacture date'); }
          if (b.lifecycleState === 'received' && f.location.normalized && b.physicalLocation !== f.location.normalized) { b.physicalLocation = f.location.normalized as string; before.push('location'); }
          const acq = d.costs.find((c) => c.batteryId === b.id && c.kind === 'acquisition');
          if (acq && acq.amountAed === null && f.acquisition_cost.normalized !== null) { acq.amountAed = f.acquisition_cost.normalized as number; acq.note = `Filled from ${job.fileName} row ${r.rowNumber}`; before.push('acquisition cost'); }
          b.updatedAt = now;
          pushEvent(ctx, b.id, 'intake', 'Record updated by CSV import', `Updated ${before.join(', ')} from ${job.fileName} row ${r.rowNumber}.`, { sourceSystem: 'Intake CSV import', evidenceIds: [ensureEvidence()] });
        }
      }
      job.rows = rows;
      job.counts = counts(rows);
      job.status = 'committed';
      job.committedAt = now;
      audit(ctx, 'import.commit', 'import', job.id, `Committed ${job.fileName}: ${job.counts.created} created, ${job.counts.updated} updated, ${job.counts.skipped} skipped, ${job.counts.quarantined} quarantined`);
      ctx.store.save();
      return job;
    },
  };
}
