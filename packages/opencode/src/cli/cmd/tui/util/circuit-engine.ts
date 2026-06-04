import type { SubAgent, SubAgentLog, Circuit, ProjectFile, CircuitMode } from "./projects-storage"

// ── Types ───────────────────────────────────────────────────────────────────

export interface CircuitState {
  [key: string]: {
    output: string
    agentName?: string
    completedAt?: number
  }
}

export interface NodeResult {
  nodeId: string
  agentName: string
  output: string
  error?: string
  duration: number
  sessionId: string
}

export interface CircuitResult {
  results: NodeResult[]
  outputFiles: ProjectFile[]
  state: CircuitState
}

export type LogFn = (nodeId: string, level: SubAgentLog["level"], message: string, detail?: string) => void
export type ProgressFn = (nodeId: string, status: "running" | "completed" | "failed" | "paused") => void
export type PauseFn = (nodeId: string, agentName: string, message: string) => Promise<string | null>

// ── Template resolution ─────────────────────────────────────────────────────

function resolveTemplate(text: string, state: CircuitState, agents: SubAgent[]): string {
  return text.replace(/\{\$([\w.]+(?::\w+(?:\([^)]*\))?)?)\}/g, (match, raw) => {
    const [keyPath, modifierRaw] = raw.split(":")
    const modifier = modifierRaw ? parseModifier(modifierRaw) : null
    let value = state[keyPath]?.output
    if (value === undefined) {
      const agent = agents.find((a) => a.name === keyPath)
      if (agent) value = state[agent.id]?.output ?? state[agent.name]?.output
    }
    if (value === undefined) return match
    if (modifier) return modifier(value)
    return value
  })
}

type Modifier = (v: string) => string

function parseModifier(raw: string): Modifier | null {
  const t = raw.match(/^truncate\((\d+)\)$/)
  if (t) { const n = Number.parseInt(t[1]); return (v) => v.slice(0, n) }
  const l = raw.match(/^lines\((\d+)\)$/)
  if (l) { const n = Number.parseInt(l[1]); return (v) => v.split("\n").slice(0, n).join("\n") }
  if (raw === "json") return (v) => { try { return JSON.stringify(v) } catch { return v } }
  return null
}

// ── Condition evaluation ────────────────────────────────────────────────────

/**
 * Evaluate a condition string against the source node's output.
 * Returns true if the edge should be followed.
 *
 * Simple conditions:
 *   "contains:texto"   → true if output includes "texto"
 *   "empty"            → true if output is empty
 *   "length>N"         → true if output length > N
 *   "match:/regex/"    → true if output matches regex
 *   "yes" / "no"       → literal boolean
 *   "" or undefined    → always true (unconditional)
 */
