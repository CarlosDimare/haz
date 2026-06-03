import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import DESCRIPTION from "./olvidar.txt"
import { Memory } from "../session/memory"

export const Parameters = Schema.Struct({
  id: Schema.String.annotate({ description: "The ID of the memory to forget. Obtené los IDs con recordar sin argumentos." }),
})

export const OlvidarTool = Tool.define<typeof Parameters, object, Memory.Service>(
  "olvidar",
  Effect.gen(function* () {
    const memory = yield* Memory.Service

    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, _ctx: Tool.Context) =>
        Effect.gen(function* () {
          yield* memory.remove(params.id)
          return {
            title: "olvidar",
            output: `Recuerdo ${params.id} olvidado.`,
            metadata: {},
          }
        }).pipe(Effect.orDie),
    } satisfies Tool.DefWithoutID<typeof Parameters, object>
  }),
)
