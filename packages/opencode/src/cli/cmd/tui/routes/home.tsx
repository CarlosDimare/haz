import { Prompt, type PromptRef } from "@tui/component/prompt"
import { batch, createEffect, createMemo, createResource, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { Logo } from "../component/logo"
import { useSync } from "../context/sync"
import { Toast } from "../ui/toast"
import { useArgs } from "../context/args"
import { useRouteData } from "@tui/context/route"
import { usePromptRef } from "../context/prompt"
import { useLocal } from "../context/local"
import { TuiPluginRuntime } from "@/cli/cmd/tui/plugin/runtime"
import { useEditorContext } from "@tui/context/editor"
import { useTerminalDimensions } from "@opentui/solid"
import { useTuiConfig } from "../context/tui-config"
import { useTheme } from "@tui/context/theme"
import { useProject } from "@tui/context/project"
import { useSDK } from "@tui/context/sdk"
import { TextAttributes } from "@opentui/core"
import { loadPersonality, getAllSkills } from "@tui/util/facet-skills"

let once = false
const placeholder = {
  normal: ["Arreglá un TODO en el código", "¿Cuál es el stack tecnológico de este proyecto?", "Arreglá tests rotos"],
  shell: ["ls -la", "git status", "pwd"],
}

export function Home() {
  const sync = useSync()
  const route = useRouteData("home")
  const promptRef = usePromptRef()
  const [ref, setRef] = createSignal<PromptRef | undefined>()
  const args = useArgs()
  const local = useLocal()
  const editor = useEditorContext()
  const dimensions = useTerminalDimensions()
  const tuiConfig = useTuiConfig()
  const { theme } = useTheme()
  const sdk = useSDK()
  const project = useProject()
  const [sidebarOpen, setSidebarOpen] = createSignal(false)
  const promptMaxWidth = createMemo(() => {
    const configured = tuiConfig.prompt?.max_width
    if (configured === "auto") return Math.max(75, Math.floor(dimensions().width * 0.7))
    return configured ?? 75
  })
  let sent = false

  // Personalidad con auto-refresh cada 2s (detecta cambios en el prompt al instante)
  const [personality, setPersonality] = createSignal<Awaited<ReturnType<typeof loadPersonality>> | undefined>(undefined)
  const [expandedTraits, setExpandedTraits] = createSignal<Set<string>>(new Set())
  const toggleTrait = (label: string) => {
    setExpandedTraits((prev) => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }
  const getDir = () => {
    try { return project.instance.path().directory } catch { return undefined }
  }
  onMount(() => {
    const dir = getDir()
    loadPersonality(dir).then(setPersonality)
    const id = setInterval(() => {
      loadPersonality(getDir()).then(setPersonality)
    }, 2000)
    onCleanup(() => clearInterval(id))
  })

  const [skills] = createResource(async () => {
    const result = await sdk.client.app.skills()
    return result.data ?? []
  })

  const allSkills = createMemo(() => getAllSkills(skills() ?? []))

  const toggleSidebar = () => {
    batch(() => {
      setSidebarOpen((prev) => !prev)
    })
  }

  onMount(() => {
    editor.clearSelection()
  })

  const bind = (r: PromptRef | undefined) => {
    setRef(r)
    promptRef.set(r)
    if (once || !r) return
    if (route.prompt) {
      r.set(route.prompt)
      once = true
      return
    }
    if (!args.prompt) return
    r.set({ input: args.prompt, parts: [] })
    once = true
  }

  createEffect(() => {
    const r = ref()
    if (sent) return
    if (!r) return
    if (!sync.ready || !local.model.ready) return
    if (!args.prompt) return
    if (r.current.input !== args.prompt) return
    sent = true
    r.submit()
  })

  const sidebarWidth = 42

  return (
    <>
      <box flexGrow={1} flexDirection="row" minHeight={0}>
        <box flexGrow={1} alignItems="center" paddingLeft={2} paddingRight={2}>
          <box flexGrow={1} minHeight={0} />
          <box height={4} minHeight={0} flexShrink={1} />
          <box flexShrink={0} flexDirection="row" alignItems="center" gap={2}>
            <TuiPluginRuntime.Slot name="home_logo" mode="replace">
              <Logo />
            </TuiPluginRuntime.Slot>
            <box
              paddingLeft={1}
              paddingRight={1}
              onMouseDown={(e: any) => {
                e?.stopPropagation?.()
                toggleSidebar()
              }}
            >
              <text fg={theme.textMuted}>☰ 🧿🧿</text>
            </box>
          </box>
          <box height={1} minHeight={0} flexShrink={1} />
          <box width="100%" maxWidth={promptMaxWidth()} zIndex={1000} paddingTop={1} flexShrink={0}>
            <TuiPluginRuntime.Slot name="home_prompt" mode="replace" ref={bind}>
              <Prompt ref={bind} hideMeta showPlaceholder={false} right={<TuiPluginRuntime.Slot name="home_prompt_right" />} placeholders={placeholder} />
            </TuiPluginRuntime.Slot>
          </box>
          <TuiPluginRuntime.Slot name="home_bottom" />
          <box flexGrow={1} minHeight={0} />
          <Toast />
        </box>
        <Show when={sidebarOpen()}>
          <box
            backgroundColor={theme.backgroundPanel}
            width={sidebarWidth}
            minHeight={0}
            paddingTop={1}
            paddingBottom={1}
            paddingLeft={2}
            paddingRight={2}
            flexShrink={0}
            flexDirection="column"
          >
            <scrollbox flexGrow={1} flexShrink={1} minHeight={0}>
              <box flexShrink={0} gap={1} paddingRight={1} flexDirection="column">
                {/* Header */}
                <box flexDirection="row" gap={1} alignItems="center">
                  <box
                    paddingLeft={1}
                    paddingRight={1}
                    onMouseDown={(e: any) => {
                      e?.stopPropagation?.()
                      setSidebarOpen(false)
                    }}
                  >
                    <text fg={theme.textMuted}>✕</text>
                  </box>
                  <text fg={theme.text} attributes={TextAttributes.BOLD}>
                    🧿🧿 Panel
                  </text>
                </box>

                <box height={1} />

                {/* Personalidad — desde el system prompt */}
                <box flexDirection="column" gap={1}>
                  <text fg={theme.textMuted} attributes={TextAttributes.BOLD}>
                    Personalidad
                  </text>
                  <Show when={personality() && personality()!.length > 0} fallback={
                    <text fg={theme.textMuted} paddingLeft={1}>Cargando...</text>
                  }>
                    <For each={personality()!}>
                      {(trait) => {
                        const expanded = () => expandedTraits().has(trait.label)
                        const barLen = Math.round(trait.value * 6)
                        const bar = "\u2593".repeat(barLen) + "\u2591".repeat(6 - barLen)
                        return (
                          <box flexDirection="column" gap={0}>
                            <box
                              paddingLeft={1}
                              flexDirection="row" gap={1}
                              onMouseDown={() => toggleTrait(trait.label)}
                            >
                              <text fg={(theme as any)[trait.color] ?? theme.text}>
                                {trait.label}
                              </text>
                              <text fg={theme.textMuted}>{bar}</text>
                              <text fg={theme.textMuted}>
                                {Math.round(trait.value * 100)}%
                              </text>
                              <Show when={trait.sources.length > 0}>
                                <text fg={theme.textMuted}>{expanded() ? "▾" : "▸"}</text>
                              </Show>
                            </box>
                            <Show when={expanded() && trait.sources.length > 0}>
                              <box paddingLeft={3} flexDirection="column" gap={0}>
                                <For each={trait.sources}>
                                  {(src) => (
                                    <box flexDirection="column" gap={0}>
                                      <text fg={theme.textMuted} attributes={TextAttributes.ITALIC}>
                                        ─ {src.section} ─
                                      </text>
                                      <For each={src.lines}>
                                        {(line) => (
                                          <text fg={theme.textMuted} wrapMode="none" truncate>
                                            {line}
                                          </text>
                                        )}
                                      </For>
                                    </box>
                                  )}
                                </For>
                              </box>
                            </Show>
                          </box>
                        )
                      }}
                    </For>
                  </Show>
                </box>

                <box height={1} />

                {/* Caja de Herramientas */}
                <box flexDirection="column" gap={1}>
                  <text fg={theme.textMuted} attributes={TextAttributes.BOLD}>
                    Caja de Herramientas ({allSkills().length})
                  </text>
                  <box paddingLeft={1} flexDirection="column" gap={0}>
                    <For each={allSkills()}>
                      {(skill) => (
                        <text fg={theme.textMuted} wrapMode="none" truncate>
                          · {skill.name}
                        </text>
                      )}
                    </For>
                  </box>
                </box>
              </box>
            </scrollbox>
          </box>
        </Show>
      </box>
      <box width="100%" flexShrink={0}>
        <TuiPluginRuntime.Slot name="home_footer" mode="single_winner" />
      </box>
    </>
  )
}
