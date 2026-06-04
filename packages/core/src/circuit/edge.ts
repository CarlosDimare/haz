export * as CircuitEdge from "./edge"

import { Context, Effect, Layer, Schema } from "effect"
import { eq } from "drizzle-orm"
import { Database } from "../database/database"
import { CircuitSchema } from "./schema"
import { CircuitEdgeTable } from "./sql"

// ── Interface ───────────────────────────────────────────────────────────────

export interface CreateInput {
  circuitID: CircuitSchema.ID
  fromNodeID: CircuitSchema.NodeID
  toNodeID: CircuitSchema.NodeID
  condition?: string
}

export interface Interface {
  readonly list: (circuitID: CircuitSchema.ID) => Effect.Effect<CircuitSchema.EdgeInfo[]>
  readonly create: (input: CreateInput) => Effect.Effect<CircuitSchema.EdgeInfo>
  readonly remove: (id: CircuitSchema.EdgeID) => Effect.Effect<void>
}

// ── Service ─────────────────────────────────────────────────────────────────

export class Service extends Context.Service<Service, Interface>()("@opencode/v2/CircuitEdge") {}

// ── Row mapping ─────────────────────────────────────────────────────────────

function fromRow(row: typeof CircuitEdgeTable.$inferSelect): CircuitSchema.EdgeInfo {
  return new CircuitSchema.EdgeInfo({
    id: row.id as CircuitSchema.EdgeID,
    circuitID: row.circuit_id as CircuitSchema.ID,
    fromNodeID: row.from_node_id as CircuitSchema.NodeID,
    toNodeID: row.to_node_id as CircuitSchema.NodeID,
    condition: row.condition ?? undefined,
  })
}

// ── Layer ───────────────────────────────────────────────────────────────────

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const db = (yield* Database.Service).db

    const svc: Interface = {
      list: Effect.fn("CircuitEdge.list")(function* (circuitID) {
        const rows = yield* db
          .select()
          .from(CircuitEdgeTable)
          .where(eq(CircuitEdgeTable.circuit_id, circuitID))
          .all()
          .pipe(Effect.orDie)
        return rows.map(fromRow)
      }),

      create: Effect.fn("CircuitEdge.create")(function* (input) {
        const id = CircuitSchema.EdgeID.new()
        yield* db
          .insert(CircuitEdgeTable)
          .values({
            id,
            circuit_id: input.circuitID,
            from_node_id: input.fromNodeID,
            to_node_id: input.toNodeID,
            condition: input.condition ?? null,
          })
          .run()
          .pipe(Effect.orDie)
        return new CircuitSchema.EdgeInfo({
          id,
          circuitID: input.circuitID,
          fromNodeID: input.fromNodeID,
          toNodeID: input.toNodeID,
          condition: input.condition,
        })
      }),

      remove: Effect.fn("CircuitEdge.remove")(function* (id) {
        yield* db.delete(CircuitEdgeTable).where(eq(CircuitEdgeTable.id, id)).run().pipe(Effect.orDie)
      }),
    }

    return Service.of(svc)
  }),
)

export const defaultLayer = layer.pipe(
  Layer.provide(Database.defaultLayer),
  Layer.orDie,
)
