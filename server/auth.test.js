import { describe, it, expect, vi } from 'vitest';
import { createRequireAuth } from './utils.js';

describe('requireAuth middleware', () => {
  const requireAuth = createRequireAuth('test-password-123');

  it('düzgün şifrə ilə next() çağırır', () => {
    const req = { headers: { 'x-admin-password': 'test-password-123' } };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();
    requireAuth(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('səhv şifrə ilə 401 qaytarır', () => {
    const req = { headers: { 'x-admin-password': 'wrong' } };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();
    requireAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('header olmadıqda 401 qaytarır', () => {
    const req = { headers: {} };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();
    requireAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
