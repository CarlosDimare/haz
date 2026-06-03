import { readFileSync } from "fs"
import path from "path"
import type { FacetDef, FacetID } from "./facet"

export const FACET_COLORS: Record<string, string> = {
  warning: "warning",
  info: "info",
  success: "success",
  error: "error",
  primary: "primary",
  secondary: "secondary",
  accent: "accent",
}

const DEFAULT_FACETS: Record<FacetID, FacetDef> = {
  hacer: {
    label: "Hacer",
    labelShort: "Hac",
    icon: "\u2699",
    color: "warning",
    description: "Arquitectura, implementación, debugging",
    keywords: [],
  },
  decir: {
    label: "Decir",
    labelShort: "Dec",
    icon: "\u270E",
    color: "info",
    description: "Documentación, revisión, comunicación",
    keywords: [],
  },
  saber: {
    label: "Saber",
    labelShort: "Sab",
    icon: "\u25CE",
    color: "success",
    description: "Investigación, análisis, aprendizaje",
    keywords: [],
  },
}

export function loadFacets(dir: string): Record<FacetID, FacetDef> {
  try {
    const filePath = path.join(dir, ".opencode", "facets.json")
    const text = readFileSync(filePath, "utf-8")
    const parsed = JSON.parse(text)
    const result: Record<FacetID, FacetDef> = {}
    for (const [id, def] of Object.entries(parsed)) {
      result[id] = def as FacetDef
    }
    return result
  } catch {
    return { ...DEFAULT_FACETS }
  }
}
