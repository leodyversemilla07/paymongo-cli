import { vi } from 'vitest';

const originalFn = vi.fn.bind(vi);

function wrapImplementation<T extends (...args: any[]) => any>(implementation: T): T {
  return function wrappedImplementation(this: unknown, ...args: Parameters<T>): ReturnType<T> {
    return implementation.apply(this, args);
  } as T;
}

vi.fn = ((implementation?: (...args: any[]) => any) => {
  const mock = implementation ? originalFn(wrapImplementation(implementation)) : originalFn();

  const originalMockImplementation = mock.mockImplementation.bind(mock);
  mock.mockImplementation = ((nextImplementation: (...args: any[]) => any) => {
    return originalMockImplementation(wrapImplementation(nextImplementation));
  }) as typeof mock.mockImplementation;

  const originalMockImplementationOnce = mock.mockImplementationOnce.bind(mock);
  mock.mockImplementationOnce = ((nextImplementation: (...args: any[]) => any) => {
    return originalMockImplementationOnce(wrapImplementation(nextImplementation));
  }) as typeof mock.mockImplementationOnce;

  return mock;
}) as typeof vi.fn;
