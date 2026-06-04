import path from "path"
import { Filesystem } from "@/util/filesystem"

// ── Types ──────────────────────────────────────────────────────────────────

export interface SubAgentLog {
  timestamp: number
  level: "info" | "error" | "result"
  message: string
  detail?: string
}

export interface SubAgent {
  id: string
  name: string
  tasks: string
  cron: string
  enabled: boolean
  color: string
  lastRun?: number
  log?: SubAgentLog[]
}

export type CircuitMode = "pipeline" | "evaluator" | "supervisor"

export interface CircuitConnection {
  from: string
  to: string
  condition?: string
}

export interface Circuit {
  id: string
  name: string
  connections: CircuitConnection[]
  cron: string
  mode: CircuitMode
  maxLoops?: number // for evaluator mode
}

export interface ProjectFile {
  path: string
  content: string
  updatedAt: number
  agentId?: string
}

export interface Project {
  id: string
  name: string
  subAgents: SubAgent[]
  circuits: Circuit[]
  files: ProjectFile[]
  createdAt: number
  updatedAt: number
}

export interface ProjectsData {
  projects: Project[]
}

// ── Defaults ───────────────────────────────────────────────────────────────

const AGENT_COLORS = ["#f0a030", "#50c878", "#4a9eff", "#ff6b6b", "#c084fc", "#f472b6"]

export function defaultSubAgent(name: string, index: number): SubAgent {
  return {
    id: generateId(),
    name,
    tasks: "",
    cron: "",
    enabled: true,
    color: AGENT_COLORS[index % AGENT_COLORS.length],
    log: [],
  }
}

export function defaultProject(name: string): Project {
  return {
    id: generateId(),
    name,
    subAgents: [],
    circuits: [],
    files: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

// ── Storage ────────────────────────────────────────────────────────────────

const STORAGE_DIR = ".haz"

function filePath(directory: string): string {
  return path.join(directory, STORAGE_DIR, "projects.json")
}

export async function loadProjects(directory: string): Promise<Project[]> {
  try {
    const data = await Filesystem.readJson<ProjectsData>(filePath(directory))
    return data.projects ?? []
  } catch {
    return []
  }
}

export async function saveProjects(directory: string, projects: Project[]): Promise<void> {
  try {
    await Filesystem.writeJson(filePath(directory), { projects })
  } catch {
    // silently fail — project panel is non-critical
  }
}

// ── ID generator ───────────────────────────────────────────────────────────

let idCounter = Date.now()
export function generateId(): string {
  return `p${idCounter++}`
}

// ── Mutations (immutable helpers) ──────────────────────────────────────────

export function addProject(projects: Project[], name: string): Project[] {
  return [...projects, defaultProject(name)]
}

export function removeProject(projects: Project[], id: string): Project[] {
  return projects.filter((p) => p.id !== id)
}

export function updateProject(projects: Project[], id: string, patch: Partial<Project>): Project[] {
  return projects.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p))
}

export function addSubAgent(projects: Project[], projectId: string, name: string, index: number): Project[] {
  return projects.map((p) =>
    p.id === projectId ? { ...p, subAgents: [...p.subAgents, defaultSubAgent(name, index)], updatedAt: Date.now() } : p,
  )
}

export function removeSubAgent(projects: Project[], projectId: string, agentId: string): Project[] {
  return projects.map((p) =>
    p.id === projectId
      ? {
          ...p,
          subAgents: p.subAgents.filter((a) => a.id !== agentId),
          circuits: p.circuits.map((c) => ({
            ...c,
            connections: c.connections.filter((conn) => conn.from !== agentId && conn.to !== agentId),
          })),
          updatedAt: Date.now(),
        }
      : p,
  )
}

export function updateSubAgent(projects: Project[], projectId: string, agentId: string, patch: Partial<SubAgent>): Project[] {
  return projects.map((p) =>
    p.id === projectId
      ? { ...p, subAgents: p.subAgents.map((a) => (a.id === agentId ? { ...a, ...patch } : a)), updatedAt: Date.now() }
      : p,
  )
}

export function addCircuit(projects: Project[], projectId: string, name: string): Project[] {
  return projects.map((p) =>
    p.id === projectId
      ? { ...p, circuits: [...p.circuits, { id: generateId(), name, connections: [], cron: "", mode: "pipeline", maxLoops: 3 }], updatedAt: Date.now() }
      : p,
  )
}

export function updateCircuit(projects: Project[], projectId: string, circuitId: string, patch: Partial<Circuit>): Project[] {
  return projects.map((p) =>
    p.id === projectId
      ? { ...p, circuits: p.circuits.map((c) => (c.id === circuitId ? { ...c, ...patch } : c)), updatedAt: Date.now() }
      : p,
  )
}

export function addConnection(
  projects: Project[],
  projectId: string,
  circuitId: string,
  from: string,
  to: string,
  condition?: string,
): Project[] {
  return projects.map((p) =>
    p.id === projectId
      ? {
          ...p,
          circuits: p.circuits.map((c) =>
            c.id === circuitId ? { ...c, connections: [...c.connections, { from, to, condition }] } : c,
          ),
          updatedAt: Date.now(),
        }
      : p,
  )
}

export function removeConnection(
  projects: Project[],
  projectId: string,
  circuitId: string,
  connIndex: number,
): Project[] {
  return projects.map((p) =>
    p.id === projectId
      ? {
          ...p,
          circuits: p.circuits.map((c) =>
            c.id === circuitId
              ? { ...c, connections: c.connections.filter((_, i) => i !== connIndex) }
              : c,
          ),
          updatedAt: Date.now(),
        }
      : p,
  )
}

export function addProjectFile(
  projects: Project[],
  projectId: string,
  filePath: string,
  content: string,
  agentId?: string,
): Project[] {
  return projects.map((p) =>
    p.id === projectId
      ? {
          ...p,
          files: [
            ...p.files.filter((f) => f.path !== filePath),
            { path: filePath, content, updatedAt: Date.now(), agentId },
          ],
          updatedAt: Date.now(),
        }
      : p,
  )
}

export function updateProjectFile(
  projects: Project[],
  projectId: string,
  filePath: string,
  content: string,
): Project[] {
  return projects.map((p) =>
    p.id === projectId
      ? {
          ...p,
          files: p.files.map((f) =>
            f.path === filePath ? { ...f, content, updatedAt: Date.now() } : f,
          ),
          updatedAt: Date.now(),
        }
      : p,
  )
}


