import path from "path"
import type { FacetDef, FacetID } from "./facet"

// ── Personality from system prompt ──

export interface PersonalitySource {
  section: string
  lines: string[]
}

export interface PersonalityTrait {
  label: string
  value: number // 0..1
  color: string
  sources: PersonalitySource[]
}

// Keywords que alimentan cada rasgo de personalidad
// Se buscan en el contenido de cada sección del prompt
const TRAIT_KEYWORDS: Record<string, string[]> = {
  Brevedad: ["breve", "conciso", "ultra breve", "sin rodeos", "1-3", "sin introducciones", "sin conclusiones"],
  Humor: ["humor", "ironía", "juegos de palabra", "les luthiers", "sin vulgaridad"],
  Crítica: ["crítica", "crítico", "perspectiva de clase", "relaciones de poder", "intereses económicos", "explotación", "señalar", "contradicciones", "falacias", "¿para quién funciona", "¿a quién beneficia"],
  Precisión: ["precisión", "técnica", "profundidad", "rigor", "patrones", "protocolos", "stacks", "código", "infraestructura", "sistemas"],
  Ejecución: ["implementación", "debugging", "solución", "hacer", "código", "explicación breve", "directo"],
}

// Keywords de la última línea (tono general)
const TONE_KEYWORDS: { keyword: string; trait: string }[] = [
  { keyword: "ultra breve", trait: "Brevedad" },
  { keyword: "breve", trait: "Brevedad" },
  { keyword: "conciso", trait: "Brevedad" },
  { keyword: "humor", trait: "Humor" },
  { keyword: "ironía", trait: "Humor" },
  { keyword: "juegos de palabra", trait: "Humor" },
  { keyword: "perspectiva de clase", trait: "Crítica" },
  { keyword: "crítica", trait: "Crítica" },
  { keyword: "didáctica", trait: "Didáctica" },
]

function parsePromptTraits(prompt: string): PersonalityTrait[] {
  const lines = prompt.split("\n")

  // 1. Encontrar secciones por headers # (incluye ##)
  const sections: { name: string; start: number; level: number }[] = []
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(#+)\s+(.+)$/)
    if (m) sections.push({ name: m[2].trim(), start: i, level: m[1].length })
  }

  // 2. Por cada sección, buscar keywords de cada trait en su contenido
  const traitSources = new Map<string, PersonalitySource[]>()
  const traitWeights = new Map<string, number>()

  for (let i = 0; i < sections.length; i++) {
    const end = i + 1 < sections.length ? sections[i + 1].start : lines.length
    const sectionLines = lines.slice(sections[i].start, end)
    const count = sectionLines.length
    const contentLines = sectionLines.slice(1).map((l) => l.trim()).filter(Boolean)
    if (contentLines.length === 0) continue

    const sectionText = contentLines.join(" ").toLowerCase()

    for (const [trait, kws] of Object.entries(TRAIT_KEYWORDS)) {
      let matches = 0
      for (const kw of kws) {
        const re = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")
        const found = sectionText.match(re)
        if (found) matches += found.length
      }
      if (matches > 0) {
        traitWeights.set(trait, (traitWeights.get(trait) ?? 0) + count * matches)
        const sources = traitSources.get(trait) ?? []
        sources.push({
          section: sections[i].name,
          lines: contentLines.slice(0, 5), // primeras 5 líneas como muestra
        })
        traitSources.set(trait, sources)
      }
    }
  }

  // 3. última línea como refuerzo de tono
  const lastLine = lines[lines.length - 1]?.trim() ?? ""
  const lastLineLower = lastLine.toLowerCase()
  for (const { keyword, trait } of TONE_KEYWORDS) {
    if (lastLineLower.includes(keyword)) {
      traitWeights.set(trait, (traitWeights.get(trait) ?? 0) + 5)
      const sources = traitSources.get(trait) ?? []
      if (lastLine && !sources.some((s) => s.section === "Tono")) {
        sources.push({ section: "Tono", lines: [lastLine] })
        traitSources.set(trait, sources)
      }
    }
  }

  // 4. Normalizar a porcentajes
  const total = Array.from(traitWeights.values()).reduce((a, b) => a + b, 0)
  if (total === 0) return []

  const colors = ["warning", "info", "success", "error", "primary", "secondary", "accent"]
  let ci = 0

  return Array.from(traitWeights.entries())
    .map(([label, score]) => ({
      label,
      value: score / total,
      color: colors[ci++ % colors.length],
      sources: traitSources.get(label) ?? [],
    }))
    .sort((a, b) => b.value - a.value)
}

