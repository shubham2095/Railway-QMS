import { insert, query } from '../db.js';

export const MAX_COLONY_CHOICES = 5;

/** Save an application's ranked colony choices: names[0] is the 1st choice, names[1] the 2nd, ... */
export async function savePreferences(applicationId, names) {
  for (const [i, colony_name] of names.slice(0, MAX_COLONY_CHOICES).entries()) {
    await insert('application_colony_preferences', { quarter_application_id: applicationId, priority: i + 1, colony_name });
  }
}

/** Map of application id -> [{ priority, colony_name }] ordered by priority. */
export async function preferencesFor(applicationIds) {
  const map = new Map();
  if (!applicationIds.length) return map;
  const rows = await query(
    `SELECT quarter_application_id AS application_id, priority, colony_name
       FROM application_colony_preferences WHERE quarter_application_id IN (?) ORDER BY quarter_application_id, priority`,
    [applicationIds],
  );
  for (const r of rows) {
    if (!map.has(r.application_id)) map.set(r.application_id, []);
    map.get(r.application_id).push({ priority: r.priority, colony_name: r.colony_name });
  }
  return map;
}

/** Which choice (1..5) a colony is for one applicant, or null when it is not on their list (case-insensitive). */
export const choiceFor = (preferences, colonyName) => {
  if (!colonyName) return null;
  const wanted = colonyName.trim().toLowerCase();
  return preferences?.find((p) => p.colony_name.trim().toLowerCase() === wanted)?.priority ?? null;
};
