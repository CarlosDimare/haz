import { Effect } from "effect"
import { Memory } from "./memory"

const PATTERNS = [
  /(?:usamos?|decidimos?|preferimos?|elegimos?|optamos? por)\s+(.+?)(?:\.|,|;|$)/i,
  /(?:la|el)\s+(?:decisión|acuerdo|conclusión)\s+(?:es|fue)\s+(.+?)(?:\.|,|;|$)/i,
  /(?:no\s+)?(?:vamos\s+a|hay\s+que)\s+(?:usar|implementar|adoptar|evitar)\s+(.+?)(?:\.|,|;|$)/i,
  /(?:el|la)\s+(?:mejor\s+)?(?:práctica|enfoque|solución)\s+(?:es|sería)\s+(.+?)(?:\.|,|;|$)/i,
  /(?:importante|clave|crítico)\s*:\s*(.+?)(?:\.|,|;|$)/i,
  /quedamos?\s+en\s+que\s+(.+?)(?:\.|,|;|$)/i,
  /acordamos?\s+(?:que|usar)\s+(.+?)(?:\.|,|;|$)/i,
  /esto\s+(?:es|está)\s+(?:porque|debido a)\s+(.+?)(?:\.|,|;|$)/i,
  /la\s+(?:razón|causa|motivo)\s+(?:es|fue)\s+(.+?)(?:\.|,|;|$)/i,
]

export function extract(text: string): string[] {
  const candidates: string[] = []
  const lines = text.split("\n")
  for (const line of lines) {
    const trimmed = line.trim()
    for (const pattern of PATTERNS) {
      const match = trimmed.match(pattern)
      if (match && match[1].trim().length > 5) {
        candidates.push(match[1].trim().replace(/\.$/, ""))
      }
    }
  }
  return [...new Set(candidates)]
}

export function autoMemorize(text: string): Effect.Effect<void, never, Memory.Service> {
  return Effect.gen(function* () {
    const memory = yield* Memory.Service
    const candidates = extract(text)
    for (const frase of candidates) {
      yield* memory.add(frase)
    }
  })
}

export * as MemoryExtract from "./memory-extract"
