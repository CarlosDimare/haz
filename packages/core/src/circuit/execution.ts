export * as CircuitExecution from "./execution"

import { Context, Effect, Layer, Schema } from "effect"
import { eq, and } from "drizzle-orm"
import { Database } from "../database/database"
import { ProjectV2 } from "../project"
import { CircuitSchema } from "./schema"
import { CircuitExecutionTable, NodeExecutionTable } from "./sql"

// ── Errors ──────────────────────────────────────────────────────────────────

export class ExecutionNotFoundError extends Schema.TaggedErrorClass<ExecutionNotFoundError>()(
  "CircuitExecutionNotFoundError",
  { executionID: CircuitSchema.ExecutionID, message: Schema.String },
  { httpApiStatus: 404 },
) {}

// ── Interface ───────────────────────────────────────────────────────────────

export interface CreateInput {
  circuitID?: CircuitSchema.ID
  projectID: ProjectV2.ID
  trigger?: "manual" | "cron" | "webhook" | "event"
}

export interface NodeExecutionCreateInput {
  executionID: CircuitSchema.ExecutionID
  nodeID: CircuitSchema.NodeID
  input?: unknown
}

export interface NodeExecutionUpdateInput {
  status?: "pending" | "running" | "completed" | "failed" | "skipped"
  output?: unknown
  error?: string
  sessionID?: string
}

export interface Interface {
  readonly list: (circuitID: CircuitSchema.ID) => Effect.Effect<CircuitSchema.ExecutionInfo[]>
  readonly get: (id: CircuitSchema.ExecutionID) => Effect.Effect<CircuitSchema.ExecutionInfo, ExecutionNotFoundError>
  readonly create: (input: CreateInput) => Effect.Effect<CircuitSchema.ExecutionInfo>
  readonly updateStatus: (id: CircuitSchema.ExecutionID, status: string, error?: string) => Effect.Effect<void, ExecutionNotFoundError>
  readonly nodeExecutions: (executionID: CircuitSchema.ExecutionID) => Effect.Effect<CircuitSchema.NodeExecutionInfo[]>
  readonly createNodeExecution: (input: NodeExecutionCreateInput) => Effect.Effect<CircuitSchema.NodeExecutionInfo>
  readonly updateNodeExecution: (executionID: CircuitSchema.ExecutionID, nodeID: CircuitSchema.NodeID, input: NodeExecutionUpdateInput) => Effect.Effect<void>
  readonly cancel: (id: CircuitSchema.ExecutionID) => Effect.Effect<void, ExecutionNotFoundError>
}

// ── Service ─────────────────────────────────────────────────────────────────

export class Service extends Context.Service<Service, Interface>()("@opencode/v2/CircuitExecution") {}

// ── Row mappings ────────────────────────────────────────────────────────────

function fromRow(row: typeof CircuitExecutionTable.$inferSelect): CircuitSchema.ExecutionInfo {
  return new CircuitSchema.ExecutionInfo({
    id: row.id as CircuitSchema.ExecutionID,
    circuitID: (row.circuit_id as CircuitSchema.ID) ?? undefined,
    projectID: ProjectV2.ID.make(row.project_id),
    status: row.status as any,
    trigger: row.trigger as any,
    startedAt: row.started_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    error: row.error ?? undefined,
    totalNodes: 0,
    completedNodes: 0,
    time: {
      created: row.time_created,
      updated: row.time_updated,
    },
  })
}

function nodeFromRow(row: typeof NodeExecutionTable.$inferSelect): CircuitSchema.NodeExecutionInfo {
  return new CircuitSchema.NodeExecutionInfo({
    id: row.id as CircuitSchema.ExecutionID,
    executionID: row.execution_id as CircuitSchema.ExecutionID,
    nodeID: row.node_id as CircuitSchema.NodeID,
    status: row.status as any,
    input: (row.input as any) ?? undefined,
    output: (row.output as any) ?? undefined,
    error: row.error ?? undefined,
    startedAt: row.started_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    retryCount: row.retry_count,
    sessionID: row.session_id ?? undefined,
  })
}