const DEFAULT_TRAITS: PersonalityTrait[] = [
  { label: "Brevedad", value: 0.35, color: "info", sources: [] },
  { label: "Humor", value: 0.2, color: "warning", sources: [] },
  { label: "Precisión", value: 0.2, color: "success", sources: [] },
  { label: "Crítica", value: 0.15, color: "accent", sources: [] },
  { label: "Ejecución", value: 0.1, color: "primary", sources: [] },
]

/**
 * Busca el archivo opencode.json(c) desde cwd hacia arriba.
 */
async function findConfigFile(): Promise<string | null> {
  let cwd = process.cwd()
  for (let i = 0; i < 10; i++) {
    for (const name of ["opencode.json", "opencode.jsonc"]) {
      const p = path.join(cwd, ".opencode", name)
      if (await Bun.file(p).exists()) return p
    }
    const parent = path.dirname(cwd)
    if (parent === cwd) break
    cwd = parent
  }
  return null
}

/**
 * Parsea un archivo opencode.json(c) y extrae el prompt del agente default.
 */
async function extractPromptFromConfig(filePath: string): Promise<string | null> {
  try {
    const raw = await Bun.file(filePath).text()
    const config = JSON.parse(raw)
    const defaultAgent = config.default_agent
    if (defaultAgent && config.agent?.[defaultAgent]?.prompt) {
      return config.agent[defaultAgent].prompt
    }
  } catch { /* ignore */ }
  return null
}

/**
 * Busca y lee el prompt del agente configurado.
 * Orden de prioridad:
 * 1. directorio pasado como parámetro
 * 2. búsqueda desde cwd hacia arriba
 * 3. default.txt (fallback)
 */
async function readAgentPrompt(directory?: string): Promise<string> {
  // Si hay directorio, probar ahí primero
  if (directory) {
    for (const name of ["opencode.json", "opencode.jsonc"]) {
      const p = path.join(directory, ".opencode", name)
      if (await Bun.file(p).exists()) {
        const result = await extractPromptFromConfig(p)
        if (result) return result
      }
    }
  }

  // Búsqueda automática desde cwd hacia arriba
  const configPath = await findConfigFile()
  if (configPath) {
    const result = await extractPromptFromConfig(configPath)
    if (result) return result
  }

  // Fallback: default.txt del sistema
  const p = new URL("../../../../session/prompt/default.txt", import.meta.url).pathname
  const file = Bun.file(p)
  if (await file.exists()) return await file.text()
  return ""
}

/**
 * Lee y analiza la personalidad desde el prompt del agente configurado.
 * Sin cache — siempre lee el/los archivos.
 */
export async function loadPersonality(directory?: string): Promise<PersonalityTrait[]> {
  try {
    const text = await readAgentPrompt(directory)
    if (!text) return DEFAULT_TRAITS
    return parsePromptTraits(text)
  } catch {
    return DEFAULT_TRAITS
  }
}

// ── Built-in tools ──

export const BUILTIN_TOOL_SKILLS = [
  { name: "websearch", description: "Buscar información en la web" },
  { name: "bash", description: "Ejecutar comandos de shell" },
  { name: "read", description: "Leer archivos del sistema de archivos" },
  { name: "write", description: "Escribir archivos" },
  { name: "edit", description: "Editar archivos existentes" },
  { name: "grep", description: "Buscar contenido en archivos" },
  { name: "glob", description: "Encontrar archivos por patrón" },
  { name: "webfetch", description: "Obtener contenido de URLs" },
  { name: "task", description: "Delegar trabajo a subagentes" },
] as const

export interface SkillEntry {
  name: string
  description?: string
  builtin?: boolean
}

export function getAllSkills(
  skills: { name: string; description?: string }[],
): SkillEntry[] {
  return [
    ...skills.map((s) => ({ ...s, builtin: false })),
    ...BUILTIN_TOOL_SKILLS.map((s) => ({ ...s, builtin: true })),
  ]
}
