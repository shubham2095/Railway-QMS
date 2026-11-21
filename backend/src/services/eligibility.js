import { config } from '../config/index.js';
import { diffInYears } from '../utils/dates.js';

export const serviceYears = (profile, asOf = new Date()) =>
  profile.date_of_joining ? Math.max(0, diffInYears(profile.date_of_joining, asOf)) : 0;

const filled = (v) => v !== null && v !== undefined && String(v).trim() !== '';

/**
 * Module 4 - eligibility engine.
 * @returns {{eligible:boolean, reasons:string[], checks:Record<string,boolean>}}
 */
export function evaluateEligibility(application, profile) {
  const type = application.preferred_quarter_type;
  const checks = {};
  const reasons = [];
  const cfg = config.rqms.eligibility;

  // 1. Service length requirement for the requested quarter type.
  const minYears = cfg.minServiceYears[type] ?? 0;
  const years = serviceYears(profile);
  checks.service_length = years >= minYears;
  if (!checks.service_length) {
    reasons.push(`Requires ${minYears} years of service for Type-${type}; employee has ${years}.`);
  }

  // 2. Existing accommodation block.
  if (cfg.blockIfExistingAllotment) {
    checks.no_existing_allotment = !profile.has_active_allotment;
    if (!checks.no_existing_allotment) reasons.push('Employee already holds an active quarter allotment.');
  }

  // 3. Station match (must apply within posting station).
  checks.station_match = !filled(application.station) || application.station === profile.station;
  if (!checks.station_match) reasons.push('Requested station does not match the posting station.');

  // 4. Profile completeness gate.
  checks.profile_complete = filled(profile.designation) && filled(profile.date_of_joining);
  if (!checks.profile_complete) reasons.push('Employee profile incomplete (designation / date of joining).');

  return { eligible: !Object.values(checks).includes(false), reasons, checks };
}
