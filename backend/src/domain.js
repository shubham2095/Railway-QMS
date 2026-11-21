// Domain enums (ported from Laravel app/Enums/*).
import { titleCase } from './utils/helpers.js';

export const QUARTER_TYPES = ['I', 'II', 'III', 'IV', 'V', 'VI'];
export const quarterTypeLabel = (t) => `Type-${t}`;

export const QUARTER_STATUSES = [
  'vacant', 'occupied', 'reserved', 'under_maintenance', 'allotted', 'vacation_pending', 'retired_occupancy',
];

export const APPLICATION_STATUSES = [
  'submitted', 'verified', 'eligible', 'ineligible', 'waitlisted', 'forwarded', 'approved', 'rejected', 'allotted', 'withdrawn',
];

export const CATEGORIES = { SC: 'Scheduled Caste', ST: 'Scheduled Tribe', OBC: 'Other Backward Class', GENERAL: 'General' };
export const SERVICE_TYPES = { essential: 'Essential Service', non_essential: 'Non-Essential Service' };

export const ALLOTMENT_STATUSES = ['offered', 'accepted', 'rejected', 'possession_taken', 'vacated'];
export const VACATION_TRIGGERS = ['transfer', 'retirement', 'resignation', 'death', 'voluntary'];

export const CLEARANCE_STEPS = {
  clerk_inspection: { label: 'Quarter Clerk Inspection', role: 'quarter_clerk' },
  electrical: { label: 'Electrical Clearance', role: 'electrical_dept' },
  water: { label: 'Water Clearance', role: 'water_dept' },
  accounts: { label: 'Accounts Clearance', role: 'accounts_dept' },
  estate_officer: { label: 'Estate Officer Approval', role: 'estate_officer' },
};
export const stepLabel = (s) => CLEARANCE_STEPS[s]?.label ?? titleCase(s);

export const CERTIFICATE_TYPES = {
  allotment_order: 'AO',
  possession_letter: 'PL',
  occupancy_certificate: 'OC',
  vacation_noc: 'NOC',
  no_due_certificate: 'NDC',
  electrical_clearance: 'ELC',
  water_clearance: 'WTC',
  handover_certificate: 'HOC',
};
export const certificateLabel = (t) => titleCase(t);

export const RETENTION_STATUSES = ['notice', 'retained', 'expiring', 'overstaying', 'cleared'];

// Roles
export const STAFF_ROLES = ['quarter_clerk', 'estate_officer', 'admin', 'super_admin'];
export const DEPT_ROLES = ['electrical_dept', 'water_dept', 'accounts_dept'];
export const ALL_STAFF_ROLES = [...STAFF_ROLES, ...DEPT_ROLES];

// role -> clearance step owned by that department
export const STEP_FOR_ROLE = {
  quarter_clerk: 'clerk_inspection',
  electrical_dept: 'electrical',
  water_dept: 'water',
  accounts_dept: 'accounts',
  estate_officer: 'estate_officer',
};
