import { describe, it, expect } from 'vitest';
import { isSafeFilename } from './utils.js';

describe('isSafeFilename', () => {
  it('normal fayl adını qəbul edir', () => {
    expect(isSafeFilename('backup_2026-01-01.db')).toBe(true);
  });

  it('boşluqlu fayl adını qəbul edir', () => {
    expect(isSafeFilename('my backup file.db')).toBe(true);
  });

  it('".." olan fayl adını rədd edir', () => {
    expect(isSafeFilename('../../etc/passwd')).toBe(false);
  });

  it('"/" olan fayl adını rədd edir', () => {
    expect(isSafeFilename('folder/file.db')).toBe(false);
  });

  it('"\\" olan fayl adını rədd edir', () => {
    expect(isSafeFilename('folder\\file.db')).toBe(false);
  });

  it('boş string-i rədd edir', () => {
    expect(isSafeFilename('')).toBe(false);
  });

  it('null-u rədd edir', () => {
    expect(isSafeFilename(null)).toBe(false);
  });

  it('undefined-u rədd edir', () => {
    expect(isSafeFilename(undefined)).toBe(false);
  });

  it('rəqəm tipini rədd edir', () => {
    expect(isSafeFilename(123)).toBe(false);
  });
});
