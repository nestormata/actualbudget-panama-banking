import { describe, it, expect } from '@jest/globals';
import {
  BankConnectorError,
  AuthError,
  NetworkError,
  ParseError,
  ConnectorStateError,
} from '../../../src/shared/errors.js';

describe('Error hierarchy', () => {
  it('AuthError is instanceof BankConnectorError', () => {
    const err = new AuthError('globalbank-pa', 'bad creds');
    expect(err).toBeInstanceOf(BankConnectorError);
    expect(err).toBeInstanceOf(AuthError);
  });

  it('AuthError is NOT instanceof NetworkError', () => {
    const err = new AuthError('globalbank-pa', 'bad creds');
    expect(err).not.toBeInstanceOf(NetworkError);
  });

  it('NetworkError is instanceof BankConnectorError', () => {
    const err = new NetworkError('globalbank-pa', 'timeout');
    expect(err).toBeInstanceOf(BankConnectorError);
    expect(err).toBeInstanceOf(NetworkError);
  });

  it('ParseError carries selector property', () => {
    const err = new ParseError('globalbank-pa', 'element not found', '#loginBox');
    expect(err).toBeInstanceOf(BankConnectorError);
    expect(err.selector).toBe('#loginBox');
  });

  it('ConnectorStateError is instanceof BankConnectorError', () => {
    const err = new ConnectorStateError('globalbank-pa', 'not connected');
    expect(err).toBeInstanceOf(BankConnectorError);
    expect(err).toBeInstanceOf(ConnectorStateError);
  });

  it('all errors carry bankId', () => {
    const errors: BankConnectorError[] = [
      new AuthError('bank-1', 'msg'),
      new NetworkError('bank-2', 'msg'),
      new ParseError('bank-3', 'msg', 'sel'),
      new ConnectorStateError('bank-4', 'msg'),
    ];
    errors.forEach((e, i) => {
      expect(e.bankId).toBe(`bank-${i + 1}`);
    });
  });

  it('AuthError with challengeDetected flag', () => {
    const err = new AuthError('globalbank-pa', 'challenge', { challengeDetected: true });
    expect(err.challengeDetected).toBe(true);
  });
});
