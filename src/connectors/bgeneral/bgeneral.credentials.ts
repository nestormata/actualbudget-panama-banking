import { ConfigError } from '../../shared/errors.js';

export interface SecurityQA {
  /** Case-insensitive regex pattern matched against the portal's question text. */
  readonly pattern: string;
  /** The answer to submit when the pattern matches. Never logged or serialised. */
  readonly answer: string;
}

export interface BgeneralCredentials {
  readonly username: string;
  readonly password: string;
  readonly securityQA: readonly SecurityQA[];
}

const EXPECTED_FORMAT =
  'BGENERAL_SECURITY_QA must be a JSON array of {"pattern":"<regex>","answer":"<answer>"} objects';

/**
 * Load and validate Banco General credentials from environment variables.
 * All three variables must be present; BGENERAL_SECURITY_QA must be valid JSON.
 * Throws ConfigError at call-time (before any browser is launched) on any problem.
 * Answers are never logged, serialised, or included in error messages.
 */
export function loadBgeneralCredentials(): BgeneralCredentials {
  const username = process.env['BGENERAL_USER'];
  if (!username) {
    throw new ConfigError(
      'Missing required environment variable: BGENERAL_USER',
      'BGENERAL_USER',
    );
  }

  const password = process.env['BGENERAL_PASS'];
  if (!password) {
    throw new ConfigError(
      'Missing required environment variable: BGENERAL_PASS',
      'BGENERAL_PASS',
    );
  }

  const rawQA = process.env['BGENERAL_SECURITY_QA'];
  if (!rawQA) {
    throw new ConfigError(
      `Missing required environment variable: BGENERAL_SECURITY_QA. ${EXPECTED_FORMAT}`,
      'BGENERAL_SECURITY_QA',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawQA);
  } catch {
    // Never include rawQA in the error — it contains sensitive answers
    throw new ConfigError(
      `BGENERAL_SECURITY_QA contains invalid JSON. ${EXPECTED_FORMAT}`,
      'BGENERAL_SECURITY_QA',
    );
  }

  if (!Array.isArray(parsed)) {
    throw new ConfigError(
      `BGENERAL_SECURITY_QA must be a JSON array. ${EXPECTED_FORMAT}`,
      'BGENERAL_SECURITY_QA',
    );
  }

  const securityQA: SecurityQA[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const entry = parsed[i] as Record<string, unknown>;
    if (typeof entry?.['pattern'] !== 'string' || !entry['pattern']) {
      throw new ConfigError(
        `BGENERAL_SECURITY_QA entry at index ${i} is missing a valid "pattern" string. ${EXPECTED_FORMAT}`,
        'BGENERAL_SECURITY_QA',
      );
    }
    if (typeof entry?.['answer'] !== 'string' || !entry['answer']) {
      throw new ConfigError(
        `BGENERAL_SECURITY_QA entry at index ${i} is missing a valid "answer" string. ${EXPECTED_FORMAT}`,
        'BGENERAL_SECURITY_QA',
      );
    }
    securityQA.push({ pattern: entry['pattern'], answer: entry['answer'] });
  }

  return { username, password, securityQA };
}
