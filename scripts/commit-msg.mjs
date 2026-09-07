#!/usr/bin/env node
/**
 * commit-msg.mjs - Conventional commit message validator
 * 
 * Validates that commit messages follow the Conventional Commits format:
 *   type(scope): description
 * 
 * Usage:
 *   node scripts/commit-msg.mjs "feat(inventory): add barcode scanning"
 *   echo "fix(auth): resolve login issue" | node scripts/commit-msg.mjs
 * 
 * Exit codes:
 *   0 - Valid commit message
 *   1 - Invalid commit message
 */

const VALID_TYPES = [
  'feat',     // A new feature
  'fix',      // A bug fix
  'docs',     // Documentation only changes
  'style',    // Changes that do not affect the meaning of the code
  'refactor', // A code change that neither fixes a bug nor adds a feature
  'test',     // Adding missing tests or correcting existing tests
  'chore',    // Other changes that don't modify src or test files
  'perf',     // A code change that improves performance
  'ci',       // Changes to CI configuration files and scripts
  'build',    // Changes that affect the build system or external dependencies
];

// Conventional Commits regex pattern
// Format: type(scope)?: description
// Optional ! before : for breaking changes
// Optional body and footer after a blank line
const CONVENTIONAL_COMMIT_REGEX = /^(?<type>[a-z]+)(?:\((?<scope>[^)]+)\))?(?<breaking>!)?:\s+(?<description>.+)$/;

async function readMessage() {
  // Check command-line argument first
  if (process.argv[2]) {
    return process.argv[2];
  }

  // Otherwise read from stdin
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8').trim();
}

function validateCommitMessage(message) {
  if (!message || message.trim().length === 0) {
    return {
      valid: false,
      error: 'Empty commit message',
    };
  }

  // Get the first line (subject line)
  const lines = message.split('\n');
  const subject = lines[0].trim();

  // Match against conventional commit pattern
  const match = subject.match(CONVENTIONAL_COMMIT_REGEX);

  if (!match) {
    return {
      valid: false,
      error: `Invalid format: "${subject}"\nExpected: type(scope): description\nExample: feat(inventory): add barcode scanning`,
    };
  }

  const { type, scope, description } = match.groups;

  // Validate type
  if (!VALID_TYPES.includes(type)) {
    return {
      valid: false,
      error: `Invalid type: "${type}"\nValid types: ${VALID_TYPES.join(', ')}`,
    };
  }

  // Validate description
  if (!description || description.trim().length === 0) {
    return {
      valid: false,
      error: 'Missing description after type/scope',
    };
  }

  // Check description doesn't start with uppercase
  if (description[0] === description[0].toUpperCase() && description[0] !== description[0].toLowerCase()) {
    return {
      valid: false,
      error: `Description should start with lowercase: "${description}"`,
      suggestion: `Did you mean: ${type}${scope ? `(${scope})` : ''}: ${description[0].toLowerCase() + description.slice(1)}`,
    };
  }

  // Check description doesn't end with period
  if (description.endsWith('.')) {
    return {
      valid: false,
      error: 'Description should not end with a period',
    };
  }

  // Check subject line length (max 72 chars recommended)
  if (subject.length > 72) {
    return {
      valid: false,
      error: `Subject line too long (${subject.length} chars, recommended max 72)`,
    };
  }

  // Validate scope (if present) - should be lowercase
  if (scope && scope !== scope.toLowerCase()) {
    return {
      valid: false,
      error: `Scope should be lowercase: "${scope}"`,
      suggestion: `Did you mean: ${type}(${scope.toLowerCase()}): ${description}`,
    };
  }

  return {
    valid: true,
    type,
    scope: scope || null,
    description,
  };
}

async function main() {
  const message = await readMessage();
  const result = validateCommitMessage(message);

  if (result.valid) {
    console.log('Valid commit message');
    if (result.scope) {
      console.log(`  Type: ${result.type}`);
      console.log(`  Scope: ${result.scope}`);
    } else {
      console.log(`  Type: ${result.type}`);
    }
    console.log(`  Description: ${result.description}`);
    process.exit(0);
  } else {
    console.error('Invalid commit message');
    console.error(`  ${result.error}`);
    if (result.suggestion) {
      console.error(`  ${result.suggestion}`);
    }
    console.error('\nExpected format: type(scope): description');
    console.error(`Valid types: ${VALID_TYPES.join(', ')}`);
    console.error('\nExamples:');
    console.error('  feat(clients): add loyalty points tracking');
    console.error('  fix(transactions): correct discount calculation');
    console.error('  docs(readme): update installation instructions');
    console.error('  refactor(inventory): simplify stock update logic');
    console.error('  test(payments): add edge case coverage');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
