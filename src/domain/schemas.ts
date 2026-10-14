import { z } from 'zod';

const optionalNumber = z.number().finite().nullable();

export const createBatterySchema = z.object({
  familyId: z.string().min(1, 'Select a battery family'),
  manufacturerSerial: z.string().trim().max(64).nullable().optional(),
  manufacturedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
    .nullable()
    .optional(),
  physicalLocation: z.string().trim().min(1, 'Location is required').max(80),
  legacyId: z.string().trim().max(40).nullable().optional(),
  acquisitionCostAed: z.number().nonnegative('Cost cannot be negative').nullable().optional(),
  /** Explicit acknowledgement required when a record with the same serial already exists. */
  acknowledgeDuplicate: z.boolean().optional(),
});
export type CreateBatteryInput = z.infer<typeof createBatterySchema>;

export const testInputSchema = z.object({
  batteryId: z.string().min(1, 'Select a battery'),
  kind: z.enum(['intake_inspection', 'initial', 'final', 'periodic']),
  protocolId: z.string().min(1, 'Protocol revision is required'),
  voltageV: z.number().min(0, 'Voltage must be positive').max(60).nullable(),
  resistanceMOhm: z.number().min(0, 'Resistance must be positive').max(1000).nullable(),
  temperatureC: z.number().min(-20, 'Temperature looks wrong').max(80, 'Temperature looks wrong').nullable(),
  capacityAh: z.number().min(0).max(5000).nullable(),
  ambientTempC: optionalNumber,
  loadCurrentA: z.number().min(0).max(2000).nullable(),
  cutoffVoltageV: z.number().min(0).max(60).nullable(),
  durationH: z.number().min(0).max(100).nullable(),
  instrument: z.string().trim().min(1, 'Instrument is required'),
  calibrationRef: z.string().trim().min(1, 'Calibration reference is required'),
  witnessName: z.string().trim().max(80).nullable().optional(),
  evidenceFileName: z.string().trim().max(120).nullable().optional(),
  notes: z.string().trim().max(500).optional(),
  attemptId: z.string().nullable().optional(),
});
export type TestInput = z.infer<typeof testInputSchema>;

export const reasonSchema = z.string().trim().min(5, 'A reason of at least 5 characters is required').max(500);

export const taskInputSchema = z.object({
  title: z.string().trim().min(5, 'Title is required').max(140),
  description: z.string().trim().max(1000).default(''),
  siteId: z.string().min(1, 'Select a site'),
  batteryId: z.string().nullable().optional(),
  alertId: z.string().nullable().optional(),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
  assigneeId: z.string().nullable().optional(),
  dueOn: z.string().nullable().optional(),
});
export type TaskInput = z.infer<typeof taskInputSchema>;

export const deploymentInputSchema = z.object({
  batteryId: z.string().min(1),
  slotId: z.string().min(1, 'Select a slot'),
  reason: reasonSchema,
});
export type DeploymentInput = z.infer<typeof deploymentInputSchema>;

export const reportInputSchema = z.object({
  templateId: z.enum(['battery_passport', 'restoration_batch', 'customer_site', 'warranty_pack', 'esg_recycling', 'data_completeness']),
  scopeId: z.string().nullable(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  audience: z.enum(['internal', 'customer']).optional(),
});
export type ReportInput = z.infer<typeof reportInputSchema>;

const roleSchema = z.enum(['lab_operator', 'battery_engineer', 'field_technician', 'noc_manager', 'finance_owner', 'customer_auditor', 'platform_admin']);
const siteScopeSchema = z.union([z.literal('all'), z.array(z.string().min(1)).min(1, 'Select at least one site, or all sites')]);

export const userInputSchema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(80),
  title: z.string().trim().min(2, 'Job title is required').max(80),
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(254),
  role: roleSchema,
  tenantId: z.string().min(1, 'Select a tenant'),
  siteScope: siteScopeSchema,
});
export type UserInput = z.infer<typeof userInputSchema>;

/** Email and tenant are fixed after creation: identity-provider accounts are linked by email. */
export const userUpdateSchema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(80).optional(),
  title: z.string().trim().min(2, 'Job title is required').max(80).optional(),
  role: roleSchema.optional(),
  siteScope: siteScopeSchema.optional(),
  active: z.boolean().optional(),
});
export type UserUpdate = z.infer<typeof userUpdateSchema>;

export const correctionSchema = z.object({
  batteryId: z.string(),
  field: z.enum(['manufacturerSerial', 'manufacturedOn', 'physicalLocation']),
  newValue: z.string().trim().max(80).nullable(),
  reason: reasonSchema,
});
export type CorrectionInput = z.infer<typeof correctionSchema>;
