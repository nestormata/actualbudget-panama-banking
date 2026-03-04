/** Base class for all bank connector errors. */
export class BankConnectorError extends Error {
  public readonly bankId: string;

  constructor(bankId: string, message: string) {
    super(message);
    this.name = 'BankConnectorError';
    this.bankId = bankId;
    // Restore prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Thrown when authentication fails (wrong credentials, locked account, etc.). */
export class AuthError extends BankConnectorError {
  public readonly challengeDetected: boolean;

  constructor(
    bankId: string,
    message: string,
    options: { challengeDetected?: boolean } = {},
  ) {
    super(bankId, message);
    this.name = 'AuthError';
    this.challengeDetected = options.challengeDetected ?? false;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Thrown when a network / connectivity failure occurs. */
export class NetworkError extends BankConnectorError {
  constructor(bankId: string, message: string) {
    super(bankId, message);
    this.name = 'NetworkError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Thrown when the portal HTML does not match the expected structure. */
export class ParseError extends BankConnectorError {
  /** The CSS selector or description of what was expected. */
  public readonly selector: string;

  constructor(bankId: string, message: string, selector: string) {
    super(bankId, message);
    this.name = 'ParseError';
    this.selector = selector;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Thrown when a connector method is called in an invalid lifecycle state. */
export class ConnectorStateError extends BankConnectorError {
  constructor(bankId: string, message: string) {
    super(bankId, message);
    this.name = 'ConnectorStateError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Thrown when configuration is invalid or missing required fields. */
export class ConfigError extends Error {
  public readonly field?: string;

  constructor(message: string, field?: string) {
    super(message);
    this.name = 'ConfigError';
    this.field = field;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
