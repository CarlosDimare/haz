import { Effect, Schema } from "effect"
import { HttpClient } from "effect/unstable/http"
import * as Tool from "./tool"
import * as McpWebSearch from "./mcp-websearch"
import { selectWebSearchProvider } from "./websearch"
import DEEP_SEARCH_DESCRIPTION from "./walsh-deep-search.txt"
import VERIFY_DESCRIPTION from "./walsh-verify.txt"
import { InstallationVersion } from "@opencode-ai/core/installation/version"

function parallelAuthHeaders() {
  const headers = { "User-Agent": `opencode/${InstallationVersion}` }
  if (!process.env.PARALLEL_API_KEY) return headers
  return { ...headers, Authorization: `Bearer ${process.env.PARALLEL_API_KEY}` }
}

function callProvider(
  http: HttpClient.HttpClient,
  provider: string,
  query: string,
) {
  if (provider === "parallel") {
    return McpWebSearch.call(
      http,
      McpWebSearch.PARALLEL_URL,
      "web_search",
      McpWebSearch.ParallelSearchArgs,
      {
        objective: query,
        search_queries: [query],
      },
      "25 seconds",
      parallelAuthHeaders(),
    )
  }

  return McpWebSearch.call(
    http,
    McpWebSearch.EXA_URL,
    "web_search_exa",
    McpWebSearch.SearchArgs,
    {
      query,
      type: "auto",
      numResults: 5,
      livecrawl: "fallback",
      contextMaxCharacters: 5000,
    },
    "25 seconds",
  )
}

function parseResults(result: string): { title?: string; url?: string; content?: string }[] {
  try {
    const parsed = JSON.parse(result)
    if (parsed?.results) return parsed.results
  } catch {}
  return []
}

function formatSources(sources: { title?: string; url?: string; content?: string }[]): string {
  if (!sources.length) return "  _Sin resultados_"
  return sources
    .map((s, i) => {
      const snippet = (s.content || "").slice(0, 180).replace(/\n/g, " ").trim()
      const title = s.title || "Sin título"
      if (!snippet && !s.url) return `${i + 1}. **${title}**`
      if (!snippet) return `${i + 1}. **${title}** · ${s.url}`
      if (!s.url) return `${i + 1}. **${title}** — ${snippet}`
      return `${i + 1}. **${title}** — ${snippet} · ${s.url}`
    })
    .join("\n")
}

export const DeepSearchParameters = Schema.Struct({
  queries: Schema.mutable(Schema.Array(Schema.String)).annotate({
    description: "Array of 3 to 9 search queries from different angles on the same topic",
  }),
})

export const WalshDeepSearchTool = Tool.define(
  "walsh_deep_search",
  Effect.gen(function* () {
    const http = yield* HttpClient.HttpClient

    return {
      description: DEEP_SEARCH_DESCRIPTION,
      parameters: DeepSearchParameters,
      execute: (params: Schema.Schema.Type<typeof DeepSearchParameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const provider = selectWebSearchProvider(ctx.sessionID)
          yield* ctx.metadata({ title: `Walsh deep search (${params.queries.length} queries)`, metadata: { provider } })

          yield* ctx.ask({
            permission: "walsh_deep_search",
            patterns: params.queries,
            always: ["*"],
            metadata: { queries: params.queries, provider },
          })

          const results = yield* Effect.forEach(
            params.queries,
            (query, i) =>
              Effect.gen(function* () {
                const result = yield* callProvider(http, provider, query)
                return { query, index: i, result }
              }).pipe(
                Effect.withSpan("walsh.deep_search.query", { attributes: { query: query.slice(0, 100) } }),
              ),
            { concurrency: "unbounded" },
          )

          const allSources = results.flatMap((r) => parseResults(r.result ?? ""))
          const allSourcesCount = allSources.length
          const uniqueUrls = new Set(allSources.map((s) => s.url).filter(Boolean)).size

          const queryBlocks = results.map((r) => {
            const sources = parseResults(r.result ?? "")
            const sourcesFormatted = formatSources(sources)
            return [
              `### "${r.query}"`,
              sourcesFormatted,
            ].join("\n")
          })

          const output = [
            `## 🔍 Búsqueda profunda`,
            `${params.queries.length} queries · ${allSourcesCount} fuentes · ${uniqueUrls} fuentes únicas · vía ${provider}`,
            "",
            ...queryBlocks,
            "",
            `---`,
            `_walsh deep search · ${params.queries.length} queries · ${allSourcesCount} sources_`,
          ].join("\n")

          return {
            output,
            title: `Walsh deep search: ${params.queries.length} queries`,
            metadata: { provider, queries: params.queries.length },
          }
        }).pipe(Effect.orDie),
    }
  }),
)

export const VerifyParameters = Schema.Struct({
  claim: Schema.String.annotate({ description: "The claim or statement to verify" }),
  sources: Schema.optional(
    Schema.mutable(Schema.Array(Schema.String)),
  ).annotate({
    description: "Optional specific URLs or sources to check against the claim",
  }),
})

export const WalshVerifyTool = Tool.define(
  "walsh_verify",
  Effect.gen(function* () {
    const http = yield* HttpClient.HttpClient

    return {
      description: VERIFY_DESCRIPTION,
      parameters: VerifyParameters,
      execute: (params: Schema.Schema.Type<typeof VerifyParameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const provider = selectWebSearchProvider(ctx.sessionID)
          yield* ctx.metadata({ title: `Walsh verify: "${params.claim.slice(0, 80)}"`, metadata: { provider } })

          yield* ctx.ask({
            permission: "walsh_verify",
            patterns: [params.claim],
            always: ["*"],
            metadata: { claim: params.claim, sources: params.sources, provider },
          })

          const verifyQueries = [params.claim, `"${params.claim}" fact check`, `"${params.claim}" source`]
          const results = yield* Effect.forEach(
            verifyQueries,
            (query, i) =>
              Effect.gen(function* () {
                const result = yield* callProvider(http, provider, query)
                return { query, index: i, result }
              }),
            { concurrency: "unbounded" },
          )

          const allSources = results.flatMap((r) => parseResults(r.result ?? ""))
          const allSourcesCount = allSources.length
          const uniqueUrls = new Set(allSources.map((s) => s.url).filter(Boolean)).size

          const queryBlocks = results.map((r) => {
            const sources = parseResults(r.result ?? "")
            const sourcesFormatted = formatSources(sources)
            return [
              `### "${r.query}"`,
              sourcesFormatted,
            ].join("\n")
          })

          const output = [
            `## ✅ Verificación: "${params.claim}"`,
            `${verifyQueries.length} búsquedas · ${allSourcesCount} fuentes · ${uniqueUrls} fuentes únicas · vía ${provider}`,
            "",
            ...queryBlocks,
            "",
            `---`,
            `⚠️ _Verificación preliminar. Contrastá con fuentes primarias y verificá fechas de publicación._`,
          ].join("\n")

          return {
            output,
            title: `Walsh verify: "${params.claim.slice(0, 60)}"`,
            metadata: { provider },
          }
        }).pipe(Effect.orDie),
    }
  }),
)
