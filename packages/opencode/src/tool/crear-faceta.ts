import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import DESCRIPTION from "./crear-faceta.txt"
import path from "path"
import { readFileSync, writeFileSync, mkdirSync } from "fs"
import { AppFileSystem } from "@opencode-ai/core/filesystem"
import { InstanceState } from "@/effect/instance-state"

const VALID_COLORS = ["warning", "info", "success", "error", "primary", "secondary", "accent"] as const

export const Parameters = Schema.Struct({
  id: Schema.String.annotate({ description: "Unique identifier for the facet (e.g. 'diseniar'). Use lowercase, no spaces." }),
  label: Schema.String.annotate({ description: "Display name (e.g. 'Diseñar')." }),
  labelShort: Schema.String.annotate({ description: "Short label (2-4 chars) for the indicator bar (e.g. 'Dis')." }),
  icon: Schema.String.annotate({ description: "Single Unicode character as icon (e.g. '✦', '◆', '●')." }),
  color: Schema.String.annotate({ description: "Theme color key: warning, info, success, error, primary, secondary, or accent." }),
  description: Schema.String.annotate({ description: "One-line description of when this facet activates." }),
  keywords: Schema.Array(Schema.String).annotate({ description: "List of trigger keywords (lowercase, including English and Spanish variants)." }),
})

export const CrearFacetaTool = Tool.define<typeof Parameters, object, AppFileSystem.Service>(
  "crear-faceta",
  Effect.gen(function* () {
    const fs = yield* AppFileSystem.Service

    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, _ctx: Tool.Context) =>
        Effect.gen(function* () {
          const ctx = yield* InstanceState.context
          const dir = path.join(ctx.directory, ".opencode")
          const filePath = path.join(dir, "facets.json")

          let facets: Record<string, any> = {}
          try {
            const text = yield* fs.readFileStringSafe(filePath).pipe(Effect.orDie)
            if (text) facets = JSON.parse(text)
          } catch {}

          facets[params.id] = {
            label: params.label,
            labelShort: params.labelShort,
            icon: params.icon,
            color: params.color,
            description: params.description,
            keywords: params.keywords,
          }

          yield* fs.writeWithDirs(filePath, JSON.stringify(facets, null, 2)).pipe(Effect.orDie)

          return {
            title: `crear-faceta: ${params.label}`,
            output: `Faceta "${params.label}" creada con ${params.keywords.length} keywords.`,
            metadata: {},
          }
        }).pipe(Effect.orDie),
    } satisfies Tool.DefWithoutID<typeof Parameters, object>
  }),
)
