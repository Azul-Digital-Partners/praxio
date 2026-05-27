// usePraxioOnboarding — the wizard's state machine.
//
// Responsibilities:
//   - Hold the live onboarding state object.
//   - Hydrate from persistence on mount; resume at the last incomplete step
//     (AZU-736 acceptance criterion).
//   - Provide setField / next / back / reset.
//   - Enforce the Step 2 hard gate: re-entering Step 2 from any direction
//     clears `apiKeyValidated` so the user must re-validate before
//     advancing.
//   - Persist on every mutation.
//
// This hook is intentionally framework-thin: no React Query, no routing.
// The wizard container component wires it up.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PRAXIO_ONBOARDING_TOTAL_STEPS,
  isOnboardingComplete,
  makeEmptyState,
  nextIncompleteStep,
  type PraxioOnboardingState,
  type PraxioOnboardingStepIndex,
} from './types';
import {
  clearOnboardingState,
  loadOnboardingState,
  saveOnboardingState,
  type StorageAdapter,
} from './storage';

export interface UsePraxioOnboardingOptions {
  storage?: StorageAdapter | null;
  /** Override the resumed step (useful for tests / linking deep into the
   *  wizard). When omitted, the hook resumes at the last incomplete step. */
  initialStep?: PraxioOnboardingStepIndex;
  /** Inject `now()` for deterministic tests. */
  now?: () => string;
}

export interface PraxioOnboardingApi {
  state: PraxioOnboardingState;
  currentStep: PraxioOnboardingStepIndex;
  totalSteps: number;
  isComplete: boolean;
  setField: <K extends keyof PraxioOnboardingState>(field: K, value: PraxioOnboardingState[K]) => void;
  patch: (partial: Partial<PraxioOnboardingState>) => void;
  goTo: (step: PraxioOnboardingStepIndex) => void;
  next: () => void;
  back: () => void;
  complete: () => void;
  reset: () => void;
}

function clampStep(step: number): PraxioOnboardingStepIndex {
  if (step < 1) return 1;
  if (step > PRAXIO_ONBOARDING_TOTAL_STEPS) return PRAXIO_ONBOARDING_TOTAL_STEPS as PraxioOnboardingStepIndex;
  return step as PraxioOnboardingStepIndex;
}

export function usePraxioOnboarding(opts: UsePraxioOnboardingOptions = {}): PraxioOnboardingApi {
  const { storage, initialStep, now } = opts;

  const [state, setState] = useState<PraxioOnboardingState>(() => {
    const loaded = loadOnboardingState(storage);
    return loaded ?? makeEmptyState(now);
  });

  const [currentStep, setCurrentStep] = useState<PraxioOnboardingStepIndex>(() => {
    if (initialStep) return clampStep(initialStep);
    const loaded = loadOnboardingState(storage);
    const baseline = loaded ?? makeEmptyState(now);
    return nextIncompleteStep(baseline);
  });

  // Persist on every state mutation.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      // Persist a fresh state on first mount so refresh-before-edit still
      // resumes correctly.
      saveOnboardingState(state, storage);
      return;
    }
    saveOnboardingState(state, storage);
  }, [state, storage]);

  const setField = useCallback<PraxioOnboardingApi['setField']>((field, value) => {
    setState((prev) => ({ ...prev, [field]: value }));
  }, []);

  const patch = useCallback<PraxioOnboardingApi['patch']>((partial) => {
    setState((prev) => ({ ...prev, ...partial }));
  }, []);

  const goTo = useCallback<PraxioOnboardingApi['goTo']>(
    (step) => {
      const target = clampStep(step);
      setCurrentStep((prev) => {
        // Step 2 hard gate: re-entry from any other step (forward OR back)
        // requires re-validation. We clear the validated flag here, leaving
        // the masked tail in place for display continuity.
        if (target === 2 && prev !== 2) {
          setState((s) => (s.apiKeyValidated ? { ...s, apiKeyValidated: false } : s));
        }
        return target;
      });
      setState((prev) => ({ ...prev, lastStep: target }));
    },
    [],
  );

  const next = useCallback(() => {
    setCurrentStep((prev) => {
      const target = clampStep(prev + 1);
      setState((s) => ({ ...s, lastStep: target }));
      return target;
    });
  }, []);

  const back = useCallback(() => {
    setCurrentStep((prev) => {
      if (prev <= 1) return prev;
      const target = clampStep(prev - 1);
      // Hard-gate re-entry: if we're stepping back INTO Step 2, force re-validation.
      if (target === 2) {
        setState((s) => (s.apiKeyValidated ? { ...s, apiKeyValidated: false, lastStep: target } : { ...s, lastStep: target }));
      } else {
        setState((s) => ({ ...s, lastStep: target }));
      }
      return target;
    });
  }, []);

  const complete = useCallback(() => {
    setState((prev) => ({
      ...prev,
      completedAt: (now ?? (() => new Date().toISOString()))(),
      lastStep: PRAXIO_ONBOARDING_TOTAL_STEPS as PraxioOnboardingStepIndex,
    }));
    setCurrentStep(PRAXIO_ONBOARDING_TOTAL_STEPS as PraxioOnboardingStepIndex);
  }, [now]);

  const reset = useCallback(() => {
    clearOnboardingState(storage);
    const fresh = makeEmptyState(now);
    setState(fresh);
    setCurrentStep(1);
  }, [storage, now]);

  return useMemo<PraxioOnboardingApi>(
    () => ({
      state,
      currentStep,
      totalSteps: PRAXIO_ONBOARDING_TOTAL_STEPS,
      isComplete: isOnboardingComplete(state),
      setField,
      patch,
      goTo,
      next,
      back,
      complete,
      reset,
    }),
    [state, currentStep, setField, patch, goTo, next, back, complete, reset],
  );
}
