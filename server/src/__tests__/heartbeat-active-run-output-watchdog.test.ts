import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  agents,
  companies,
  createDb,
  heartbeatRunEvents,
  heartbeatRunWatchdogDecisions,
  heartbeatRuns,
  issueRelations,
  issues,
} from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import {
  ACTIVE_RUN_OUTPUT_CONTINUE_REARM_MS,
  ACTIVE_RUN_OUTPUT_CRITICAL_THRESHOLD_MS,
  ACTIVE_RUN_OUTPUT_SUSPICION_THRESHOLD_MS,
  heartbeatService,
} from "../services/heartbeat.ts";
import {
  recoveryService,
  STUCK_RUN_AUTO_CANCEL_UNRESOLVED_CYCLES,
} from "../services/recovery/service.ts";
import { getRunLogStore } from "../services/run-log-store.ts";

const mockAdapterExecute = vi.hoisted(() =>
  vi.fn(async () => ({
    exitCode: 0,
    signal: null,
    timedOut: false,
    errorMessage: null,
    summary: "Acknowledged stale-run evaluation.",
    provider: "test",
    model: "test-model",
  })),
);

vi.mock("../telemetry.ts", () => ({
  getTelemetryClient: () => ({ track: vi.fn() }),
}));

vi.mock("@paperclipai/shared/telemetry", async () => {
  const actual = await vi.importActual<typeof import("@paperclipai/shared/telemetry")>(
    "@paperclipai/shared/telemetry",
  );
  return {
    ...actual,
    trackAgentFirstHeartbeat: vi.fn(),
  };
});

