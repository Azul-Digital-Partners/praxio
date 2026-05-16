# /test — Write Test Cases

**Trigger:** `/test [function name, feature description, or file]`

**Output:** Test file with: happy path, edge cases, failure cases

**Steps:**
1. Identify the function or feature boundary
2. Write tests: happy path first, then edge cases (empty input, boundary values, null), then failure cases (invalid input, external dependency failure)
3. Use the project's existing test framework (check package.json for vitest/jest/pytest)
4. Name tests descriptively: what the behavior is, not what the function is called
