/*
 * Date/Time utilities (IST timezone)
 */

/**
 * Get IST date range for a given date
 */
function getISTDateRange(dateStr) {
  let targetDate = dateStr ? new Date(dateStr) : new Date(Date.now() + 5.5 * 3600000);
  const dateString = targetDate.toISOString().split('T')[0];
  
  return {
    start: `${dateString}T00:00:00+05:30`,
    end: `${dateString}T23:59:59+05:30`,
    dateLabel: dateString
  };
}

module.exports = {
  getISTDateRange
};
