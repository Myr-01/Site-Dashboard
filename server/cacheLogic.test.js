import { describe, it, expect } from 'vitest';
import { shouldRefreshCache } from './utils.js';

describe('shouldRefreshCache', () => {
  it('heç vaxt yoxlanmayıbsa true qaytarır', () => {
    expect(shouldRefreshCache(null, 12)).toBe(true);
  });

  it('undefined olduqda true qaytarır', () => {
    expect(shouldRefreshCache(undefined, 12)).toBe(true);
  });

  it('keş müddəti keçməyibsə false qaytarır', () => {
    const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    expect(shouldRefreshCache(oneHourAgo, 12)).toBe(false);
  });

  it('keş müddəti keçibsə true qaytarır', () => {
    const thirteenHoursAgo = new Date(Date.now() - 13 * 60 * 60 * 1000).toISOString();
    expect(shouldRefreshCache(thirteenHoursAgo, 12)).toBe(true);
  });

  it('tam müddət həddi olduqda true qaytarır', () => {
    const exactly12HoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000 - 1).toISOString();
    expect(shouldRefreshCache(exactly12HoursAgo, 12)).toBe(true);
  });
});
