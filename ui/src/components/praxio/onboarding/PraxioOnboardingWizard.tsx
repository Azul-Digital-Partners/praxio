// PraxioOnboardingWizard — multi-step wizard container for the Praxio
// first-run experience (AZU-736).
//
// Routing model: in-memory step index, not URL-based. The Praxio shell is
// an Electron desktop app; URL state is not a meaningful navigation
// affordance for first-run. State is persisted to localStorage by the hook
// so the user resumes at the last incomplete step.

import { Button } from '@/components/ui/button';
import { PraxioOnboardingProvider } from './PraxioOnboardingContext';
import {
  usePraxioOnboarding,
  type PraxioOnboardingApi,
  type UsePraxioOnboardingOptions,
} from './usePraxioOnboarding';
import { isStepComplete, type PraxioOnboardingStepIndex } from './types';
import { Step1Name } from './steps/Step1Name';
import { Step2ApiKey } from './steps/Step2ApiKey';
import { Step3AboutYou } from './steps/Step3AboutYou';
import { Step4Work } from './steps/Step4Work';
import { Step5Tools } from './steps/Step5Tools';
import { Step6Goals } from './steps/Step6Goals';
import { Step7Meet } from './steps/Step7Meet';

export interface PraxioOnboardingWizardProps extends UsePraxioOnboardingOptions {
  /** Fired when the user finishes Step 7 successfully. */
  onComplete?: (api: PraxioOnboardingApi) => void;
}

function ProgressIndicator({ currentStep, totalSteps }: { currentStep: number; totalSteps: number }) {
  return (
    <div className="flex items-center gap-2" data-testid="praxio-progress">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">
        Step {currentStep} of {totalSteps}
      </span>
      <div className="flex flex-1 gap-1">
        {Array.from({ length: totalSteps }, (_, i) => i + 1).map((n) => (
          <div
            key={n}
            data-testid={`praxio-progress-dot-${n}`}
            data-active={n <= currentStep ? 'true' : 'false'}
            className={
              'h-1 flex-1 rounded-full ' + (n <= currentStep ? 'bg-primary' : 'bg-muted')
            }
          />
        ))}
      </div>
    </div>
  );
}

function StepBody({ step }: { step: PraxioOnboardingStepIndex }) {
  switch (step) {
    case 1:
      return <Step1Name />;
    case 2:
      return <Step2ApiKey />;
    case 3:
      return <Step3AboutYou />;
    case 4:
      return <Step4Work />;
    case 5:
      return <Step5Tools />;
    case 6:
      return <Step6Goals />;
    case 7:
      return <Step7Meet />;
    default:
      return null;
  }
}

export function PraxioOnboardingWizard(props: PraxioOnboardingWizardProps) {
  const { onComplete, ...hookOpts } = props;
  const api = usePraxioOnboarding(hookOpts);
  const { state, currentStep, totalSteps, back, next, complete } = api;

  const canAdvance = isStepComplete(state, currentStep);
  const isLast = currentStep === totalSteps;

  function handleNext() {
    if (isLast) {
      complete();
      onComplete?.(api);
      return;
    }
    if (!canAdvance) return;
    next();
  }

  return (
    <PraxioOnboardingProvider api={api}>
      <div
        className="mx-auto flex h-full w-full max-w-2xl flex-col gap-6 p-8"
        data-testid="praxio-onboarding-wizard"
        data-current-step={currentStep}
      >
        <ProgressIndicator currentStep={currentStep} totalSteps={totalSteps} />
        <div className="flex-1 overflow-auto">
          <StepBody step={currentStep} />
        </div>
        <div className="flex items-center justify-between border-t border-border pt-4">
          <Button
            variant="outline"
            data-testid="praxio-back"
            disabled={currentStep === 1}
            onClick={back}
          >
            Back
          </Button>
          <Button
            data-testid="praxio-next"
            // Step 7 is a passive review screen — its completion happens by
            // clicking Start, so don't gate the button on isStepComplete
            // (which only flips true after `complete()` fires). For earlier
            // steps, `canAdvance` is the correct gate.
            disabled={!isLast && !canAdvance}
            onClick={handleNext}
          >
            {isLast ? 'Start' : 'Continue'}
          </Button>
        </div>
      </div>
    </PraxioOnboardingProvider>
  );
}
