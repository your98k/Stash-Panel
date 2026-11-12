// Adapted from MaYIHEI's Stash Panel. Only an explicit tap changes a policy.
import { ControlWidget, ControlWidgetButton } from 'scripting'
import { FastestIntent } from './app_intents'
ControlWidget.present(
  <ControlWidgetButton intent={FastestIntent(undefined)} label={{ title: 'Stash 切到最快', systemImage: 'bolt.fill' }} />
)
