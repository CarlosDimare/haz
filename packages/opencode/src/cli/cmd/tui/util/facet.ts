export type FacetID = string

export interface FacetDef {
  label: string
  labelShort: string
  icon: string
  color: "warning" | "info" | "success" | "error" | "primary" | "secondary" | "accent"
  description: string
  keywords: string[]
}

export type FacetBlend = Record<FacetID, number>

export function detectFacetBlend(text: string, facets: Record<FacetID, FacetDef>): FacetBlend {
  const lower = text.toLowerCase()
  const raw: FacetBlend = {}

  for (const [id, def] of Object.entries(facets)) {
    raw[id] = 0
    for (const word of def.keywords) {
      if (lower.includes(word)) {
        raw[id]++
      }
    }
  }

  const total = Object.values(raw).reduce((a, b) => a + b, 0)
  if (total === 0) {
    const equal = 1 / Object.keys(facets).length
    const result: FacetBlend = {}
    for (const id of Object.keys(facets)) result[id] = equal
    return result
  }

  const result: FacetBlend = {}
  for (const [id, score] of Object.entries(raw)) {
    result[id] = score / total
  }
  return result
}

export function dominantFacet(blend: FacetBlend): FacetID {
  let max = 0
  let best: FacetID = Object.keys(blend)[0]
  for (const [id, val] of Object.entries(blend)) {
    if (val > max) { max = val; best = id }
  }
  return best
}
