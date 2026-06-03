import { TextAttributes } from "@opentui/core"
import { useTheme } from "../context/theme"
import { useDialog } from "../ui/dialog"
import { createStore } from "solid-js/store"
import { For } from "solid-js"
import { useBindings } from "../keymap"

export function DialogSessionDeleteFailed(props: {
  session: string
  workspace: string
  onDelete?: () => boolean | void | Promise<boolean | void>
  onRestore?: () => boolean | void | Promise<boolean | void>
  onDone?: () => void
}) {
  const dialog = useDialog()
  const { theme } = useTheme()
  const [store, setStore] = createStore({
    active: "delete" as "delete" | "restore",
  })

  const options = [
    {
      id: "delete" as const,
      title: "Eliminar espacio de trabajo",
      description: "Eliminar el espacio de trabajo y todas las sesiones adjuntas.",
      run: props.onDelete,
    },
    {
      id: "restore" as const,
      title: "Restaurar a nuevo espacio",
      description: "Intentar restaurar esta sesión en un nuevo espacio de trabajo.",
      run: props.onRestore,
    },
  ]

  async function confirm() {
    const result = await options.find((item) => item.id === store.active)?.run?.()
    if (result === false) return
    props.onDone?.()
    if (!props.onDone) dialog.clear()
  }

  useBindings(() => ({
    bindings: [
      { key: "return", desc: "Confirmar opción de recuperación", group: "Dialog", cmd: () => void confirm() },
      { key: "left", desc: "Eliminar sesión dañada", group: "Dialog", cmd: () => setStore("active", "delete") },
      { key: "up", desc: "Eliminar sesión dañada", group: "Dialog", cmd: () => setStore("active", "delete") },
      { key: "right", desc: "Restaurar sesión dañada", group: "Dialog", cmd: () => setStore("active", "restore") },
      { key: "down", desc: "Restaurar sesión dañada", group: "Dialog", cmd: () => setStore("active", "restore") },
    ],
  }))

  return (
    <box paddingLeft={2} paddingRight={2} gap={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text attributes={TextAttributes.BOLD} fg={theme.text}>
          Error al Eliminar Sesión
        </text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
          esc
        </text>
      </box>
      <text fg={theme.textMuted} wrapMode="word">
        {`La sesión "${props.session}" no pudo eliminarse porque el espacio de trabajo "${props.workspace}" no está disponible.`}
      </text>
      <text fg={theme.textMuted} wrapMode="word">
        Elegí cómo querés recuperar esta sesión de espacio de trabajo dañada.
      </text>
      <box flexDirection="column" paddingBottom={1} gap={1}>
        <For each={options}>
          {(item) => (
            <box
              flexDirection="column"
              paddingLeft={1}
              paddingRight={1}
              paddingTop={1}
              paddingBottom={1}
              backgroundColor={item.id === store.active ? theme.primary : undefined}
              onMouseUp={() => {
                setStore("active", item.id)
                void confirm()
              }}
            >
              <text
                attributes={TextAttributes.BOLD}
                fg={item.id === store.active ? theme.selectedListItemText : theme.text}
              >
                {item.title}
              </text>
              <text fg={item.id === store.active ? theme.selectedListItemText : theme.textMuted} wrapMode="word">
                {item.description}
              </text>
            </box>
          )}
        </For>
      </box>
    </box>
  )
}
