import { connectorRegistry } from '../shared/connector-registry.js';
import { GlobalBankConnector } from './globalbank/globalbank.connector.js';
import { createBGeneralConnector } from './bgeneral/bgeneral.connector.js';

/**
 * Register all bank connectors.
 * Import this module once at application startup (before running the orchestrator).
 */
connectorRegistry.register('globalbank-pa', () => {
  const username = process.env['GLOBALBANK_USER'];
  const password = process.env['GLOBALBANK_PASS'];
  if (!username || !password) {
    throw new Error('GLOBALBANK_USER and GLOBALBANK_PASS environment variables are required');
  }
  return new GlobalBankConnector({ username, password });
});

// Credentials are loaded from BGENERAL_USER, BGENERAL_PASS, BGENERAL_SECURITY_QA
// at instantiation time inside createBGeneralConnector().
connectorRegistry.register('bgeneral-pa', () => createBGeneralConnector());

export { connectorRegistry };
