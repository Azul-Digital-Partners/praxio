import { Router } from "express";
import fs from "node:fs";
import path from "node:path";

export function playbookRouter(agentsDir: string) {
  const router = Router();

  router.get("/:agentSlug", async (req, res) => {
    const { agentSlug } = req.params;
    if (!/^[a-z0-9-]+$/.test(agentSlug)) {
      res.status(400).json({ error: "Invalid agent slug" });
      return;
    }
    const skillPath = path.join(agentsDir, agentSlug, "SKILL.md");
    try {
      const content = await fs.promises.readFile(skillPath, "utf-8");
      res.type("text/plain").send(content);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        res.status(404).json({ error: "Playbook not found" });
      } else {
        res.status(500).json({ error: "Failed to read playbook" });
      }
    }
  });

  return router;
}
