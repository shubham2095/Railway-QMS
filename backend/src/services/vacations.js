import { config } from '../config/index.js';
import { find, first, insert, query, transaction, update } from '../db.js';
import { stepLabel } from '../domain.js';
import { DomainError } from '../utils/http.js';
import { compactDate, randomUpper } from '../utils/helpers.js';
import { nowStr, todayStr } from '../utils/dates.js';
import { audit, subject } from './audit.js';
import { generateCertificate } from './certificates.js';
import { notify } from './notifications.js';

/** Module 8 - raise a vacation request and initialise the clearance workflow. */
export function initiateVacation(allotment, data) {
  return transaction(async () => {
    const steps = config.rqms.vacationClearanceSteps;

    const id = await insert('vacation_requests', {
      reference_no: `VAC-${compactDate()}-${randomUpper(4)}`,
      allotment_id: allotment.id,
      quarter_id: allotment.quarter_id,
      employee_profile_id: allotment.employee_profile_id,
      trigger: data.trigger,
      requested_vacation_date: data.requested_vacation_date,
      reason: data.reason ?? null,
      status: 'in_clearance',
      current_step: steps[0],
    });

    for (const [i, step] of steps.entries()) {
      await insert('vacation_clearances', {
        vacation_request_id: id,
        step,
        sequence: i + 1,
        status: 'pending',
      });
    }

    await update('quarters', allotment.quarter_id, { status: 'vacation_pending' });
    await audit('vacation.initiate', subject('vacation_request', id), 'Vacation workflow started');
    return find('vacation_requests', id);
  });
}

/**
 * Module 9 - act on the current clearance step. The caller has already verified that
 * the user holds the permission mapped to this step.
 */
export function actOnClearance(vacation, step, actor, approve, data = {}) {
  return transaction(async () => {
    const clearance = await first(
      'SELECT * FROM vacation_clearances WHERE vacation_request_id = ? AND step = ?',
      [vacation.id, step],
    );
    if (!clearance) throw new DomainError('Unknown clearance step.', 'step');

    // Enforce ordering: only the current step of an in-progress request may be acted upon.
    if (vacation.status !== 'in_clearance' || vacation.current_step !== step) {
      throw new DomainError('This is not the current clearance step.', 'step');
    }

    await update('vacation_clearances', clearance.id, {
      status: approve ? 'approved' : 'rejected',
      handled_by: actor.id,
      meter_reading: data.meter_reading ?? null,
      dues_amount: data.dues_amount ?? null,
      has_damage: data.has_damage ?? null,
      remarks: data.remarks ?? null,
      acted_at: nowStr(),
    });

    if (!approve) {
      await update('vacation_requests', vacation.id, { status: 'rejected' });
      await audit('vacation.clearance.reject', subject('vacation_request', vacation.id), `${stepLabel(step)} rejected`);
      return find('vacation_clearances', clearance.id);
    }

    // Issue step-specific certificate where applicable.
    const certType = { electrical: 'electrical_clearance', water: 'water_clearance' }[step];
    if (certType) {
      await generateCertificate(
        subject('vacation_request', vacation.id),
        certType,
        {
          reference_no: vacation.reference_no,
          meter_reading: data.meter_reading ?? null,
          dues_amount: data.dues_amount ?? 0,
        },
        actor.id,
      );
    }

    // Advance to the next pending step, or complete.
    const next = await first(
      `SELECT * FROM vacation_clearances WHERE vacation_request_id = ? AND status = 'pending' ORDER BY sequence ASC LIMIT 1`,
      [vacation.id],
    );
    if (next) {
      await update('vacation_requests', vacation.id, { current_step: next.step });
      await audit('vacation.clearance.pending', subject('vacation_request', vacation.id), `Awaiting ${stepLabel(next.step)}`);
    } else {
      await completeVacation(vacation, actor);
    }

    await audit('vacation.clearance.approve', subject('vacation_request', vacation.id), `${stepLabel(step)} approved`);
    return find('vacation_clearances', clearance.id);
  });
}

/** Final step done - generate NOC + handover docs, free the quarter, end occupancy. */
async function completeVacation(vacation, actor) {
  const today = todayStr();
  await update('vacation_requests', vacation.id, { status: 'completed', current_step: null, completed_at: nowStr() });
  await update('allotments', vacation.allotment_id, { status: 'vacated', vacated_on: today });
  await update('quarters', vacation.quarter_id, { status: 'vacant', current_occupant_id: null });
  await update('employee_profiles', vacation.employee_profile_id, { has_active_allotment: 0 });

  const occupancies = await query('SELECT id FROM occupancies WHERE allotment_id = ?', [vacation.allotment_id]);
  for (const occ of occupancies) await update('occupancies', occ.id, { is_current: 0, end_date: today });

  // Module 11 - auto-generate clearance documents.
  for (const type of ['vacation_noc', 'no_due_certificate', 'handover_certificate']) {
    await generateCertificate(subject('vacation_request', vacation.id), type, { reference_no: vacation.reference_no }, actor.id);
  }

  const user = await first(
    'SELECT u.id, u.name, u.email, u.mobile FROM employee_profiles p JOIN users u ON u.id = p.user_id WHERE p.id = ?',
    [vacation.employee_profile_id],
  );
  await notify(
    user,
    'noc_generated',
    `Vacation cleared for ${vacation.reference_no}. NOC & No-Due certificate are available.`,
    'Clearance Completed',
    ['email', 'sms'],
  );
}
