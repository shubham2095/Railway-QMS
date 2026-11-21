import { config } from '../config/index.js';
import { diffInMonths } from '../utils/dates.js';
import { serviceYears } from './eligibility.js';

/**
 * Module 4 - priority matrix.
 * @returns {{score:number, breakdown:Record<string,number>}}
 */
export function calculatePriority(application, profile) {
  const w = config.rqms.priorityWeights;
  const breakdown = {};

  breakdown.essential_service = application.service_type === 'essential' ? Math.trunc(w.essential_service) : 0;
  breakdown.medical_ground = application.medical_ground ? Math.trunc(w.medical_ground) : 0;

  const catWeights = { SC: w.sc, ST: w.st, OBC: w.obc, GENERAL: w.general };
  breakdown.category = Math.trunc(catWeights[application.category] ?? 0);

  // Seniority - points per completed service year, capped.
  breakdown.seniority = Math.trunc(Math.min(serviceYears(profile) * w.seniority_per_year, Math.trunc(w.seniority_cap)));

  // Application age - points per completed month waiting, capped.
  const months = application.applied_at ? diffInMonths(application.applied_at, new Date()) : 0;
  breakdown.application_age = Math.trunc(Math.min(Math.max(months, 0) * w.application_per_month, Math.trunc(w.application_cap)));

  const score = Object.values(breakdown).reduce((a, b) => a + b, 0);
  return { score, breakdown };
}
