// PraxioOnboardingGate — first-run gate for the Praxio Conversations
// experience. Renders the onboarding wizard when persisted state shows
// onboarding is incomplete; otherwise renders children unchanged.
//
// This is intentionally a thin wrapper around the hook + wizard so callers
// can drop it at the top of Conversations.tsx without further wiring.

import { type ReactNode, useState } from 'react';
import { loadOnboardingState } from './storage';
import { isOnboardingComplete } from './types';
import { PraxioOnboardingWizard } from './PraxioOnboardingWizard';

export function PraxioOnboardingGate({ children }: { children: ReactNode }) {
  const [completed, setCompleted] = useState<boolean>(() => {
    const persisted = loadOnboardingState();
    return persisted ? isOnboardingComplete(persisted) : false;
  });

  if (completed) return <>{children}</>;

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background text-foreground">
      <PraxioOnboardingWizard onComplete={() => setCompleted(true)} />
    </div>
  );
}
