// Binary-safe AES-256-CBC helpers for encrypted backups.
// Accepts and returns Buffers so SQLite snapshot bytes survive round-trips.
const crypto = require('crypto');

function encryptData(data, password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const input = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8');
  let encrypted = cipher.update(input, undefined, 'hex');
  encrypted += cipher.final('hex');
  return { salt: salt.toString('hex'), iv: iv.toString('hex'), data: encrypted };
}

function decryptData(encryptedObj, password) {
  const salt = Buffer.from(encryptedObj.salt, 'hex');
  const iv = Buffer.from(encryptedObj.iv, 'hex');
  const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encryptedObj.data, 'hex');
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted;
}

module.exports = { encryptData, decryptData };
