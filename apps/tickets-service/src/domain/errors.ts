export type DomainErrorCode = 'not_found' | 'invalid_state' | 'validation';

const HTTP_STATUS: Record<DomainErrorCode, number> = {
  not_found: 404,
  invalid_state: 409,
  validation: 400,
};

export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
  }

  get httpStatus(): number {
    return HTTP_STATUS[this.code];
  }
}
