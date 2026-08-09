import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

function ThrowingComponent(): JSX.Element {
  throw new Error('Test error');
}

describe('ErrorBoundary', () => {
  it('normal render zamanı children göstərir', () => {
    render(
      <ErrorBoundary>
        <div>Normal content</div>
      </ErrorBoundary>
    );
    expect(screen.getByText('Normal content')).toBeDefined();
  });

  it('xəta baş verəndə fallback UI göstərir', () => {
    const originalError = console.error;
    console.error = vi.fn();
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );
    expect(screen.getByText('Bir xəta baş verdi')).toBeDefined();
    console.error = originalError;
  });
});
