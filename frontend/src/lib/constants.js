// Domain enums shared with the backend (src/domain.js).
export const QUARTER_TYPES = ['I', 'II', 'III', 'IV', 'V', 'VI'];
export const quarterTypeLabel = (t) => `Type-${t}`;

export const QUARTER_STATUSES = ['vacant', 'occupied', 'reserved', 'under_maintenance', 'allotted', 'vacation_pending', 'retired_occupancy'];

export const CATEGORIES = { SC: 'Scheduled Caste', ST: 'Scheduled Tribe', OBC: 'Other Backward Class', GENERAL: 'General' };
export const SERVICE_TYPES = { essential: 'Essential Service', non_essential: 'Non-Essential Service' };

export const ALLOTMENT_STATUSES = ['offered', 'accepted', 'rejected', 'possession_taken', 'vacated'];
export const VACATION_TRIGGERS = ['transfer', 'retirement', 'resignation', 'death', 'voluntary'];

export const CERTIFICATE_LABELS = {
  allotment_order: 'Allotment Order',
  possession_letter: 'Possession Letter',
  occupancy_certificate: 'Occupancy Certificate',
  vacation_noc: 'Vacation Noc',
  no_due_certificate: 'No Due Certificate',
  electrical_clearance: 'Electrical Clearance',
  water_clearance: 'Water Clearance',
  handover_certificate: 'Handover Certificate',
};

export const DOC_CATEGORIES = {
  service_certificate: 'Service Certificate',
  identity_card: 'Identity Card',
  category_certificate: 'Category Certificate',
  medical_certificate: 'Medical Certificate',
  supporting_document: 'Other Supporting Document',
};

export const STATUS_TONES = {
  quarter: {
    vacant: 'bg-emerald-500', occupied: 'bg-sky-500', allotted: 'bg-indigo-400', reserved: 'bg-amber-400',
    under_maintenance: 'bg-slate-400', vacation_pending: 'bg-orange-400', retired_occupancy: 'bg-rose-400',
  },
};

export const STAFF_ROLES = ['quarter_clerk', 'estate_officer', 'admin', 'super_admin'];
