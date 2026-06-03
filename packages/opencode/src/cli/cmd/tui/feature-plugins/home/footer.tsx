import type { TuiPlugin } from "@opencode-ai/plugin/tui"
import type { InternalTuiPlugin } from "../../plugin/internal"

const id = "internal:home-footer"

const tui: TuiPlugin = async (_api) => {
  // home footer removed per home screen cleanup
}

const plugin: InternalTuiPlugin = {
  id,
  tui,
}

export default plugin
