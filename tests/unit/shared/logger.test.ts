import { describe, it, expect } from '@jest/globals';
import { createLogger } from '../../../src/shared/logger.js';
import { AuthError } from '../../../src/shared/errors.js';

describe('Logger redaction', () => {
  it('does not include password in log output for AuthError', () => {
    const logLines: string[] = [];
    // Create a logger that writes to our array instead of stdout
    const logger = createLogger({ bankId: 'globalbank-pa' }, (line: string) => logLines.push(line));

    const err = new AuthError('globalbank-pa', 'login failed');
    logger.error({ err, password: 'mySecretPassword123', j_password: 'alsoSecret' }, 'Auth failed');

    const combined = logLines.join('\n');
    expect(combined).not.toContain('mySecretPassword123');
    expect(combined).not.toContain('alsoSecret');
    expect(combined).toContain('Auth failed');
  });

  it('logs bankId in context', () => {
    const logLines: string[] = [];
    const logger = createLogger({ bankId: 'test-bank' }, (line: string) => logLines.push(line));
    logger.info('test message');
    expect(logLines.join('\n')).toContain('test-bank');
  });
});
