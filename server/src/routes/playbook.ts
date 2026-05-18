import { Router } from "express";
import fs from "node:fs";
import { agents } from "@paperclipai/db";
import { eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";

function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

export function playbookRouter(db: Db) {
  const router = Router();

  router.get("/:agentId", async (req, res) => {
    const { agentId } = req.params;

    const agent = await db
      .select({ adapterConfig: agents.adapterConfig })
      .from(agents)
      .where(eq(agents.id, agentId))
      .then((rows) => rows[0] ?? null);

    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    const config = typeof agent.adapterConfig === "object" && agent.adapterConfig !== null
      ? (agent.adapterConfig as Record<string, unknown>)
      : {};

    const filePath = asString(config.instructionsFilePath);
    if (!filePath) {
      res.status(404).json({ error: "No instructions file configured for this agent" });
      return;
    }

    try {
      const content = await fs.promises.readFile(filePath, "utf-8");
      res.type("text/plain").send(content);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        res.status(404).json({ error: "Playbook file not found on disk" });
      } else {
        res.status(500).json({ error: "Failed to read playbook" });
      }
    }
  });

  return router;
}
