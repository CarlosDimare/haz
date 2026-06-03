import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import DESCRIPTION from "./recordar.txt"
import { Memory } from "../session/memory"

export const Parameters = Schema.Struct({
  frase: Schema.optional(Schema.String.annotate({ description: "The information to remember. Si no se provee, lista los recuerdos almacenados." })),
})

export const RecordarTool = Tool.define<typeof Parameters, object, Memory.Service>(
  "recordar",
  Effect.gen(function* () {
    const memory = yield* Memory.Service

    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, _ctx: Tool.Context) =>
        Effect.gen(function* () {
          if (!params.frase) {
            const entries = yield* memory.list()
            if (entries.length === 0) {
              return { title: "recordar", output: "No hay recuerdos almacenados.", metadata: {} }
            }
            const lines = entries.map((e, i) => `${i + 1}. [${e.id}] "${e.frase}"`)
            return { title: `recordar (${entries.length})`, output: lines.join("\n"), metadata: {} }
          }
          yield* memory.add(params.frase)
          return {
            title: `recordar: "${params.frase.slice(0, 40)}${params.frase.length > 40 ? "…" : ""}"`,
            output: `Recordado: "${params.frase}"`,
            metadata: {},
          }
        }).pipe(Effect.orDie),
    } satisfies Tool.DefWithoutID<typeof Parameters, object>
  }),
)
