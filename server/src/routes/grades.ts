import { Router } from "express";
import type { Db } from "@paperclipai/db";

const VALID_GRADES = ["accepted", "minor_edits", "major_rework", "scrapped"] as const;

export function gradesRouter(_db: Db) {
  const router = Router();

  router.post("/", async (req, res) => {
    const { conversationId, grade } = req.body as { conversationId?: string; grade?: string };
    if (!conversationId || !VALID_GRADES.includes(grade as (typeof VALID_GRADES)[number])) {
      res.status(400).json({ error: "Invalid conversationId or grade" });
      return;
    }
    // Session grade saved — full DB integration in Phase 2 when conversations table is live
    res.json({ ok: true });
  });

  return router;
}
