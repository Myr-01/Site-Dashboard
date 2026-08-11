import { describe, it, expect } from 'vitest';
import { parseAlertDays, normalizeAlertDays, DEFAULT_ALERT_DAYS } from './utils.js';

describe('parseAlertDays', () => {
  it('vergüllə ayrılmış günləri parse edir', () => {
    expect(parseAlertDays('30,7,1')).toEqual([30, 7, 1]);
  });

  it('boşluqları nəzərə almır', () => {
    expect(parseAlertDays(' 30 , 7 ,1 ')).toEqual([30, 7, 1]);
  });

  it('böyükdən kiçiyə sıralayır', () => {
    expect(parseAlertDays('1,30,7')).toEqual([30, 7, 1]);
  });

  it('dublikatları silir', () => {
    expect(parseAlertDays('3,3,1')).toEqual([3, 1]);
  });

  it('boş və null dəyərlərdə default qaytarır', () => {
    expect(parseAlertDays('')).toEqual([3, 1]);
    expect(parseAlertDays(null)).toEqual([3, 1]);
    expect(parseAlertDays(undefined)).toEqual([3, 1]);
  });

  it('tamamilə yanlış girişdə default qaytarır', () => {
    expect(parseAlertDays('abc')).toEqual([3, 1]);
    expect(parseAlertDays(',,,')).toEqual([3, 1]);
  });

  it('sıfır və mənfi günləri atır', () => {
    expect(parseAlertDays('0,-5,7')).toEqual([7]);
  });

  it('həddindən böyük günləri atır (>3650)', () => {
    expect(parseAlertDays('9999,3')).toEqual([3]);
  });

  it('sərhəd dəyəri 3650-i qəbul edir', () => {
    expect(parseAlertDays('3650')).toEqual([3650]);
  });
});

describe('normalizeAlertDays', () => {
  it('DB üçün normal string qaytarır', () => {
    expect(normalizeAlertDays(' 1, 30 ,7')).toBe('30,7,1');
  });

  it('yanlış girişdə default string qaytarır', () => {
    expect(normalizeAlertDays('zibil')).toBe(DEFAULT_ALERT_DAYS);
  });
});
