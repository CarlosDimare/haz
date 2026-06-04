import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core"
import { ProjectTable } from "../project/sql"
import { Timestamps } from "../database/schema.sql"
import type { ProjectV2 } from "../project"
import type { CircuitSchema } from "./schema"

// ── Circuit ─────────────────────────────────────────────────────────────────

export const CircuitTable = sqliteTable(
  "circuit",
  {
    id: text().$type<CircuitSchema.ID>().primaryKey(),
    project_id: text()
      .$type<ProjectV2.ID>()
      .notNull()
      .references(() => ProjectTable.id, { onDelete: "cascade" }),
    name: text().notNull(),
    description: text(),
    ...Timestamps,
  },
  (table) => [
    index("circuit_project_idx").on(table.project_id),
  ],
)

// ── Circuit Node (a step / subagent within a circuit) ────────────────────────

export const CircuitNodeTable = sqliteTable(
  "circuit_node",
  {
    id: text().$type<CircuitSchema.NodeID>().primaryKey(),
    circuit_id: text()
      .$type<CircuitSchema.ID>()
      .notNull()
      .references(() => CircuitTable.id, { onDelete: "cascade" }),
    label: text().notNull(),
    agent_id: text(),
    tasks: text().notNull().default(""),
    cron: text(),
    enabled: integer({ mode: "boolean" }).notNull().default(true),
    color: text(),
    input_mapping: text({ mode: "json" }),
    output_mapping: text({ mode: "json" }),
    position: integer().notNull().default(0),
    timeout: integer(),
    max_retries: integer().notNull().default(0),
    ...Timestamps,
  },
  (table) => [
    index("circuit_node_circuit_idx").on(table.circuit_id),
  ],
)

// ── Circuit Edge (connection between nodes) ──────────────────────────────────

export const CircuitEdgeTable = sqliteTable(
  "circuit_edge",
  {
    id: text().$type<CircuitSchema.EdgeID>().primaryKey(),
    circuit_id: text()
      .$type<CircuitSchema.ID>()
      .notNull()
      .references(() => CircuitTable.id, { onDelete: "cascade" }),
    from_node_id: text().$type<CircuitSchema.NodeID>().notNull(),
    to_node_id: text().$type<CircuitSchema.NodeID>().notNull(),
    condition: text(),
    ...Timestamps,
  },
  (table) => [
    index("circuit_edge_circuit_idx").on(table.circuit_id),
  ],
)

// ── Circuit Execution ───────────────────────────────────────────────────────

export const CircuitExecutionTable = sqliteTable(
  "circuit_execution",
  {
    id: text().$type<CircuitSchema.ExecutionID>().primaryKey(),
    circuit_id: text()
      .$type<CircuitSchema.ID>()
      .references(() => CircuitTable.id),
    project_id: text()
      .$type<ProjectV2.ID>()
      .notNull()
      .references(() => ProjectTable.id, { onDelete: "cascade" }),
    status: text().notNull().default("queued"),
    trigger: text().notNull().default("manual"),
    started_at: integer(),
    completed_at: integer(),
    error: text(),
    ...Timestamps,
  },
  (table) => [
    index("circuit_execution_circuit_idx").on(table.circuit_id),
    index("circuit_execution_project_idx").on(table.project_id),
  ],
)

// ── Node Execution (per-node execution record) ──────────────────────────────

export const NodeExecutionTable = sqliteTable(
  "node_execution",
  {
    id: text().$type<CircuitSchema.ExecutionID>().primaryKey(),
    execution_id: text()
      .$type<CircuitSchema.ExecutionID>()
      .notNull()
      .references(() => CircuitExecutionTable.id, { onDelete: "cascade" }),
    node_id: text().$type<CircuitSchema.NodeID>().notNull(),
    status: text().notNull().default("pending"),
    input: text({ mode: "json" }),
    output: text({ mode: "json" }),
    error: text(),
    started_at: integer(),
    completed_at: integer(),
    retry_count: integer().notNull().default(0),
    session_id: text(),
    ...Timestamps,
  },
  (table) => [
    index("node_execution_execution_idx").on(table.execution_id),
  ],
)
