/*
 * Server logging utility
 */

const serverLogs = [];
const MAX_LOGS = 100;

function log(type, message) {
  const entry = {
    time: new Date().toISOString(),
    type,
    message
  };
  
  serverLogs.unshift(entry);
  if (serverLogs.length > MAX_LOGS) serverLogs.pop();
  
  console.log(`[${type}] ${message}`);
}

function getLogs() {
  return serverLogs;
}

module.exports = {
  log,
  getLogs
};
