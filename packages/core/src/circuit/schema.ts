export * as CircuitSchema from "./schema"

import { Schema } from "effect"
import { ProjectV2 } from "../project"
import { AgentV2 } from "../agent"
import { withStatics } from "../schema"
import { Identifier } from "../util/identifier"

// ── IDs ─────────────────────────────────────────────────────────────────────

export const ID = Schema.String.pipe(
  Schema.brand("Circuit.ID"),
  withStatics((schema) => ({
    new: (id?: string) => schema.make(id ?? "cir_" + Identifier.descending()),
  })),
)
export type ID = typeof ID.Type

export const NodeID = Schema.String.pipe(
  Schema.brand("Circuit.NodeID"),
  withStatics((schema) => ({
    new: (id?: string) => schema.make(id ?? "cnd_" + Identifier.descending()),
  })),
)
export type NodeID = typeof NodeID.Type

export const EdgeID = Schema.String.pipe(
  Schema.brand("Circuit.EdgeID"),
  withStatics((schema) => ({
    new: (id?: string) => schema.make(id ?? "ced_" + Identifier.descending()),
  })),
)
export type EdgeID = typeof EdgeID.Type

export const ExecutionID = Schema.String.pipe(
  Schema.brand("Circuit.ExecutionID"),
  withStatics((schema) => ({
    new: (id?: string) => schema.make(id ?? "cex_" + Identifier.descending()),
  })),
)
export type ExecutionID = typeof ExecutionID.Type

// ── Circuit ─────────────────────────────────────────────────────────────────

export class Info extends Schema.Class<Info>("Circuit.Info")({
  id: ID,
  projectID: ProjectV2.ID,
  name: Schema.String,
  description: Schema.String.pipe(Schema.optional),
  time: Schema.Struct({
    created: Schema.Finite,
    updated: Schema.Finite,
  }),
}) {}

// ── Circuit Node (a step / subagent within a circuit) ────────────────────────

export const Trigger = Schema.Literals(["manual", "cron", "webhook", "event"])

export class NodeInfo extends Schema.Class<NodeInfo>("Circuit.NodeInfo")({
  id: NodeID,
  circuitID: ID,
  label: Schema.String,
  agentID: AgentV2.ID.pipe(Schema.optional),
  tasks: Schema.String,
  cron: Schema.String.pipe(Schema.optional),
  enabled: Schema.Boolean,
  color: Schema.String.pipe(Schema.optional),
  inputMapping: Schema.optional(Schema.Unknown),
  outputMapping: Schema.optional(Schema.Unknown),
  position: Schema.Finite,
  timeout: Schema.Finite.pipe(Schema.optional),
  maxRetries: Schema.Finite,
  time: Schema.Struct({
    created: Schema.Finite,
    updated: Schema.Finite,
  }),
}) {}

// ── Circuit Edge (connection between nodes) ──────────────────────────────────

export class EdgeInfo extends Schema.Class<EdgeInfo>("Circuit.EdgeInfo")({
  id: EdgeID,
  circuitID: ID,
  fromNodeID: NodeID,
  toNodeID: NodeID,
  condition: Schema.String.pipe(Schema.optional),
}) {}

// ── Circuit Execution (runtime state) ────────────────────────────────────────

export const ExecutionStatus = Schema.Literals([
  "queued",
  "running",
  "paused",
  "completed",
  "failed",
  "cancelled",
])

export const NodeExecutionStatus = Schema.Literals([
  "pending",
  "running",
  "completed",
  "failed",
  "skipped",
])

export class ExecutionInfo extends Schema.Class<ExecutionInfo>("Circuit.ExecutionInfo")({
  id: ExecutionID,
  circuitID: ID.pipe(Schema.optional),
  projectID: ProjectV2.ID,
  status: ExecutionStatus,
  trigger: Trigger,
  startedAt: Schema.Finite.pipe(Schema.optional),
  completedAt: Schema.Finite.pipe(Schema.optional),
  error: Schema.String.pipe(Schema.optional),
  totalNodes: Schema.Finite,
  completedNodes: Schema.Finite,
  time: Schema.Struct({
    created: Schema.Finite,
    updated: Schema.Finite,
  }),
}) {}

export class NodeExecutionInfo extends Schema.Class<NodeExecutionInfo>("Circuit.NodeExecutionInfo")({
  id: ExecutionID,
  executionID: ExecutionID,
  nodeID: NodeID,
  status: NodeExecutionStatus,
  input: Schema.optional(Schema.Unknown),
  output: Schema.optional(Schema.Unknown),
  error: Schema.String.pipe(Schema.optional),
  startedAt: Schema.Finite.pipe(Schema.optional),
  completedAt: Schema.Finite.pipe(Schema.optional),
  retryCount: Schema.Finite,
  sessionID: Schema.String.pipe(Schema.optional),
}) {}
