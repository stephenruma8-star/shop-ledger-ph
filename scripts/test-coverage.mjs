#!/usr/bin/env node
// Coverage summary — runs test-unit.mjs and reports pass/fail counts
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const testScript = join(__dirname, 'test-unit.mjs');

console.log('Running unit tests with coverage summary...\n');

execFile(process.execPath, [testScript], { cwd: join(__dirname, '..') }, (err, stdout, stderr) => {
  const output = stdout + stderr;
  console.log(output);

  const match = output.match(/=== Results: (\d+) passed, (\d+) failed ===/);
  if (match) {
    const passed = parseInt(match[1], 10);
    const failed = parseInt(match[2], 10);
    const total = passed + failed;
    const pct = total > 0 ? Math.round((passed / total) * 100) : 0;
    console.log(`Coverage summary: ${passed}/${total} tests passed (${pct}%)`);
    const functionsTested = [
      'round2', 'peso', 'dp', 'validateNumber', 'validatePhone',
      'parseCSVLine', 'hashPassword', 'verifyPassword'
    ];
    console.log(`Functions tested: ${functionsTested.join(', ')}`);
    console.log('Note: sanitize, escapeHtml, debounce not yet covered by unit tests');
  }

  process.exit(err ? err.code || 1 : 0);
});
