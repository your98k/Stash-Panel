// Adapted from MaYIHEI's Stash Panel. Rendering reads only; tapping changes mode.
import { ControlWidget, ControlWidgetToggle } from 'scripting'
import { cachedStash, loadStash } from './api'
import { ModeToggleIntent } from './app_intents'
async function main() {
  const { data } = await loadStash()
  const on = (data ?? cachedStash())?.mode === 2
  ControlWidget.present(
    <ControlWidgetToggle intent={ModeToggleIntent({ value: !on })}
      label={{ title: 'Stash 模式', systemImage: on ? 'globe' : 'arrow.triangle.branch' }}
      activeValueLabel={{ title: '全局代理' }} inactiveValueLabel={{ title: '分流' }} />
  )
}
main()
