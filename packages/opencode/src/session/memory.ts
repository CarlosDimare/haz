import path from "path"
import { Effect, Layer, Context } from "effect"
import { AppFileSystem } from "@opencode-ai/core/filesystem"
import { InstanceState } from "@/effect/instance-state"
import { ulid } from "ulid"

export interface MemoryEntry {
  id: string
  frase: string
  created: number
}

export interface Interface {
  readonly list: () => Effect.Effect<MemoryEntry[]>
  readonly add: (frase: string) => Effect.Effect<MemoryEntry>
  readonly remove: (id: string) => Effect.Effect<void>
  readonly system: () => Effect.Effect<string | undefined>
}

export class Service extends Context.Service<Service, Interface>()("@ojito/Memory") {}

export const layer: Layer.Layer<Service, never, AppFileSystem.Service> = Layer.effect(
  Service,
  Effect.gen(function* () {
    const fs = yield* AppFileSystem.Service

    const state = yield* InstanceState.make<Interface>(
      Effect.fn("Memory.state")(function* (ctx) {
        const filePath = path.join(ctx.directory, ".opencode", "memory.json")

        const load = Effect.fn("Memory.load")(function* () {
          const content = yield* fs.readFileStringSafe(filePath).pipe(Effect.orDie)
          if (!content) return { entries: [] as MemoryEntry[] }
          return JSON.parse(content) as { entries: MemoryEntry[] }
        })

        const save = Effect.fn("Memory.save")(function* (store: { entries: MemoryEntry[] }) {
          yield* fs.writeWithDirs(filePath, JSON.stringify(store, null, 2)).pipe(Effect.orDie)
        })

        return {
          list: Effect.fn("Memory.list")(function* () {
            const store = yield* load()
            return store.entries
          }),
          add: Effect.fn("Memory.add")(function* (frase: string) {
            const store = yield* load()
            const entry: MemoryEntry = { id: ulid(), frase, created: Date.now() }
            store.entries.push(entry)
            yield* save(store)
            return entry
          }),
          remove: Effect.fn("Memory.remove")(function* (id: string) {
            const store = yield* load()
            store.entries = store.entries.filter((e) => e.id !== id)
            yield* save(store)
          }),
          system: Effect.fn("Memory.system")(function* () {
            const store = yield* load()
            if (store.entries.length === 0) return undefined
            const lines = store.entries.map((e: MemoryEntry, i: number) => `${i + 1}. "${e.frase}"`)
            return [
              "<memory>",
              "Ojito guarda estos recuerdos sobre este proyecto:",
              ...lines,
              `Tenes ${store.entries.length} recuerdo${store.entries.length !== 1 ? "s" : ""} almacenado${store.entries.length !== 1 ? "s" : ""}.`,
              "Usá las herramientas recordar/olvidar para gestionarlos.",
              "</memory>",
            ].join("\n")
          }),
        }
      }),
    )

    return {
      list: () => Effect.flatMap(InstanceState.get(state), (s) => s.list()),
      add: (frase: string) => Effect.flatMap(InstanceState.get(state), (s) => s.add(frase)),
      remove: (id: string) => Effect.flatMap(InstanceState.get(state), (s) => s.remove(id)),
      system: () => Effect.flatMap(InstanceState.get(state), (s) => s.system()),
    }
  }),
)

export const defaultLayer: Layer.Layer<Service> = Layer.suspend(() => layer.pipe(Layer.provide(AppFileSystem.defaultLayer)))

export * as Memory from "./memory"
