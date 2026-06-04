export * as CircuitNode from "./node"

import { Context, Effect, Layer, Schema } from "effect"
import { eq, and } from "drizzle-orm"
import { Database } from "../database/database"
import { CircuitSchema } from "./schema"
import { CircuitNodeTable } from "./sql"

// ── Errors ──────────────────────────────────────────────────────────────────

export class NodeNotFoundError extends Schema.TaggedErrorClass<NodeNotFoundError>()(
  "CircuitNodeNotFoundError",
  { nodeID: CircuitSchema.NodeID, message: Schema.String },
  { httpApiStatus: 404 },
) {}

// ── Interface ───────────────────────────────────────────────────────────────

export interface CreateInput {
  circuitID: CircuitSchema.ID
  label: string
  agentID?: string
  tasks?: string
  cron?: string
  enabled?: boolean
  color?: string
  inputMapping?: unknown
  outputMapping?: unknown
  position?: number
  timeout?: number
  maxRetries?: number
}

export interface UpdateInput {
  label?: string
  agentID?: string
  tasks?: string
  cron?: string
  enabled?: boolean
  color?: string
  inputMapping?: unknown
  outputMapping?: unknown
  position?: number
  timeout?: number
  maxRetries?: number
}

export interface Interface {
  readonly list: (circuitID: CircuitSchema.ID) => Effect.Effect<CircuitSchema.NodeInfo[]>
  readonly get: (id: CircuitSchema.NodeID) => Effect.Effect<CircuitSchema.NodeInfo, NodeNotFoundError>
  readonly create: (input: CreateInput) => Effect.Effect<CircuitSchema.NodeInfo, NodeNotFoundError>
  readonly update: (id: CircuitSchema.NodeID, input: UpdateInput) => Effect.Effect<CircuitSchema.NodeInfo, NodeNotFoundError>
  readonly remove: (id: CircuitSchema.NodeID) => Effect.Effect<void, NodeNotFoundError>
  readonly reorder: (circuitID: CircuitSchema.ID, nodeIDs: CircuitSchema.NodeID[]) => Effect.Effect<void>
}

// ── Service ─────────────────────────────────────────────────────────────────

export class Service extends Context.Service<Service, Interface>()("@opencode/v2/CircuitNode") {}

// ── Row mapping ─────────────────────────────────────────────────────────────

function fromRow(row: typeof CircuitNodeTable.$inferSelect): CircuitSchema.NodeInfo {
  return new CircuitSchema.NodeInfo({
    id: row.id as CircuitSchema.NodeID,
    circuitID: row.circuit_id as CircuitSchema.ID,
    label: row.label,
    agentID: (row.agent_id as any) ?? undefined,
    tasks: row.tasks,
    cron: row.cron ?? undefined,
    enabled: row.enabled,
    color: row.color ?? undefined,
    inputMapping: (row.input_mapping as any) ?? undefined,
    outputMapping: (row.output_mapping as any) ?? undefined,
    position: row.position,
    timeout: row.timeout ?? undefined,
    maxRetries: row.max_retries,
    time: {
      created: row.time_created,
      updated: row.time_updated,
    },
  })
}

// ── Layer ───────────────────────────────────────────────────────────────────

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const db = (yield* Database.Service).db

    const svc: Interface = {
      list: Effect.fn("CircuitNode.list")(function* (circuitID) {
        const rows = yield* db
          .select()
          .from(CircuitNodeTable)
          .where(eq(CircuitNodeTable.circuit_id, circuitID))
          .orderBy(CircuitNodeTable.position)
          .all()
          .pipe(Effect.orDie)
        return rows.map(fromRow)
      }),

      get: Effect.fn("CircuitNode.get")(function* (id) {
        const row = yield* db
          .select()
          .from(CircuitNodeTable)
          .where(eq(CircuitNodeTable.id, id))
          .get()
          .pipe(Effect.orDie)
        if (!row) return yield* new NodeNotFoundError({ nodeID: id, message: `CircuitNode ${id} not found` })
        return fromRow(row)
      }),

      create: Effect.fn("CircuitNode.create")(function* (input) {
        const id = CircuitSchema.NodeID.new()
        yield* db
          .insert(CircuitNodeTable)
          .values({
            id,
            circuit_id: input.circuitID,
            label: input.label,
            agent_id: input.agentID ?? null,
            tasks: input.tasks ?? "",
            cron: input.cron ?? null,
            enabled: input.enabled ?? true,
            color: input.color ?? null,
            input_mapping: (input.inputMapping as any) ?? null,
            output_mapping: (input.outputMapping as any) ?? null,
            position: input.position ?? 0,
            timeout: input.timeout ?? null,
            max_retries: input.maxRetries ?? 0,
          })
          .run()
          .pipe(Effect.orDie)
        return yield* svc.get(id)
      }),

      update: Effect.fn("CircuitNode.update")(function* (id, input) {
        yield* svc.get(id)
        yield* db
          .update(CircuitNodeTable)
          .set({
            label: input.label,
            agent_id: input.agentID,
            tasks: input.tasks,
            cron: input.cron,
            enabled: input.enabled,
            color: input.color,
            input_mapping: input.inputMapping as any,
            output_mapping: input.outputMapping as any,
            position: input.position,
            timeout: input.timeout,
            max_retries: input.maxRetries,
          })
          .where(eq(CircuitNodeTable.id, id))
          .run()
          .pipe(Effect.orDie)
        return yield* svc.get(id)
      }),

      remove: Effect.fn("CircuitNode.remove")(function* (id) {
        yield* svc.get(id)
        yield* db.delete(CircuitNodeTable).where(eq(CircuitNodeTable.id, id)).run().pipe(Effect.orDie)
      }),

      reorder: Effect.fn("CircuitNode.reorder")(function* (circuitID, nodeIDs) {
        yield* Effect.forEach(nodeIDs, (nodeID, idx) =>
          db
            .update(CircuitNodeTable)
            .set({ position: idx })
            .where(and(eq(CircuitNodeTable.id, nodeID), eq(CircuitNodeTable.circuit_id, circuitID)))
            .run()
            .pipe(Effect.orDie),
        )
      }),
    }

    return Service.of(svc)
  }),
)

export const defaultLayer = layer.pipe(
  Layer.provide(Database.defaultLayer),
  Layer.orDie,
)