// ── Layer ───────────────────────────────────────────────────────────────────

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const db = (yield* Database.Service).db

    const svc: Interface = {
      list: Effect.fn("CircuitExecution.list")(function* (circuitID) {
        const rows = yield* db
          .select()
          .from(CircuitExecutionTable)
          .where(eq(CircuitExecutionTable.circuit_id, circuitID))
          .orderBy(CircuitExecutionTable.time_created)
          .all()
          .pipe(Effect.orDie)
        return rows.map(fromRow)
      }),

      get: Effect.fn("CircuitExecution.get")(function* (id) {
        const row = yield* db
          .select()
          .from(CircuitExecutionTable)
          .where(eq(CircuitExecutionTable.id, id))
          .get()
          .pipe(Effect.orDie)
        if (!row) return yield* new ExecutionNotFoundError({ executionID: id, message: `Execution ${id} not found` })

        // Count nodes for this execution
        const nodeRows = yield* db
          .select()
          .from(NodeExecutionTable)
          .where(eq(NodeExecutionTable.execution_id, id))
          .all()
          .pipe(Effect.orDie)

        return new CircuitSchema.ExecutionInfo({
          id: row.id as CircuitSchema.ExecutionID,
          circuitID: (row.circuit_id as CircuitSchema.ID) ?? undefined,
          projectID: ProjectV2.ID.make(row.project_id),
          status: row.status as any,
          trigger: row.trigger as any,
          startedAt: row.started_at ?? undefined,
          completedAt: row.completed_at ?? undefined,
          error: row.error ?? undefined,
          totalNodes: nodeRows.length,
          completedNodes: nodeRows.filter((n) => n.status === "completed" || n.status === "failed" || n.status === "skipped").length,
          time: {
            created: row.time_created,
            updated: row.time_updated,
          },
        })
      }),

      create: Effect.fn("CircuitExecution.create")(function* (input) {
        const id = CircuitSchema.ExecutionID.new()
        const now = Date.now()
        yield* db
          .insert(CircuitExecutionTable)
          .values({
            id,
            circuit_id: input.circuitID ?? null,
            project_id: input.projectID,
            status: "queued",
            trigger: input.trigger ?? "manual",
            started_at: null,
            completed_at: null,
            error: null,
          })
          .run()
          .pipe(Effect.orDie)
        return new CircuitSchema.ExecutionInfo({
          id,
          circuitID: input.circuitID,
          projectID: input.projectID,
          status: "queued",
          trigger: input.trigger ?? "manual",
          totalNodes: 0,
          completedNodes: 0,
          time: { created: now, updated: now },
        })
      }),

      updateStatus: Effect.fn("CircuitExecution.updateStatus")(function* (id, status, error) {
        yield* svc.get(id)
        const patch: Record<string, unknown> = { status }
        if (status === "running") patch.started_at = Date.now()
        if (status === "completed" || status === "failed" || status === "cancelled") patch.completed_at = Date.now()
        if (error !== undefined) patch.error = error
        yield* db.update(CircuitExecutionTable).set(patch).where(eq(CircuitExecutionTable.id, id)).run().pipe(Effect.orDie)
      }),

      nodeExecutions: Effect.fn("CircuitExecution.nodeExecutions")(function* (executionID) {
        const rows = yield* db
          .select()
          .from(NodeExecutionTable)
          .where(eq(NodeExecutionTable.execution_id, executionID))
          .all()
          .pipe(Effect.orDie)
        return rows.map(nodeFromRow)
      }),

      createNodeExecution: Effect.fn("CircuitExecution.createNodeExecution")(function* (input) {
        const id = CircuitSchema.ExecutionID.new()
        yield* db
          .insert(NodeExecutionTable)
          .values({
            id,
            execution_id: input.executionID,
            node_id: input.nodeID,
            status: "pending",
            input: (input.input as any) ?? null,
            output: null,
            error: null,
            started_at: null,
            completed_at: null,
            retry_count: 0,
            session_id: null,
          })
          .run()
          .pipe(Effect.orDie)
        return new CircuitSchema.NodeExecutionInfo({
          id,
          executionID: input.executionID,
          nodeID: input.nodeID,
          status: "pending",
          input: input.input,
          retryCount: 0,
        })
      }),

      updateNodeExecution: Effect.fn("CircuitExecution.updateNodeExecution")(function* (executionID, nodeID, input) {
        const patch: Record<string, unknown> = {}
        if (input.status) patch.status = input.status
        if (input.output !== undefined) patch.output = input.output as any
        if (input.error !== undefined) patch.error = input.error
        if (input.sessionID !== undefined) patch.session_id = input.sessionID
        if (input.status === "running") patch.started_at = Date.now()
        if (input.status === "completed" || input.status === "failed") {
          patch.completed_at = Date.now()
          // Increment retry count if failed
          if (input.status === "failed") {
            const current = yield* db
              .select()
              .from(NodeExecutionTable)
              .where(and(eq(NodeExecutionTable.execution_id, executionID), eq(NodeExecutionTable.node_id, nodeID)))
              .get()
              .pipe(Effect.orDie)
            if (current) patch.retry_count = current.retry_count + 1
          }
        }
        yield* db
          .update(NodeExecutionTable)
          .set(patch)
          .where(and(eq(NodeExecutionTable.execution_id, executionID), eq(NodeExecutionTable.node_id, nodeID)))
          .run()
          .pipe(Effect.orDie)
      }),

      cancel: Effect.fn("CircuitExecution.cancel")(function* (id) {
        yield* svc.get(id)
        yield* db.update(CircuitExecutionTable).set({ status: "cancelled", completed_at: Date.now() }).where(eq(CircuitExecutionTable.id, id)).run().pipe(Effect.orDie)
        // Mark all pending/running nodes as skipped
        yield* db
          .update(NodeExecutionTable)
          .set({ status: "skipped" })
          .where(and(eq(NodeExecutionTable.execution_id, id), eq(NodeExecutionTable.status, "pending")))
          .run()
          .pipe(Effect.orDie)
        yield* db
          .update(NodeExecutionTable)
          .set({ status: "skipped" })
          .where(and(eq(NodeExecutionTable.execution_id, id), eq(NodeExecutionTable.status, "running")))
          .run()
          .pipe(Effect.orDie)
      }),
    }

    return Service.of(svc)
  }),
)

export const defaultLayer = layer.pipe(
  Layer.provide(Database.defaultLayer),
  Layer.orDie,
)
