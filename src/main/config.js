const fs = require('fs');
const path = require('path');

function loadEnv(userDataPath) {
  const envPath = path.join(userDataPath, '.env');
  const config = {};
  
  if (!fs.existsSync(envPath)) return config;
  
  try {
    const content = fs.readFileSync(envPath, 'utf8');
    const lines = content.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      
      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();
      
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      
      config[key] = value;
    }
  } catch (e) {}
  
  return config;
}

function getConfig(userDataPath) {
  const env = loadEnv(userDataPath);
  
  return {
    LAN_PORT: parseInt(env.LAN_PORT) || 3456,
    UDP_PORT: parseInt(env.UDP_PORT) || 3457,
    WS_PORT: parseInt(env.WS_PORT) || 3458,
    VAT_RATE: parseFloat(env.VAT_RATE) || 0.12,
    LOG_LEVEL: env.LOG_LEVEL || 'info',
    MAX_RATE_PER_MIN: parseInt(env.MAX_RATE_PER_MIN) || 120,
    ENABLE_HTTPS: env.ENABLE_HTTPS === 'true',
    SESSION_TIMEOUT: parseInt(env.SESSION_TIMEOUT) || 3600000,
    BACKUP_RETENTION_DAYS: parseInt(env.BACKUP_RETENTION_DAYS) || 30
  };
}

module.exports = { loadEnv, getConfig };
