# /debug — Debug Walkthrough

**Trigger:** `/debug [error message or behavior description]`

**Output:** Root cause hypothesis, reproduction steps, fix recommendation, test to verify fix

**Steps:**
1. Read the full error trace or symptom description
2. Form 2-3 hypotheses about root cause, ranked by likelihood
3. For each: what would confirm it, what would rule it out
4. Recommend one fix with confidence level
5. Write a test that would catch this regression
