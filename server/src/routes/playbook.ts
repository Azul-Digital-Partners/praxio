import { Router } from "express";
import fs from "node:fs";
import path from "node:path";

export function playbookRouter(agentsDir: string) {
  const router = Router();

  router.get("/:agentSlug", (req, res) => {
    const { agentSlug } = req.params;
    if (!/^[a-z0-9-]+$/.test(agentSlug)) {
      res.status(400).json({ error: "Invalid agent slug" });
      return;
    }
    const skillPath = path.join(agentsDir, agentSlug, "SKILL.md");
    if (!fs.existsSync(skillPath)) {
      res.status(404).json({ error: "Playbook not found" });
      return;
    }
    res.type("text/plain").send(fs.readFileSync(skillPath, "utf-8"));
  });

  return router;
}