vi.mock("../adapters/index.ts", async () => {
  const actual = await vi.importActual<typeof import("../adapters/index.ts")>("../adapters/index.ts");
  return {
    ...actual,
    getServerAdapter: vi.fn(() => ({
      supportsLocalAgentJwt: false,
      execute: mockAdapterExecute,
    })),
  };
});

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres active-run output watchdog tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("active-run output watchdog", () => {
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  let db: ReturnType<typeof createDb>;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-active-run-output-watchdog-");
    db = createDb(tempDb.connectionString);
  }, 30_000);

  afterEach(async () => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const activeRuns = await db
        .select({ id: heartbeatRuns.id })
        .from(heartbeatRuns)
        .where(sql`${heartbeatRuns.status} in ('queued', 'running')`);
      if (activeRuns.length === 0) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    await db.execute(sql.raw(`TRUNCATE TABLE "companies" CASCADE`));
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  async function seedRunningRun(opts: { now: Date; ageMs: number; withOutput?: boolean; logChunk?: string }) {
    const companyId = randomUUID();
    const managerId = randomUUID();
    const coderId = randomUUID();
    const issueId = randomUUID();
    const runId = randomUUID();
    const issuePrefix = `W${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
    const startedAt = new Date(opts.now.getTime() - opts.ageMs);
    const lastOutputAt = opts.withOutput ? new Date(opts.now.getTime() - 5 * 60 * 1000) : null;

    await db.insert(companies).values({
      id: companyId,
      name: "Watchdog Co",
      issuePrefix,
      requireBoardApprovalForNewAgents: false,
    });
    await db.insert(agents).values([
      {
        id: managerId,
        companyId,
        name: "CTO",
        role: "cto",
        status: "idle",
        adapterType: "codex_local",
        adapterConfig: {},
        runtimeConfig: {},
        permissions: {},
      },
      {
        id: coderId,
        companyId,
        name: "Coder",
        role: "engineer",
        status: "running",
        reportsTo: managerId,
        adapterType: "codex_local",
        adapterConfig: {},
        runtimeConfig: {},
        permissions: {},
      },
    ]);
    await db.insert(issues).values({
      id: issueId,
      companyId,
      title: "Long running implementation",
      status: "in_progress",
      priority: "medium",
      assigneeAgentId: coderId,
      issueNumber: 1,
      identifier: `${issuePrefix}-1`,
      updatedAt: startedAt,
      createdAt: startedAt,
    });
    await db.insert(heartbeatRuns).values({
      id: runId,
      companyId,
      agentId: coderId,
      status: "running",
      invocationSource: "assignment",
      triggerDetail: "system",
      startedAt,
      processStartedAt: startedAt,
      lastOutputAt,
      lastOutputSeq: opts.withOutput ? 3 : 0,
      lastOutputStream: opts.withOutput ? "stdout" : null,
      contextSnapshot: { issueId },
      stdoutExcerpt: "OPENAI_API_KEY=sk-test-secret-value should not leak",
      logBytes: 0,
    });
    if (opts.logChunk) {
      const store = getRunLogStore();
      const handle = await store.begin({ companyId, agentId: coderId, runId });
      const logBytes = await store.append(handle, {
        stream: "stdout",
        chunk: opts.logChunk,
        ts: startedAt.toISOString(),
      });
      await db
        .update(heartbeatRuns)
        .set({
          logStore: handle.store,
          logRef: handle.logRef,
          logBytes,
        })
        .where(eq(heartbeatRuns.id, runId));
    }
    await db.update(issues).set({ executionRunId: runId }).where(eq(issues.id, issueId));
    return { companyId, managerId, coderId, issueId, runId, issuePrefix };
  }

  it("creates one medium-priority evaluation issue for a suspicious silent run", async () => {
    const now = new Date("2026-04-22T20:00:00.000Z");
    const { companyId, managerId, runId } = await seedRunningRun({
      now,
      ageMs: ACTIVE_RUN_OUTPUT_SUSPICION_THRESHOLD_MS + 60_000,
    });
    const heartbeat = heartbeatService(db);

    const first = await heartbeat.scanSilentActiveRuns({ now, companyId });
    const second = await heartbeat.scanSilentActiveRuns({ now, companyId });

    expect(first.created).toBe(1);
    expect(second.created).toBe(0);
    expect(second.existing).toBe(1);

    const evaluations = await db
      .select()
      .from(issues)
      .where(and(eq(issues.companyId, companyId), eq(issues.originKind, "stale_active_run_evaluation")));
    expect(evaluations).toHaveLength(1);
    expect(["todo", "in_progress"]).toContain(evaluations[0]?.status);
    expect(evaluations[0]).toMatchObject({
      priority: "medium",
      assigneeAgentId: managerId,
      assigneeAdapterOverrides: { modelProfile: "cheap" },
      originId: runId,
      originFingerprint: `stale_active_run:${companyId}:${runId}`,
    });
    expect(evaluations[0]?.description).toContain("Decision Checklist");
    expect(evaluations[0]?.description).not.toContain("sk-test-secret-value");
  });

  it("redacts sensitive values from actual run-log evidence", async () => {
    const now = new Date("2026-04-22T20:00:00.000Z");
    const leakedJwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    const leakedGithubToken = "ghp_1234567890abcdefghijklmnopqrstuvwxyz";
    const { companyId } = await seedRunningRun({
      now,
      ageMs: ACTIVE_RUN_OUTPUT_SUSPICION_THRESHOLD_MS + 60_000,
      logChunk: [
        "Authorization: Bearer live-bearer-token-value",
        `POST payload {"apiKey":"json-secret-value","token":"${leakedJwt}"}`,
        `GITHUB_TOKEN=${leakedGithubToken}`,
      ].join("\n"),
    });
    const heartbeat = heartbeatService(db);

    await heartbeat.scanSilentActiveRuns({ now, companyId });

    const [evaluation] = await db
      .select()
      .from(issues)
      .where(and(eq(issues.companyId, companyId), eq(issues.originKind, "stale_active_run_evaluation")));
    expect(evaluation?.description).toContain("***REDACTED***");
    expect(evaluation?.description).not.toContain("live-bearer-token-value");
    expect(evaluation?.description).not.toContain("json-secret-value");
    expect(evaluation?.description).not.toContain(leakedJwt);
    expect(evaluation?.description).not.toContain(leakedGithubToken);
  });

  it("raises critical stale-run evaluations and blocks the source issue", async () => {
    const now = new Date("2026-04-22T20:00:00.000Z");
    const { companyId, issueId } = await seedRunningRun({
      now,
      ageMs: ACTIVE_RUN_OUTPUT_CRITICAL_THRESHOLD_MS + 60_000,
    });
    const heartbeat = heartbeatService(db);

    const result = await heartbeat.scanSilentActiveRuns({ now, companyId });

    expect(result.created).toBe(1);
    const [evaluation] = await db
      .select()
      .from(issues)
      .where(and(eq(issues.companyId, companyId), eq(issues.originKind, "stale_active_run_evaluation")));
    expect(evaluation?.priority).toBe("high");

    const [blocker] = await db
      .select()
      .from(issueRelations)
      .where(and(eq(issueRelations.companyId, companyId), eq(issueRelations.relatedIssueId, issueId)));
    expect(blocker?.issueId).toBe(evaluation?.id);

    const [source] = await db.select().from(issues).where(eq(issues.id, issueId));
    expect(source?.status).toBe("blocked");
  });

  it("auto-recovers after N consecutive watchdog reviews on the same run id (AZU-2927)", async () => {
    const now = new Date("2026-04-22T20:00:00.000Z");
    const { companyId, managerId, issueId, runId, coderId } = await seedRunningRun({
      now,
      ageMs: ACTIVE_RUN_OUTPUT_SUSPICION_THRESHOLD_MS + 60_000,
    });

    // Simulate three prior watchdog reviews where the triager closed `done` and
    // (via AZU-2899's implicit-continue path) a `continue` decision was recorded.
    // The fourth scan tick should hit the N=3 auto-recovery branch instead of
    // spawning another eval issue.
    for (let i = 0; i < 3; i += 1) {
      await db.insert(heartbeatRunWatchdogDecisions).values({
        companyId,
        runId,
        decision: "continue",
        snoozedUntil: new Date(now.getTime() - (3 - i) * 31 * 60 * 1000),
        reason: `Prior review #${i + 1} closed done without recovery`,
      });
    }

    const heartbeat = heartbeatService(db);
    const result = await heartbeat.scanSilentActiveRuns({ now, companyId });

    expect(result).toMatchObject({
      scanned: 1,
      created: 0,
      autoRecovered: 1,
    });

    // No new evaluation issue should have been created.
    const evaluations = await db
      .select()
      .from(issues)
      .where(and(eq(issues.companyId, companyId), eq(issues.originKind, "stale_active_run_evaluation")));
    expect(evaluations).toHaveLength(0);

    // Source issue blocked and routed to the manager (reportsTo of the running coder).
    const [source] = await db.select().from(issues).where(eq(issues.id, issueId));
    expect(source?.status).toBe("blocked");
    expect(source?.assigneeAgentId).toBe(managerId);
    expect(source?.assigneeAgentId).not.toBe(coderId);

    // Terminal `auto_recovered` decision row inserted.
    const decisions = await db
      .select()
      .from(heartbeatRunWatchdogDecisions)
      .where(and(eq(heartbeatRunWatchdogDecisions.runId, runId), eq(heartbeatRunWatchdogDecisions.decision, "auto_recovered")));
    expect(decisions).toHaveLength(1);
    expect(decisions[0]?.snoozedUntil).toBeTruthy();

    // AZU-2934 Layer 2b: the heartbeatService path now threads `cancelStuckRun`
    // into recoveryService (heartbeat.ts), so the run is killed before the
    // source-issue reassignment and the decision row records the structured
    // termination outcome. End-to-end proves the wiring reaches the production
    // path; the not-wired and failure branches are covered by the two dedicated
    // recovery-service tests below.
    expect(decisions[0]?.reason).toContain("termination=succeeded");

    // Subsequent scan ticks must not retrigger recovery — either because the
    // auto_recovered snooze gates the decision (when the canceller wasn't wired
    // and the run is still running) or because the cancelled run is no longer
    // active (when Layer 2b's cancel succeeded and terminated the run).
    const followup = await heartbeat.scanSilentActiveRuns({ now, companyId });
    expect(followup).toMatchObject({ created: 0, autoRecovered: 0 });
  });

  it("terminates the live run via the cancel primitive when wired (AZU-2934)", async () => {
    const now = new Date("2026-04-22T20:00:00.000Z");
    const { companyId, managerId, issueId, runId } = await seedRunningRun({
      now,
      ageMs: ACTIVE_RUN_OUTPUT_SUSPICION_THRESHOLD_MS + 60_000,
    });

    for (let i = 0; i < 3; i += 1) {
      await db.insert(heartbeatRunWatchdogDecisions).values({
        companyId,
        runId,
        decision: "continue",
        snoozedUntil: new Date(now.getTime() - (3 - i) * 31 * 60 * 1000),
        reason: `Prior review #${i + 1} closed done without recovery`,
      });
    }

    const cancelStuckRun = vi.fn(async (id: string) => {
      const [updated] = await db
        .update(heartbeatRuns)
        .set({ status: "cancelled" })
        .where(eq(heartbeatRuns.id, id))
        .returning();
      return updated ?? null;
    });
    const recovery = recoveryService(db, { enqueueWakeup: vi.fn(), cancelStuckRun });

    const result = await recovery.scanSilentActiveRuns({ now, companyId });

    expect(result).toMatchObject({ scanned: 1, created: 0, autoRecovered: 1 });

    // The cancel primitive was called with the AZU-2934 structured reason and
    // error code, BEFORE the source-issue reassignment.
    expect(cancelStuckRun).toHaveBeenCalledTimes(1);
    expect(cancelStuckRun).toHaveBeenCalledWith(
      runId,
      "auto_recovered_after_3_consecutive_watchdog_reviews",
      { errorCode: "auto_recovered_after_consecutive_reviews" },
    );

    // Source issue still reassigned + blocked.
    const [source] = await db.select().from(issues).where(eq(issues.id, issueId));
    expect(source?.status).toBe("blocked");
    expect(source?.assigneeAgentId).toBe(managerId);

    // Decision row encodes termination=succeeded.
    const [decision] = await db
      .select()
      .from(heartbeatRunWatchdogDecisions)
      .where(
        and(
          eq(heartbeatRunWatchdogDecisions.runId, runId),
          eq(heartbeatRunWatchdogDecisions.decision, "auto_recovered"),
        ),
      );
    expect(decision?.reason).toContain("termination=succeeded");
  });

  it("completes auto-recovery even if the cancel call fails (AZU-2934)", async () => {
    const now = new Date("2026-04-22T20:00:00.000Z");
    const { companyId, managerId, issueId, runId } = await seedRunningRun({
      now,
      ageMs: ACTIVE_RUN_OUTPUT_SUSPICION_THRESHOLD_MS + 60_000,
    });

    for (let i = 0; i < 3; i += 1) {
      await db.insert(heartbeatRunWatchdogDecisions).values({
        companyId,
        runId,
        decision: "continue",
        snoozedUntil: new Date(now.getTime() - (3 - i) * 31 * 60 * 1000),
        reason: `Prior review #${i + 1} closed done without recovery`,
      });
    }

    const cancelStuckRun = vi.fn(async () => {
      throw new Error("cancel-endpoint-unreachable");
    });
    const recovery = recoveryService(db, { enqueueWakeup: vi.fn(), cancelStuckRun });

    const result = await recovery.scanSilentActiveRuns({ now, companyId });

    // Recovery still completes — terminate failure does NOT block reassignment,
    // comment, or snooze.
    expect(result).toMatchObject({ scanned: 1, created: 0, autoRecovered: 1 });
    expect(cancelStuckRun).toHaveBeenCalledTimes(1);

    const [source] = await db.select().from(issues).where(eq(issues.id, issueId));
    expect(source?.status).toBe("blocked");
    expect(source?.assigneeAgentId).toBe(managerId);

    const [decision] = await db
      .select()
      .from(heartbeatRunWatchdogDecisions)
      .where(
        and(
          eq(heartbeatRunWatchdogDecisions.runId, runId),
          eq(heartbeatRunWatchdogDecisions.decision, "auto_recovered"),
        ),
      );
    expect(decision?.reason).toContain("termination=failed");
  });

  it("skips snoozed runs and healthy noisy runs", async () => {
    const now = new Date("2026-04-22T20:00:00.000Z");
    const stale = await seedRunningRun({
      now,
      ageMs: ACTIVE_RUN_OUTPUT_CRITICAL_THRESHOLD_MS + 60_000,
    });
    const noisy = await seedRunningRun({
      now,
      ageMs: ACTIVE_RUN_OUTPUT_CRITICAL_THRESHOLD_MS + 60_000,
      withOutput: true,
    });
    await db.insert(heartbeatRunWatchdogDecisions).values({
      companyId: stale.companyId,
      runId: stale.runId,
      decision: "snooze",
      snoozedUntil: new Date(now.getTime() + 60 * 60 * 1000),
      reason: "Intentional quiet run",
    });
    const heartbeat = heartbeatService(db);

    const staleResult = await heartbeat.scanSilentActiveRuns({ now, companyId: stale.companyId });
    const noisyResult = await heartbeat.scanSilentActiveRuns({ now, companyId: noisy.companyId });

    expect(staleResult).toMatchObject({ created: 0, snoozed: 1 });
    expect(noisyResult).toMatchObject({ scanned: 0, created: 0 });
  });

  it("records watchdog decisions through recovery owner authorization", async () => {
    const now = new Date("2026-04-22T20:00:00.000Z");
    const { companyId, managerId, runId } = await seedRunningRun({
      now,
      ageMs: ACTIVE_RUN_OUTPUT_SUSPICION_THRESHOLD_MS + 60_000,
    });
    const heartbeat = heartbeatService(db);
    const recovery = recoveryService(db, { enqueueWakeup: vi.fn() });

    const scan = await heartbeat.scanSilentActiveRuns({ now, companyId });
    const evaluationIssueId = scan.evaluationIssueIds[0];
    expect(evaluationIssueId).toBeTruthy();

    await expect(
      recovery.recordWatchdogDecision({
        runId,
        actor: { type: "agent", agentId: randomUUID() },
        decision: "continue",
        evaluationIssueId,
        reason: "not my recovery issue",
      }),
    ).rejects.toMatchObject({ status: 403 });

    const snoozedUntil = new Date(now.getTime() + 60 * 60 * 1000);
    const decision = await recovery.recordWatchdogDecision({
      runId,
      actor: { type: "agent", agentId: managerId },
      decision: "snooze",
      evaluationIssueId,
      reason: "Long compile with no output",
      snoozedUntil,
    });

    expect(decision).toMatchObject({
      runId,
      evaluationIssueId,
      decision: "snooze",
      createdByAgentId: managerId,
    });
    await expect(recovery.buildRunOutputSilence({
      id: runId,
      companyId,
      status: "running",
      lastOutputAt: null,
      lastOutputSeq: 0,
      lastOutputStream: null,
      processStartedAt: new Date(now.getTime() - ACTIVE_RUN_OUTPUT_SUSPICION_THRESHOLD_MS - 60_000),
      startedAt: new Date(now.getTime() - ACTIVE_RUN_OUTPUT_SUSPICION_THRESHOLD_MS - 60_000),
      createdAt: new Date(now.getTime() - ACTIVE_RUN_OUTPUT_SUSPICION_THRESHOLD_MS - 60_000),
    }, now)).resolves.toMatchObject({
      level: "snoozed",
      snoozedUntil,
      evaluationIssueId,
    });
  });

  it("re-arms continue decisions after the default quiet window", async () => {
    const now = new Date("2026-04-22T20:00:00.000Z");
    const { companyId, managerId, runId } = await seedRunningRun({
      now,
      ageMs: ACTIVE_RUN_OUTPUT_SUSPICION_THRESHOLD_MS + 60_000,
    });
    const heartbeat = heartbeatService(db);
    const recovery = recoveryService(db, { enqueueWakeup: vi.fn() });

    const scan = await heartbeat.scanSilentActiveRuns({ now, companyId });
    const evaluationIssueId = scan.evaluationIssueIds[0];
    expect(evaluationIssueId).toBeTruthy();

    const decision = await recovery.recordWatchdogDecision({
      runId,
      actor: { type: "agent", agentId: managerId },
      decision: "continue",
      evaluationIssueId,
      reason: "Current evidence is acceptable; keep watching.",
      now,
    });
    const rearmAt = new Date(now.getTime() + ACTIVE_RUN_OUTPUT_CONTINUE_REARM_MS);
    expect(decision).toMatchObject({
      runId,
      evaluationIssueId,
      decision: "continue",
      createdByAgentId: managerId,
    });
    expect(decision.snoozedUntil?.toISOString()).toBe(rearmAt.toISOString());

    await db.update(issues).set({ status: "done" }).where(eq(issues.id, evaluationIssueId));

    const beforeRearm = await heartbeat.scanSilentActiveRuns({
      now: new Date(rearmAt.getTime() - 60_000),
      companyId,
    });
    expect(beforeRearm).toMatchObject({ created: 0, snoozed: 1 });

    const afterRearm = await heartbeat.scanSilentActiveRuns({
      now: new Date(rearmAt.getTime() + 60_000),
      companyId,
    });
    expect(afterRearm.created).toBe(1);
    expect(afterRearm.evaluationIssueIds[0]).not.toBe(evaluationIssueId);

    const evaluations = await db
      .select()
      .from(issues)
      .where(and(eq(issues.companyId, companyId), eq(issues.originKind, "stale_active_run_evaluation")));
    expect(evaluations.filter((issue) => !["done", "cancelled"].includes(issue.status))).toHaveLength(1);
  });

  it("rejects agent watchdog decisions using issues not bound to the target run", async () => {
    const now = new Date("2026-04-22T20:00:00.000Z");
    const { companyId, managerId, coderId, runId, issuePrefix } = await seedRunningRun({
      now,
      ageMs: ACTIVE_RUN_OUTPUT_SUSPICION_THRESHOLD_MS + 60_000,
    });
    const heartbeat = heartbeatService(db);
    const recovery = recoveryService(db, { enqueueWakeup: vi.fn() });

    const scan = await heartbeat.scanSilentActiveRuns({ now, companyId });
    const evaluationIssueId = scan.evaluationIssueIds[0];
    expect(evaluationIssueId).toBeTruthy();

    const unrelatedIssueId = randomUUID();
    await db.insert(issues).values({
      id: unrelatedIssueId,
      companyId,
      title: "Assigned but unrelated",
      status: "todo",
      priority: "medium",
      assigneeAgentId: managerId,
      issueNumber: 20,
      identifier: `${issuePrefix}-20`,
    });

    const otherRunId = randomUUID();
    const otherEvaluationIssueId = randomUUID();
    await db.insert(heartbeatRuns).values({
      id: otherRunId,
      companyId,
      agentId: coderId,
      status: "running",
      invocationSource: "assignment",
      triggerDetail: "system",
      startedAt: new Date(now.getTime() - ACTIVE_RUN_OUTPUT_SUSPICION_THRESHOLD_MS - 120_000),
      processStartedAt: new Date(now.getTime() - ACTIVE_RUN_OUTPUT_SUSPICION_THRESHOLD_MS - 120_000),
      lastOutputAt: null,
      lastOutputSeq: 0,
      lastOutputStream: null,
      contextSnapshot: {},
      logBytes: 0,
    });
    await db.insert(issues).values({
      id: otherEvaluationIssueId,
      companyId,
      title: "Other run evaluation",
      status: "todo",
      priority: "medium",
      assigneeAgentId: managerId,
      issueNumber: 21,
      identifier: `${issuePrefix}-21`,
      originKind: "stale_active_run_evaluation",
      originId: otherRunId,
      originFingerprint: `stale_active_run:${companyId}:${otherRunId}`,
    });

    const attempts = [
      { decision: "continue" as const, evaluationIssueId: unrelatedIssueId },
      { decision: "dismissed_false_positive" as const, evaluationIssueId: unrelatedIssueId },
      {
        decision: "snooze" as const,
        evaluationIssueId: unrelatedIssueId,
        snoozedUntil: new Date(now.getTime() + 60 * 60 * 1000),
      },
      { decision: "continue" as const, evaluationIssueId: otherEvaluationIssueId },
    ];

    for (const attempt of attempts) {
      await expect(
        recovery.recordWatchdogDecision({
          runId,
          actor: { type: "agent", agentId: managerId },
          reason: "malicious or stale binding",
          ...attempt,
        }),
      ).rejects.toMatchObject({ status: 403 });
    }

    await db.update(issues).set({ status: "done" }).where(eq(issues.id, evaluationIssueId));
    await expect(
      recovery.recordWatchdogDecision({
        runId,
        actor: { type: "agent", agentId: managerId },
        decision: "continue",
        evaluationIssueId,
        reason: "closed evaluation should not authorize",
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("validates createdByRunId before storing watchdog decisions", async () => {
    const now = new Date("2026-04-22T20:00:00.000Z");
    const { companyId, managerId, runId } = await seedRunningRun({
      now,
      ageMs: ACTIVE_RUN_OUTPUT_SUSPICION_THRESHOLD_MS + 60_000,
    });
    const heartbeat = heartbeatService(db);
    const recovery = recoveryService(db, { enqueueWakeup: vi.fn() });

    const scan = await heartbeat.scanSilentActiveRuns({ now, companyId });
    const evaluationIssueId = scan.evaluationIssueIds[0];
    expect(evaluationIssueId).toBeTruthy();

    await expect(
      recovery.recordWatchdogDecision({
        runId,
        actor: { type: "agent", agentId: managerId },
        decision: "continue",
        evaluationIssueId,
        reason: "client supplied another agent run",
        createdByRunId: runId,
      }),
    ).rejects.toMatchObject({ status: 403 });

    const managerRunId = randomUUID();
    await db.insert(heartbeatRuns).values({
      id: managerRunId,
      companyId,
      agentId: managerId,
      status: "running",
      invocationSource: "assignment",
      triggerDetail: "system",
      startedAt: now,
      processStartedAt: now,
      lastOutputAt: now,
      lastOutputSeq: 1,
      lastOutputStream: "stdout",
      contextSnapshot: {},
      logBytes: 0,
    });

    const decision = await recovery.recordWatchdogDecision({
      runId,
      actor: { type: "agent", agentId: managerId, runId: managerRunId },
      decision: "continue",
      evaluationIssueId,
      reason: "valid current actor run",
      createdByRunId: randomUUID(),
    });
    expect(decision.createdByRunId).toBe(managerRunId);
  });

  it("appends an unresolved-cycle event each scan after the initial evaluation issue is filed", async () => {
    const now = new Date("2026-04-22T20:00:00.000Z");
    const { companyId, runId } = await seedRunningRun({
      now,
      ageMs: ACTIVE_RUN_OUTPUT_SUSPICION_THRESHOLD_MS + 60_000,
    });
    const heartbeat = heartbeatService(db);

    const first = await heartbeat.scanSilentActiveRuns({ now, companyId });
    expect(first.created).toBe(1);

    const second = await heartbeat.scanSilentActiveRuns({ now, companyId });
    const third = await heartbeat.scanSilentActiveRuns({ now, companyId });
    expect(second.existing).toBe(1);
    expect(third.existing).toBe(1);

    const events = await db
      .select({ eventType: heartbeatRunEvents.eventType })
      .from(heartbeatRunEvents)
      .where(
        and(
          eq(heartbeatRunEvents.runId, runId),
          eq(heartbeatRunEvents.eventType, "heartbeat.output_stale_unresolved_cycle"),
        ),
      );
    expect(events.length).toBeGreaterThanOrEqual(2);
  });

  it("auto-cancels a stuck run after N unresolved watchdog cycles when the canceller is wired", async () => {
    const now = new Date("2026-04-22T20:00:00.000Z");
    const { companyId, runId } = await seedRunningRun({
      now,
      ageMs: ACTIVE_RUN_OUTPUT_CRITICAL_THRESHOLD_MS + 60_000,
    });
    const heartbeat = heartbeatService(db);

    // First call creates the evaluation issue (not counted as unresolved).
    await heartbeat.scanSilentActiveRuns({ now, companyId });

    // Subsequent calls each tally one unresolved cycle; after the threshold,
    // the in-process canceller fires.
    for (let i = 0; i < STUCK_RUN_AUTO_CANCEL_UNRESOLVED_CYCLES; i += 1) {
      await heartbeat.scanSilentActiveRuns({ now, companyId });
    }

    const [run] = await db
      .select({ id: heartbeatRuns.id, status: heartbeatRuns.status, errorCode: heartbeatRuns.errorCode })
      .from(heartbeatRuns)
      .where(eq(heartbeatRuns.id, runId));
    expect(run?.status).toBe("cancelled");
    expect(run?.errorCode).toBe("stuck_terminated_by_watchdog");

    const [autoCancelEvent] = await db
      .select({ eventType: heartbeatRunEvents.eventType })
      .from(heartbeatRunEvents)
      .where(
        and(
          eq(heartbeatRunEvents.runId, runId),
          eq(heartbeatRunEvents.eventType, "heartbeat.output_stale_auto_cancelled"),
        ),
      );
    expect(autoCancelEvent).toBeTruthy();
  });

  it("does not auto-cancel when only the recovery service is exercised without the in-process canceller", async () => {
    const now = new Date("2026-04-22T20:00:00.000Z");
    const { companyId, runId } = await seedRunningRun({
      now,
      ageMs: ACTIVE_RUN_OUTPUT_CRITICAL_THRESHOLD_MS + 60_000,
    });
    const recovery = recoveryService(db, { enqueueWakeup: vi.fn() });

    await recovery.scanSilentActiveRuns({ now, companyId });
    for (let i = 0; i < STUCK_RUN_AUTO_CANCEL_UNRESOLVED_CYCLES + 2; i += 1) {
      await recovery.scanSilentActiveRuns({ now, companyId });
    }

    const [run] = await db
      .select({ status: heartbeatRuns.status })
      .from(heartbeatRuns)
      .where(eq(heartbeatRuns.id, runId));
    expect(run?.status).toBe("running");
  });
});
