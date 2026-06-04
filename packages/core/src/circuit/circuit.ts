export * as Circuit from "./circuit"

import { Context, Effect, Layer, Schema } from "effect"
import { eq } from "drizzle-orm"
import { Database } from "../database/database"
import { ProjectV2 } from "../project"
import { CircuitSchema } from "./schema"
import { CircuitTable } from "./sql"

// ── Errors ──────────────────────────────────────────────────────────────────

export class CircuitNotFoundError extends Schema.TaggedErrorClass<CircuitNotFoundError>()(
  "CircuitNotFoundError",
  { circuitID: CircuitSchema.ID, message: Schema.String },
  { httpApiStatus: 404 },
) {}

// ── Interface ───────────────────────────────────────────────────────────────

export interface CreateInput {
  projectID: ProjectV2.ID
  name: string
  description?: string
}

export interface UpdateInput {
  name?: string
  description?: string
}

export interface Interface {
  readonly list: (projectID: ProjectV2.ID) => Effect.Effect<CircuitSchema.Info[]>
  readonly get: (id: CircuitSchema.ID) => Effect.Effect<CircuitSchema.Info, CircuitNotFoundError>
  readonly create: (input: CreateInput) => Effect.Effect<CircuitSchema.Info, CircuitNotFoundError>
  readonly update: (id: CircuitSchema.ID, input: UpdateInput) => Effect.Effect<CircuitSchema.Info, CircuitNotFoundError>
  readonly remove: (id: CircuitSchema.ID) => Effect.Effect<void, CircuitNotFoundError>
}

// ── Service ─────────────────────────────────────────────────────────────────

export class Service extends Context.Service<Service, Interface>()("@opencode/v2/Circuit") {}

// ── Row mapping ─────────────────────────────────────────────────────────────

function fromRow(row: typeof CircuitTable.$inferSelect): CircuitSchema.Info {
  return new CircuitSchema.Info({
    id: row.id as CircuitSchema.ID,
    projectID: ProjectV2.ID.make(row.project_id),
    name: row.name,
    description: row.description ?? undefined,
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
      list: Effect.fn("Circuit.list")(function* (projectID) {
        const rows = yield* db
          .select()
          .from(CircuitTable)
          .where(eq(CircuitTable.project_id, projectID))
          .orderBy(CircuitTable.time_created)
          .all()
          .pipe(Effect.orDie)
        return rows.map(fromRow)
      }),

      get: Effect.fn("Circuit.get")(function* (id) {
        const row = yield* db
          .select()
          .from(CircuitTable)
          .where(eq(CircuitTable.id, id))
          .get()
          .pipe(Effect.orDie)
        if (!row) return yield* new CircuitNotFoundError({ circuitID: id, message: `Circuit ${id} not found` })
        return fromRow(row)
      }),

      create: Effect.fn("Circuit.create")(function* (input) {
        const id = CircuitSchema.ID.new()
        yield* db
          .insert(CircuitTable)
          .values({
            id,
            project_id: input.projectID,
            name: input.name,
            description: input.description ?? null,
          })
          .run()
          .pipe(Effect.orDie)
        return yield* svc.get(id)
      }),

      update: Effect.fn("Circuit.update")(function* (id, input) {
        yield* svc.get(id)
        yield* db
          .update(CircuitTable)
          .set({
            name: input.name,
            description: input.description,
          })
          .where(eq(CircuitTable.id, id))
          .run()
          .pipe(Effect.orDie)
        return yield* svc.get(id)
      }),

      remove: Effect.fn("Circuit.remove")(function* (id) {
        yield* svc.get(id)
        yield* db.delete(CircuitTable).where(eq(CircuitTable.id, id)).run().pipe(Effect.orDie)
      }),
    }

    return Service.of(svc)
  }),
)

export const defaultLayer = layer.pipe(
  Layer.provide(Database.defaultLayer),
  Layer.orDie,
)