function evaluateCondition(condition: string | undefined, output: string): boolean {
  if (!condition || condition.trim() === "") return true

  const c = condition.trim()

  if (c === "yes" || c === "true" || c === "si") return true
  if (c === "no" || c === "false") return false
  if (c === "empty") return output.trim() === ""
  if (c === "not-empty") return output.trim() !== ""

  const containsMatch = c.match(/^contains:(.+)/)
  if (containsMatch) return output.toLowerCase().includes(containsMatch[1].toLowerCase())

  const lengthMatch = c.match(/^length>(\d+)/)
  if (lengthMatch) return output.length > Number.parseInt(lengthMatch[1])

  const lengthLt = c.match(/^length<(\d+)/)
  if (lengthLt) return output.length < Number.parseInt(lengthLt[1])

  const regexMatch = c.match(/^match:\/(.+)\//)
  if (regexMatch) {
    try { return new RegExp(regexMatch[1]).test(output) } catch { return true }
  }

  // Default: non-empty condition string = true
  return true
}

// ── DAG helpers ─────────────────────────────────────────────────────────────

type Graph = Map<string, { to: string; condition?: string }[]>

function buildGraph(agents: SubAgent[], circuit: Circuit): Graph {
  const graph: Graph = new Map()
  for (const a of agents) graph.set(a.id, [])
  for (const conn of circuit.connections) {
    const edges = graph.get(conn.from)
    if (edges) edges.push({ to: conn.to, condition: conn.condition })
  }
  return graph
}

function computeInDegrees(agents: SubAgent[], circuit: Circuit): Map<string, number> {
  const indeg = new Map<string, number>()
  for (const a of agents) indeg.set(a.id, 0)
  for (const conn of circuit.connections) indeg.set(conn.to, (indeg.get(conn.to) ?? 0) + 1)
  return indeg
}

function topologicalLevels(agents: SubAgent[], circuit: Circuit): string[][] {
  const graph = buildGraph(agents, circuit)
  const indeg = computeInDegrees(agents, circuit)
  const levels: string[][] = []
  let frontier = [...indeg.entries()].filter(([, d]) => d === 0).map(([id]) => id).filter((id) => graph.has(id))
  while (frontier.length > 0) {
    levels.push(frontier)
    const next: string[] = []
    for (const nodeId of frontier) {
      for (const { to } of graph.get(nodeId) ?? []) {
        const updated = (indeg.get(to) ?? 1) - 1; indeg.set(to, updated)
        if (updated === 0) next.push(to)
      }
    }
    frontier = next
  }
  return levels
}

function predecessors(nodeId: string, circuit: Circuit): { id: string; condition?: string }[] {
  return circuit.connections.filter((c) => c.to === nodeId).map((c) => ({ id: c.from, condition: c.condition }))
}

// ── Executor ────────────────────────────────────────────────────────────────

interface ExecuteOptions {
  circuit: Circuit
  agents: SubAgent[]
  allCircuits?: Circuit[]
  sdk: { client: { session: { fork: Function; prompt: Function } }; directory: string }
  parentSessionId: string
  onLog: LogFn
  onProgress?: ProgressFn
  onPause?: PauseFn
  state?: CircuitState
}

async function executePrompt(
  sdk: ExecuteOptions["sdk"],
  sessionId: string,
  prompt: string,
): Promise<string> {
  const response: any = await sdk.client.session.prompt(
    { sessionID: sessionId, directory: sdk.directory, parts: [{ type: "text" as const, text: prompt }] },
    { throwOnError: true },
  )
  const textParts = (response.data?.parts ?? []).filter((p: any) => p.type === "text")
  return textParts.map((p: any) => p.text).join("\n").trim() || "(sin respuesta)"
}

async function forkSession(
  sdk: ExecuteOptions["sdk"],
  parentSessionId: string,
  onLog: LogFn,
  nodeId: string,
): Promise<string | null> {
  try {
    const forkRes: any = await sdk.client.session.fork(
      { sessionID: parentSessionId, directory: sdk.directory },
      { throwOnError: true },
    )
    return forkRes.data.id
  } catch (e: any) {
    onLog(nodeId, "error", `✗ Error al crear sesión: ${e?.message ?? e}`)
    return null
  }
}

// ── Main execution ──────────────────────────────────────────────────────────

export const circuitEngine = {
  async execute(opts: ExecuteOptions): Promise<CircuitResult> {
    const { circuit, agents, allCircuits = [], onLog, onProgress, onPause, sdk, parentSessionId } = opts
    const state: CircuitState = { ...opts.state }
    const agentMap = new Map(agents.map((a) => [a.id, a]))
    const activeAgents = agents.filter((a) => a.enabled && a.tasks.trim())
    const results: NodeResult[] = []
    const outputFiles: ProjectFile[] = []

    if (activeAgents.length === 0) {
      onLog("", "error", "No hay agentes habilitados con tareas")
      return { results, outputFiles, state }
    }

    // ── Mode dispatch ────────────────────────────────────────────────────
    if (circuit.mode === "evaluator") {
      return await executeEvaluatorMode(opts, state, agentMap, activeAgents, results, outputFiles)
    }
    if (circuit.mode === "supervisor") {
      return await executeSupervisorMode(opts, state, agentMap, activeAgents, results, outputFiles)
    }

    // ── Default: pipeline mode (DAG with conditional edges) ──────────────
    return await executePipelineMode(opts, state, agentMap, activeAgents, results, outputFiles)
  },

  plan(circuit: Circuit, agents: SubAgent[]): { levels: string[][]; nodeCount: number; mode: CircuitMode; supervisor?: string } {
    const active = agents.filter((a) => a.enabled && a.tasks.trim())
    if (circuit.mode === "supervisor") {
      const supervisor = active[0]
      const workers = active.slice(1)
      return {
        levels: [[supervisor?.name ?? "(supervisor)"], workers.map((w) => w.name)],
        nodeCount: active.length,
        mode: circuit.mode,
        supervisor: supervisor?.name ?? "(sin supervisor)",
      }
    }
    const levels = topologicalLevels(active, circuit)
    return {
      levels: levels.map((l) => l.map((id) => agents.find((a) => a.id === id)?.name ?? id)),
      nodeCount: active.length,
      mode: circuit.mode,
    }
  },
}

// ── Pipeline mode (DAG with conditional edges) ──────────────────────────────

async function executePipelineMode(
  opts: ExecuteOptions,
  state: CircuitState,
  agentMap: Map<string, SubAgent>,
  activeAgents: SubAgent[],
  results: NodeResult[],
  outputFiles: ProjectFile[],
): Promise<CircuitResult> {
  const { circuit, agents, allCircuits = [], onLog, onProgress, onPause, sdk, parentSessionId } = opts

  // Build dynamic frontier — walk graph edge by edge with condition evaluation
  const graph = buildGraph(activeAgents, circuit)
  const indeg = computeInDegrees(activeAgents, circuit)
  const executed = new Set<string>()
  const completed = new Set<string>()
  let frontier = [...indeg.entries()].filter(([, d]) => d === 0).map(([id]) => id).filter((id) => graph.has(id))

  const totalNodes = activeAgents.length
  let completedCount = 0
  onLog("", "info", `▶ "${circuit.name}" (pipeline) — ${totalNodes} agentes`)

  while (frontier.length > 0) {
    const currentLevel = [...frontier]
    frontier = []

    onLog("", "info", `  Nivel · ${currentLevel.map((id) => agentMap.get(id)?.name ?? id).join(", ")}`)

    const levelResults = await Promise.all(currentLevel.map(async (nodeId) => {
      const agent = agentMap.get(nodeId)
      if (!agent || executed.has(nodeId)) return
      executed.add(nodeId)
      onProgress?.(nodeId, "running")

      // Check sub-circuit
      const subMatch = agent.tasks.trim().match(/^@circuit\s+(.+)/)
      if (subMatch) {
        const subName = subMatch[1].trim()
        const subCircuit = allCircuits.find((c) => c.name === subName)
        if (!subCircuit) {
          onLog(nodeId, "error", `✗ Subcircuito "${subName}" no encontrado`)
          onProgress?.(nodeId, "failed")
          completed.add(nodeId); completedCount++
          return
        }
        onLog(nodeId, "info", `▶▶ Subcircuito: ${subCircuit.name}`)
        await circuitEngine.execute({
          circuit: subCircuit, agents, allCircuits, sdk, parentSessionId,
          onLog: (subId, lvl, msg, det) => onLog(`${nodeId}>${subId}`, lvl, msg, det),
          onProgress: (subId, st) => onProgress?.(`${nodeId}>${subId}`, st),
          state,
        })
        onLog(nodeId, "result", `✓ Subcircuito "${subCircuit.name}" completado`)
        completed.add(nodeId); completedCount++
        onProgress?.(nodeId, "completed")
        return
      }

      // Resolve templates
      const resolvedTasks = resolveTemplate(agent.tasks, state, agents)

      // Check for @pause
      if (onPause && resolvedTasks.includes("@pause")) {
        onLog(nodeId, "info", `⏸ Pausado — esperando input...`)
        onProgress?.(nodeId, "paused")
        const pauseMsg = resolvedTasks.match(/@pause\s*(.*)/)?.[1]?.trim() || "Se requiere input para continuar"
        const userInput = await onPause(nodeId, agent.name, pauseMsg)
        if (userInput === null) {
          onLog(nodeId, "error", `✗ Cancelado por el usuario`)
          completed.add(nodeId); completedCount++
          onProgress?.(nodeId, "failed")
          return
        }
        onLog(nodeId, "info", `  Input recibido: ${userInput.slice(0, 60)}`)
      }

      // Build context (only from completed predecessors that passed their conditions)
      const preds = predecessors(nodeId, circuit)
      const ctxParts: string[] = []
      for (const pred of preds) {
        const pAgent = agentMap.get(pred.id)
        const pState = state[pred.id] ?? state[pAgent?.name ?? ""]
        if (pState?.output) {
          ctxParts.push(`=== "${pAgent?.name ?? pred.id}" ===\n${pState.output}`)
        }
      }
      const context = ctxParts.length > 0
        ? `[Contexto de ejecuciones anteriores]\n${ctxParts.join("\n\n")}\n[/Contexto]`
        : ""

      // Fork + execute
      const sessionId = await forkSession(sdk, parentSessionId, onLog, nodeId)
      if (!sessionId) { completed.add(nodeId); completedCount++; onProgress?.(nodeId, "failed"); return }

      const fullPrompt = context ? `${context}\n\n${resolvedTasks}` : resolvedTasks
      const startTime = Date.now()
      onLog(nodeId, "info", `▶ ${agent.name} (${resolvedTasks.split("\n").filter(Boolean).length} tareas)`)
      if (context) onLog(nodeId, "info", `  Contexto de ${preds.length} antecesor(es)`)

      try {
        const output = await executePrompt(sdk, sessionId, fullPrompt)
        const dur = Date.now() - startTime
        results.push({ nodeId: nodeId, agentName: agent.name, output, duration: dur, sessionId })
        state[agent.name] = { output, agentName: agent.name, completedAt: Date.now() }
        state[agent.id] = { output, agentName: agent.name, completedAt: Date.now() }
        completed.add(nodeId); completedCount++
        onLog(nodeId, "result", output.slice(0, 200) || "Completado", output)
        onProgress?.(nodeId, "completed")

        outputFiles.push({
          path: `output/${agent.name}_${Date.now()}.md`,
          content: `# ${agent.name}\n\n## Tareas\n\n${agent.tasks}\n\n## Resultado\n\n${output}\n\n---\n*Generado automáticamente por haz.*`,
          updatedAt: Date.now(), agentId: agent.id,
        })
      } catch (e: any) {
        completed.add(nodeId); completedCount++
        onLog(nodeId, "error", `✗ Error: ${(e?.message ?? e).slice(0, 80)}`, `${e}`)
        results.push({ nodeId: nodeId, agentName: agent.name, output: "", error: e?.message ?? String(e), duration: Date.now() - startTime, sessionId })
        state[agent.name] = { output: `Error: ${e?.message ?? e}`, agentName: agent.name, completedAt: Date.now() }
        onProgress?.(nodeId, "failed")
      }
    }))

    // After executing current level, compute next frontier
    // Only follow edges whose conditions pass
    const nextCandidates = new Set<string>()
    for (const nodeId of currentLevel) {
      const edges = graph.get(nodeId) ?? []
      const nodeOutput = state[nodeId]?.output ?? state[agentMap.get(nodeId)?.name ?? ""]?.output ?? ""
      for (const edge of edges) {
        if (evaluateCondition(edge.condition, nodeOutput)) {
          nextCandidates.add(edge.to)
        } else {
          onLog("", "info", `  Condición no cumplida: ${agentMap.get(nodeId)?.name ?? nodeId} → ${agentMap.get(edge.to)?.name ?? edge.to} (saltado)`)
        }
      }
    }

    // A node is ready if all its predecessors have been executed
    frontier = [...nextCandidates].filter((id) => {
      const preds = predecessors(id, circuit)
      return preds.every((p) => completed.has(p.id))
    })
  }

  onLog("", "result", `✓ Circuito "${circuit.name}" completado (${completedCount}/${totalNodes} nodos)`)
  return { results, outputFiles, state }
}

// ── Evaluator-Optimizer mode ────────────────────────────────────────────────

async function executeEvaluatorMode(
  opts: ExecuteOptions,
  state: CircuitState,
  agentMap: Map<string, SubAgent>,
  activeAgents: SubAgent[],
  results: NodeResult[],
  outputFiles: ProjectFile[],
): Promise<CircuitResult> {
  const { circuit, agents, allCircuits = [], onLog, onProgress, onPause, sdk, parentSessionId } = opts
  const maxLoops = circuit.maxLoops ?? 3

  // First N-1 agents are generators, last agent is the evaluator
  const generators = activeAgents.slice(0, -1)
  const evaluator = activeAgents[activeAgents.length - 1]

  if (!evaluator) {
    onLog("", "error", "Modo evaluator necesita al menos 2 agentes (generador + evaluador)")
    return { results, outputFiles, state }
  }

  onLog("", "info", `▶ "${circuit.name}" (evaluator-optimizer, max ${maxLoops} iteraciones)`)

  for (let iteration = 0; iteration < maxLoops; iteration++) {
    onLog("", "info", `  Iteración ${iteration + 1}/${maxLoops}`)

    // Run generators
    for (const agent of generators) {
      onProgress?.(agent.id, "running")
      const resolvedTasks = resolveTemplate(agent.tasks, state, agents)
      const sessionId = await forkSession(sdk, parentSessionId, onLog, agent.id)
      if (!sessionId) { onProgress?.(agent.id, "failed"); continue }

      // Build context from all prior state
      const ctxParts = Object.entries(state).map(([k, v]) =>
        v.agentName && v.output ? `=== "${v.agentName}" ===\n${v.output}` : ""
      ).filter(Boolean)
      const context = ctxParts.length > 0 ? `[Contexto]\n${ctxParts.join("\n\n")}\n[/Contexto]\n\n` : ""

      const startTime = Date.now()
      onLog(agent.id, "info", `▶ ${agent.name}`)
      try {
        const output = await executePrompt(sdk, sessionId, context + resolvedTasks)
        state[agent.name] = { output, agentName: agent.name, completedAt: Date.now() }
        state[agent.id] = { output, agentName: agent.name, completedAt: Date.now() }
        results.push({ nodeId: agent.id, agentName: agent.name, output, duration: Date.now() - startTime, sessionId })
        onLog(agent.id, "result", output.slice(0, 200) || "Generado", output)
        onProgress?.(agent.id, "completed")
      } catch (e: any) {
        onLog(agent.id, "error", `✗ ${e?.message ?? e}`)
        onProgress?.(agent.id, "failed")
      }
    }

    // Run evaluator
    onProgress?.(evaluator.id, "running")
    const evalTasks = resolveTemplate(evaluator.tasks, state, agents)
    const evalSession = await forkSession(sdk, parentSessionId, onLog, evaluator.id)

    if (evalSession) {
      const startTime = Date.now()
      onLog(evaluator.id, "info", `▶ Evaluando...`)
      try {
        const evalOutput = await executePrompt(sdk, evalSession, evalTasks)
        state[evaluator.name] = { output: evalOutput, agentName: evaluator.name, completedAt: Date.now() }
        results.push({ nodeId: evaluator.id, agentName: evaluator.name, output: evalOutput, duration: Date.now() - startTime, sessionId: evalSession })

        // Check if approved — evaluator output contains approval keywords
        const approved = /\b(APROBADO|APROVED|ACEPTADO|OK|✓|PASS|APPROVED)\b/i.test(evalOutput)
        onLog(evaluator.id, "result", approved
          ? `✓ Aprobado (iteración ${iteration + 1})`
          : `↻ Requiere mejora: ${evalOutput.slice(0, 200)}`, evalOutput)

        if (approved) {
          onLog("", "result", `✓ Circuito aprobado tras ${iteration + 1} iteraciones`)

          // Generate output files
          for (const r of results) {
            const a = agents.find((x) => x.id === r.nodeId)
            if (a && r.output) {
              outputFiles.push({
                path: `output/${a.name}_${Date.now()}.md`, agentId: a.id,
                content: `# ${a.name}\n\n## Resultado final\n\n${r.output}\n\n---\n*Generado automáticamente por haz.*`,
                updatedAt: Date.now(),
              })
            }
          }
          return { results, outputFiles, state }
        }

        // Feed back to generators for next iteration
        onLog("", "info", `  Feedback: ${evalOutput.slice(0, 100)}...`)
        onProgress?.(evaluator.id, "completed")
      } catch (e: any) {
        onLog(evaluator.id, "error", `✗ ${e?.message ?? e}`)
        onProgress?.(evaluator.id, "failed")
      }
    }

    if (iteration < maxLoops - 1) {
      onLog("", "info", `  ↻ Siguiente iteración...`)
    }
  }

  onLog("", "result", `○ Circuito finalizado tras ${maxLoops} iteraciones (sin aprobación)`)
  return { results, outputFiles, state }
}

// ── Supervisor / Worker mode ─────────────────────────────────────────────

/**
 * Supervisor/Worker mode:
 *   1. Supervisor (first agent) recibe el task, analiza y genera sub-tareas.
 *   2. Workers (rest) ejecutan en paralelo las sub-tareas asignadas.
 *   3. Resultados consolidados.
 *
 * El supervisor asigna tareas a través de directivas `@asignar AgentName: tarea`
 * en su output. Si no hay directivas, cada worker ejecuta su propia task desc.
 */
async function executeSupervisorMode(
  opts: ExecuteOptions,
  state: CircuitState,
  agentMap: Map<string, SubAgent>,
  activeAgents: SubAgent[],
  results: NodeResult[],
  outputFiles: ProjectFile[],
): Promise<CircuitResult> {
  const { circuit, agents, allCircuits = [], onLog, onProgress, onPause, sdk, parentSessionId } = opts

  const [supervisor, ...workers] = activeAgents
  if (!supervisor) {
    onLog("", "error", "Modo supervisor necesita al menos 1 agente supervisor")
    return { results, outputFiles, state }
  }

  onLog("", "info", `▶ "${circuit.name}" (supervisor/worker — supervisor: ${supervisor.name}, workers: ${workers.length})`)

  // ── Step 1: Run supervisor ────────────────────────────────────────────
  onProgress?.(supervisor.id, "running")
  const resolvedSuperTask = resolveTemplate(supervisor.tasks, state, agents)
  const superSession = await forkSession(sdk, parentSessionId, onLog, supervisor.id)

  let supervisorOutput = ""
  if (superSession) {
    const startTime = Date.now()
    onLog(supervisor.id, "info", `▶ Supervisor: ${supervisor.name} planificando...`)
    try {
      supervisorOutput = await executePrompt(sdk, superSession, resolvedSuperTask)
      state[supervisor.name] = { output: supervisorOutput, agentName: supervisor.name, completedAt: Date.now() }
      state[supervisor.id] = { output: supervisorOutput, agentName: supervisor.name, completedAt: Date.now() }
      results.push({
        nodeId: supervisor.id, agentName: supervisor.name, output: supervisorOutput,
        duration: Date.now() - startTime, sessionId: superSession,
      })
      const preview = supervisorOutput.slice(0, 300)
      onLog(supervisor.id, "result", preview || "Plan generado", supervisorOutput)
      onProgress?.(supervisor.id, "completed")

      outputFiles.push({
        path: `output/${supervisor.name}_plan_${Date.now()}.md`, agentId: supervisor.id,
        content: `# Plan: ${supervisor.name}\n\n${supervisorOutput}\n\n---\n*Generado automáticamente por haz.*`,
        updatedAt: Date.now(),
      })
    } catch (e: any) {
      onLog(supervisor.id, "error", `✗ Error en supervisor: ${(e?.message ?? e).slice(0, 80)}`)
      onProgress?.(supervisor.id, "failed")
      // Continue with workers even if supervisor fails (use their own tasks)
    }
  }

  // ── Step 2: Parse assignments from supervisor output ──────────────────
  // Format: @asignar AgentName: task description
  //         @assign AgentName: task description
  const assignments = new Map<string, string>()
  const assignRegex = /@(?:asignar|assign)\s+([^\n:]+):\s*(.+)/gi
  let match
  while ((match = assignRegex.exec(supervisorOutput)) !== null) {
    const agentName = match[1].trim()
    const task = match[2].trim()
    if (agentName && task) assignments.set(agentName, task)
  }

  if (assignments.size > 0) {
    onLog("", "info", `  ${assignments.size} tarea(s) asignadas por el supervisor`)
    for (const [name, task] of assignments) {
      onLog("", "info", `    ${name}: ${task.slice(0, 80)}`)
    }
  } else {
    onLog("", "info", `  Sin asignaciones explícitas — cada worker ejecuta su task propio`)
  }

  // ── Step 3: Run workers in parallel ───────────────────────────────────
  if (workers.length === 0) {
    onLog("", "result", `○ Sin workers — solo se ejecutó el supervisor`)
    return { results, outputFiles, state }
  }

  const workerResults = await Promise.all(workers.map(async (worker) => {
    const assignedTask = assignments.get(worker.name) || assignments.get(worker.id)
    const taskToRun = assignedTask
      ? resolveTemplate(assignedTask, state, agents)
      : resolveTemplate(worker.tasks, state, agents)

    if (!taskToRun.trim()) {
      onLog(worker.id, "info", `  ${worker.name}: sin tarea (saltado)`)
      return
    }

    onProgress?.(worker.id, "running")
    const sessionId = await forkSession(sdk, parentSessionId, onLog, worker.id)
    if (!sessionId) { onProgress?.(worker.id, "failed"); return }

    // Build context from supervisor's plan
    const context = supervisorOutput
      ? `[Plan del supervisor]\n${supervisorOutput.slice(0, 2000)}\n[/Plan del supervisor]\n\n`
      : ""

    const fullPrompt = context ? `${context}${taskToRun}` : taskToRun
    const startTime = Date.now()
    onLog(worker.id, "info", `▶ Worker: ${worker.name}`)
    if (assignedTask) onLog(worker.id, "info", `  Tarea asignada: ${assignedTask.slice(0, 100)}`)

    try {
      const output = await executePrompt(sdk, sessionId, fullPrompt)
      state[worker.name] = { output, agentName: worker.name, completedAt: Date.now() }
      state[worker.id] = { output, agentName: worker.name, completedAt: Date.now() }
      results.push({
        nodeId: worker.id, agentName: worker.name, output,
        duration: Date.now() - startTime, sessionId,
      })
      onLog(worker.id, "result", output.slice(0, 200) || "Completado", output)
      onProgress?.(worker.id, "completed")

      outputFiles.push({
        path: `output/${worker.name}_${Date.now()}.md`, agentId: worker.id,
        content: `# ${worker.name}\n\n## Tarea\n\n${taskToRun}\n\n## Resultado\n\n${output}\n\n---\n*Generado automáticamente por haz.*`,
        updatedAt: Date.now(),
      })
    } catch (e: any) {
      onLog(worker.id, "error", `✗ Error: ${(e?.message ?? e).slice(0, 80)}`)
      onProgress?.(worker.id, "failed")
    }
  }))

  // ── Step 4: Consolidation ────────────────────────────────────────────
  const completedWorkers = workerResults.filter(Boolean).length
  onLog("", "result", `✓ Circuito supervisor/worker completado (${completedWorkers}/${workers.length} workers)`)
  return { results, outputFiles, state }
}
