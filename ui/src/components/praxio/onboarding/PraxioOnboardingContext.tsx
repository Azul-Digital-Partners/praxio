import { createContext, useContext, type ReactNode } from 'react';
import type { PraxioOnboardingApi } from './usePraxioOnboarding';

const Ctx = createContext<PraxioOnboardingApi | null>(null);

export function PraxioOnboardingProvider({
  api,
  children,
}: {
  api: PraxioOnboardingApi;
  children: ReactNode;
}) {
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function usePraxioOnboardingContext(): PraxioOnboardingApi {
  const value = useContext(Ctx);
  if (!value) {
    throw new Error('usePraxioOnboardingContext must be used inside <PraxioOnboardingProvider>');
  }
  return value;
}
