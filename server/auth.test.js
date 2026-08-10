import { describe, it, expect, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { createRequireAuth, signAdminToken, hashPassword, verifyPassword } from './utils.js';

const SECRET = 'test-jwt-secret';

function mockRes() {
  return { status: vi.fn().mockReturnThis(), json: vi.fn() };
}

describe('requireAuth middleware (JWT)', () => {
  const requireAuth = createRequireAuth(SECRET);

  it('etibarlı token ilə next() çağırır', () => {
    const req = { headers: { 'x-admin-token': signAdminToken(SECRET) } };
    const res = mockRes();
    const next = vi.fn();
    requireAuth(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('yanlış secret ilə imzalanmış token-i qəbul etmir', () => {
    const req = { headers: { 'x-admin-token': signAdminToken('basqa-secret') } };
    const res = mockRes();
    const next = vi.fn();
    requireAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('müddəti bitmiş token-i qəbul etmir', () => {
    const expired = jwt.sign({ role: 'admin' }, SECRET, { expiresIn: '-1s' });
    const req = { headers: { 'x-admin-token': expired } };
    const res = mockRes();
    const next = vi.fn();
    requireAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('header olmadıqda 401 qaytarır', () => {
    const req = { headers: {} };
    const res = mockRes();
    const next = vi.fn();
    requireAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('köhnə x-admin-password header-ini qəbul etmir', () => {
    const req = { headers: { 'x-admin-password': 'test-password-123' } };
    const res = mockRes();
    const next = vi.fn();
    requireAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('şifrə hash-ləmə', () => {
  it('hash plain şifrədən fərqlidir və bcrypt formatındadır', async () => {
    const hash = await hashPassword('test-password-123');
    expect(hash).not.toBe('test-password-123');
    expect(hash).toMatch(/^\$2[aby]\$/);
  });

  it('düzgün şifrəni doğrulayır', async () => {
    const hash = await hashPassword('test-password-123');
    await expect(verifyPassword('test-password-123', hash)).resolves.toBe(true);
  });

  it('səhv şifrəni rədd edir', async () => {
    const hash = await hashPassword('test-password-123');
    await expect(verifyPassword('wrong', hash)).resolves.toBe(false);
  });

  it('boş dəyərlərdə false qaytarır', async () => {
    await expect(verifyPassword('', 'hash')).resolves.toBe(false);
    await expect(verifyPassword('pass', '')).resolves.toBe(false);
  });
});
