import { find, first, insert, isDuplicateKey, transaction, update } from '../db.js';
import { DomainError } from '../utils/http.js';
import { compactDate, randomUpper } from '../utils/helpers.js';
import { nowStr, todayStr } from '../utils/dates.js';
import { audit, subject } from './audit.js';
import { generateCertificate } from './certificates.js';
import { notify } from './notifications.js';
import * as waitingList from './waitingList.js';

/** Module 6 - applicants the admin has approved for this quarter type: only they can be offered a quarter. */
export async function suggestionsFor(quarter) {
  if (quarter.status !== 'vacant') return [];
  return waitingList.queue(quarter.quarter_type, 'approved');
}

/** Offer a quarter to a waiting-list applicant (Clerk / Estate Officer action). */
export function offerQuarter(quarterId, entryId, approver) {
  return transaction(async () => {
    // Lock the quarter row so two officers cannot allot the same quarter at once.
    const quarter = await first('SELECT * FROM quarters WHERE id = ? FOR UPDATE', [quarterId]);
    if (!quarter) throw new DomainError('The selected quarter does not exist.', 'quarter');
    if (quarter.status !== 'vacant') throw new DomainError('This quarter is not available for allotment.', 'quarter');

    const entry = await first('SELECT * FROM waiting_list_entries WHERE id = ?', [entryId]);
    if (!entry) throw new DomainError('The selected waiting list entry does not exist.', 'waiting_list_entry_id');
    if (!entry.is_active) throw new DomainError('This applicant is no longer on the waiting list.', 'waiting_list_entry_id');
    if (entry.quarter_type !== quarter.quarter_type) {
      throw new DomainError('The applicant is waiting for a different quarter type.', 'waiting_list_entry_id');
    }

    const application = await find('quarter_applications', entry.quarter_application_id);
    if (application.status !== 'approved') {
      throw new DomainError('A quarter can be offered only to an applicant the admin has approved.', 'waiting_list_entry_id');
    }
    const profile = await find('employee_profiles', application.employee_profile_id);
    const user = await first('SELECT id, name, email, mobile FROM users WHERE id = ?', [profile.user_id]);

    let allotmentId;
    let orderNo;
    for (let attempt = 0; ; attempt++) {
      orderNo = `AO-${compactDate()}-${randomUpper(4)}`;
      try {
        allotmentId = await insert('allotments', {
          allotment_order_no: orderNo,
          quarter_id: quarter.id,
          quarter_application_id: application.id,
          employee_profile_id: application.employee_profile_id,
          status: 'offered',
          offered_at: nowStr(),
          approved_by: approver.id,
        });
        break;
      } catch (err) {
        if (isDuplicateKey(err) && attempt < 5) continue;
        throw err;
      }
    }

    await update('quarters', quarter.id, { status: 'allotted' });
    await update('quarter_applications', application.id, { status: 'allotted' });
    await waitingList.remove(application);

    // Module 6 - generate the allotment order document.
    await generateCertificate(
      subject('allotment', allotmentId),
      'allotment_order',
      {
        allotment_order_no: orderNo,
        quarter: {
          quarter_number: quarter.quarter_number,
          quarter_type: quarter.quarter_type,
          colony_name: quarter.colony_name,
          station: quarter.station,
        },
        employee: { employee_id: profile.employee_id, designation: profile.designation },
      },
      approver.id,
    );

    await audit('allotment.offer', subject('allotment', allotmentId), 'Quarter offered to applicant');
    await notify(
      user,
      'quarter_allotted',
      `Quarter ${quarter.quarter_number} offered. Order ${orderNo}.`,
      'Quarter Allotted',
      ['email', 'sms', 'whatsapp'],
    );

    return find('allotments', allotmentId);
  });
}

/** Employee accepts or rejects the offered quarter. */
export async function respondToOffer(allotment, accepted) {
  await update('allotments', allotment.id, {
    status: accepted ? 'accepted' : 'rejected',
    responded_at: nowStr(),
  });
  if (!accepted) {
    // Release the quarter back to the pool.
    await update('quarters', allotment.quarter_id, { status: 'vacant' });
  }
  await audit('allotment.respond', subject('allotment', allotment.id), accepted ? 'Accepted' : 'Rejected');
  return find('allotments', allotment.id);
}

/** Module 7 - record possession: start occupancy, mark the quarter occupied. */
export function takePossession(allotment, actor) {
  return transaction(async () => {
    const today = todayStr();
    await update('allotments', allotment.id, { status: 'possession_taken', possession_date: today });

    const quarter = await find('quarters', allotment.quarter_id);
    await update('quarters', quarter.id, { status: 'occupied', current_occupant_id: allotment.employee_profile_id });

    const occupancyId = await insert('occupancies', {
      quarter_id: quarter.id,
      allotment_id: allotment.id,
      employee_profile_id: allotment.employee_profile_id,
      start_date: today,
      is_current: 1,
    });

    await update('employee_profiles', allotment.employee_profile_id, { has_active_allotment: 1 });

    await generateCertificate(
      subject('allotment', allotment.id),
      'possession_letter',
      { allotment_order_no: allotment.allotment_order_no },
      actor.id,
    );
    await generateCertificate(
      subject('allotment', allotment.id),
      'occupancy_certificate',
      { quarter: quarter.quarter_number },
      actor.id,
    );

    await audit('allotment.possession', subject('allotment', allotment.id), 'Possession taken; occupancy started');
    return find('occupancies', occupancyId);
  });
}
