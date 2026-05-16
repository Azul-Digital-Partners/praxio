import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { agents } from "./agents.js";
import { authUsers } from "./auth.js";
import { issues } from "./issues.js";

// conversations: one per agent interaction session
export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentId: uuid("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
  createdById: text("created_by").notNull().references(() => authUsers.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  taskId: uuid("task_id").references(() => issues.id),
});

// conversation_messages: individual turns within a conversation
export const conversationMessages = pgTable("conversation_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// session_grades: user quality grade for each conversation
export const sessionGrades = pgTable("session_grades", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id").notNull().unique().references(() => conversations.id, { onDelete: "cascade" }),
  grade: text("grade").notNull(),
  gradedById: text("graded_by").notNull().references(() => authUsers.id),
  gradedAt: timestamp("graded_at", { withTimezone: true }).notNull().defaultNow(),
});

// agent_presence: live/idle/busy status per agent
export const agentPresence = pgTable("agent_presence", {
  agentId: uuid("agent_id").primaryKey().references(() => agents.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("idle"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
