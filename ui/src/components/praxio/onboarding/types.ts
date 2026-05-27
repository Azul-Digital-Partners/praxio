// Praxio onboarding wizard — shared types.
//
// Implements AZU-736 (Phase B: wizard shell, routing, state persistence).
// Step shape derived from the AZU-719 wizard spec (Branching Logic section).

export const PRAXIO_ONBOARDING_STORAGE_KEY = 'praxio.onboarding.v1';
export const PRAXIO_ONBOARDING_TOTAL_STEPS = 7;

/** Step index — 1..7 (1-based for human-readable UI), 0 = "not started". */
export type PraxioOnboardingStepIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** Roles offered as quick-pick in Step 3 (free text via 'other'). */
export type PraxioRole =
  | 'fractional-cfo'
  | 'fractional-cmo'
  | 'fractional-coo'
  | 'founder'
  | 'executive'
  | 'consultant'
  | 'other';

/** Tool categories shown in Step 4 (work context). */
export type PraxioToolCategory =
  | 'messaging'
  | 'calendar'
  | 'crm'
  | 'project-management'
  | 'finance';

/** Primary-tier tools (push delivery, Step 5). */
export type PraxioPrimaryTool = 'slack' | 'gmail' | 'outlook' | 'teams';

/** Secondary-tier tools (context/read, Step 5). */
export type PraxioSecondaryTool =
  | 'google-calendar'
  | 'outlook-calendar'
  | 'notion'
  | 'hubspot'
  | 'salesforce';

export interface PraxioToolConnection {
  tool: PraxioPrimaryTool | PraxioSecondaryTool;
  status: 'connected' | 'skipped' | 'pending';
  /** Free-form metadata (e.g. selected channel for Slack). */
  meta?: Record<string, string>;
  connectedAt?: string;
}

export interface PraxioOnboardingState {
  /** Schema version — bump if state shape changes incompatibly. */
  version: 1;

  /** Last step the user reached (1..7). 0 = not started. */
  lastStep: PraxioOnboardingStepIndex;

  /** Step 1 — Name your CoS. Default "Rosalind" accepted, but never empty. */
  cosName: string;

  /** Step 2 — Claude API key validation state.
   *  apiKey itself is NOT persisted by the wizard (handled by a secure
   *  ApiKeyStore so the raw secret never lives in localStorage). */
  apiKeyValidated: boolean;
  apiKeyMaskedTail: string | null; // e.g. "…abcd" for display only

  /** Step 3 — About You. */
  userName: string;
  userRole: PraxioRole | null;
  userRoleOther: string;
  topPriority: string;
  timezone: string;

  /** Step 4 — Work Context. */
  businessName: string;
  businessOneLiner: string;
  toolCategories: PraxioToolCategory[];

  /** Step 5 — Tool Connections. */
  toolConnections: PraxioToolConnection[];
  defaultDeliveryChannel: PraxioPrimaryTool | null;

  /** Step 6 — Goals. */
  focusTheme: string;
  topGoals: string[];
  cycleEndDate: string | null;

  /** Wizard lifecycle. */
  completedAt: string | null;
  startedAt: string;
}

export function makeEmptyState(now: () => string = () => new Date().toISOString()): PraxioOnboardingState {
  return {
    version: 1,
    lastStep: 0,
    cosName: 'Rosalind',
    apiKeyValidated: false,
    apiKeyMaskedTail: null,
    userName: '',
    userRole: null,
    userRoleOther: '',
    topPriority: '',
    timezone: typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC',
    businessName: '',
    businessOneLiner: '',
    toolCategories: [],
    toolConnections: [],
    defaultDeliveryChannel: null,
    focusTheme: '',
    topGoals: [],
    cycleEndDate: null,
    completedAt: null,
    startedAt: now(),
  };
}

/** Is the given step satisfied by the current state? Used for resume logic. */
export function isStepComplete(state: PraxioOnboardingState, step: PraxioOnboardingStepIndex): boolean {
  switch (step) {
    case 0:
      return true;
    case 1:
      return state.cosName.trim().length > 0;
    case 2:
      return state.apiKeyValidated === true;
    case 3:
      // Name required, others optional.
      return state.userName.trim().length > 0;
    case 4:
      return true; // fully skippable
    case 5:
      // Either ≥1 primary tool connected OR user explicitly skipped all primaries.
      // "skipped" entries count as an explicit acknowledgement.
      return state.toolConnections.length > 0;
    case 6:
      return true; // optional
    case 7:
      return state.completedAt !== null;
    default:
      return false;
  }
}

/** First step whose acceptance criteria are NOT yet satisfied (1..7). */
export function nextIncompleteStep(state: PraxioOnboardingState): PraxioOnboardingStepIndex {
  for (let step = 1 as PraxioOnboardingStepIndex; step <= PRAXIO_ONBOARDING_TOTAL_STEPS; step = (step + 1) as PraxioOnboardingStepIndex) {
    if (!isStepComplete(state, step)) {
      return step;
    }
  }
  return PRAXIO_ONBOARDING_TOTAL_STEPS;
}

export function isOnboardingComplete(state: PraxioOnboardingState): boolean {
  return state.completedAt !== null;
}
