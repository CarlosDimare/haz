import { Prompt, type PromptRef } from "@tui/component/prompt"
import { batch, createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { useSync } from "../context/sync"
import { Toast } from "../ui/toast"
import { useArgs } from "../context/args"
import { useRoute, useRouteData } from "@tui/context/route"
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
import { useToast } from "../ui/toast"
import { useDialog } from "../ui/dialog"
import { relativeTime } from "../feature-plugins/session/util"
import { errorMessage } from "@/util/error"
import { DialogProjects } from "../component/dialog-projects"

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

  const navigate = useRoute().navigate
  const toast = useToast()
  const dialog = useDialog()
  const allSessions = createMemo(() =>
    sync.data.session
      .toSorted((a, b) => b.time.updated - a.time.updated),
  )
  const groups = createMemo(() => {
    const today = new Date()
    const todayStr = today.toDateString()
    const yesterday = new Date(today.getTime() - 86400000).toDateString()
    const groups: { label: string; sessions: typeof sync.data.session }[] = []
    const todayGroup: typeof sync.data.session = []
    const yesterdayGroup: typeof sync.data.session = []
    const olderGroup: typeof sync.data.session = []
    for (const s of allSessions()) {
      const dateStr = new Date(s.time.updated).toDateString()
      if (dateStr === todayStr) todayGroup.push(s)
      else if (dateStr === yesterday) yesterdayGroup.push(s)
      else olderGroup.push(s)
    }
    if (todayGroup.length) groups.push({ label: "Hoy", sessions: todayGroup })
    if (yesterdayGroup.length) groups.push({ label: "Ayer", sessions: yesterdayGroup })
    if (olderGroup.length) groups.push({ label: "Anterior", sessions: olderGroup })
    return groups
  })
  const [toDelete, setToDelete] = createSignal<string | null>(null)
  async function deleteSession(id: string) {
    try {
      const result = await sdk.client.session.delete({ sessionID: id })
      if (result.error) {
        toast.show({ variant: "error", title: "Error al eliminar sesión", message: errorMessage(result.error) })
        return
      }
      await sync.session.refresh()
      setToDelete(null)
    } catch (err) {
      toast.show({ variant: "error", title: "Error al eliminar sesión", message: errorMessage(err) })
    }
  }

  return (
    <>
      <box flexGrow={1} flexDirection="row" minHeight={0}>
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
                    Historial
                  </text>
                </box>

                <box height={1} />

                {/* Conversation history */}
                <For each={groups()}>
                  {(group) => (
                    <box flexDirection="column" gap={1}>
                      <text fg={theme.textMuted} attributes={TextAttributes.BOLD}>
                        {group.label}
                      </text>
                      <For each={group.sessions}>
                        {(s) => {
                          const deleting = () => toDelete() === s.id
                          return (
                            <box
                              flexDirection="row"
                              justifyContent="space-between"
                              gap={1}
                            >
                              <box
                                flexGrow={1}
                                flexDirection="column"
                                gap={0}
                                onMouseDown={() => {
                                  if (deleting()) {
                                    void deleteSession(s.id)
                                  } else {
                                    navigate({ type: "session", sessionID: s.id })
                                  }
                                }}
                              >
                                <text fg={deleting() ? theme.warning : theme.text} wrapMode="none" truncate>
                                  {deleting() ? `¿Eliminar ${s.title}?` : s.title}
                                </text>
                              </box>
                              <text
                                fg={deleting() ? theme.warning : theme.textMuted}
                                flexShrink={0}
                                onMouseDown={() => {
                                  if (deleting()) {
                                    setToDelete(null)
                                  } else {
                                    setToDelete(s.id)
                                  }
                                }}
                              >
                                {deleting() ? "✕" : relativeTime(s.time.updated)}
                              </text>
                            </box>
                          )
                        }}
                      </For>
                      <box height={1} />
                    </box>
                  )}
                </For>
              </box>
            </scrollbox>
            <box flexShrink={0} paddingTop={1}>
              <box
                onMouseDown={() => dialog.replace(() => <DialogProjects />)}
              >
                <text fg={theme.primary}>+ Proyectos / Agentes</text>
              </box>
            </box>
          </box>
        </Show>
        <box flexGrow={1} alignItems="center" paddingLeft={2} paddingRight={2}>
          <box flexGrow={1} minHeight={0} />
          <box height={4} minHeight={0} flexShrink={1} />
          <box flexShrink={0} flexDirection="row" alignItems="center" gap={2}>
            <TuiPluginRuntime.Slot name="home_logo" mode="replace" />
            <box
              paddingLeft={1}
              paddingRight={1}
              onMouseDown={(e: any) => {
                e?.stopPropagation?.()
                toggleSidebar()
              }}
            >
              <text fg={theme.textMuted}>☰</text>
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
      </box>
      <box width="100%" flexShrink={0}>
        <TuiPluginRuntime.Slot name="home_footer" mode="single_winner" />
      </box>
    </>
  )
}
