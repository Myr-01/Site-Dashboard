import { describe, it, expect } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useEnterAnimation } from './useEnterAnimation';

describe('useEnterAnimation', () => {
  it('başlanğıcda false qaytarır, sonra true olur', async () => {
    const { result } = renderHook(() => useEnterAnimation());
    // İlkin render-də false olmalıdır
    expect(result.current).toBe(false);
    // rAF-dan sonra true olmalıdır
    await waitFor(() => expect(result.current).toBe(true));
  });
});
