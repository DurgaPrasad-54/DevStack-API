/**
 * Shared Hackathon Utilities
 * Single source of truth for hackathon status calculation.
 * Previously duplicated in Adminhackathon.js, hack-reg.js, and the scheduler.
 */

/**
 * Calculate hackathon status based on current date vs registration and end dates.
 * @param {Date|string} regstart - Registration start date
 * @param {Date|string} enddate  - Event end date
 * @returns {'upcoming'|'ongoing'|'completed'}
 */
const calculateStatus = (regstart, enddate) => {
  const now = new Date();
  const start = new Date(regstart);
  const end = new Date(enddate);

  if (now < start) return 'upcoming';
  if (now >= start && now <= end) return 'ongoing';
  return 'completed';
};

module.exports = { calculateStatus };
