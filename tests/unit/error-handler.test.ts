import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../src/middlewares/error-handler.js';
import { AppError } from '../../src/utils/app-error.js';

function mockResponse() {
  const json = vi.fn();
  const status = vi.fn();
  const res = { status, json } as unknown as Response;
  status.mockReturnValue(res);
  return { res, status, json };
}

const req = {} as Request;
const next: NextFunction = vi.fn();

describe('errorHandler', () => {
  it('maps an AppError to its status and the standard error format', () => {
    const { res, status, json } = mockResponse();

    errorHandler(
      new AppError('CONFLICT', 409, 'Already exists', [{ field: 'name' }]),
      req,
      res,
      next,
    );

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'CONFLICT', message: 'Already exists', details: [{ field: 'name' }] },
    });
  });

  it('maps an unexpected error to 500 without leaking its message', () => {
    const { res, status, json } = mockResponse();

    errorHandler(new Error('database password=secret'), req, res, next);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error', details: [] },
    });
  });
});
