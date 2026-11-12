// stash-panel / widget.tsx
// 运行环境: Scripting (https://scripting.fun)
// Stash 数据使用原生 HTTP Control API；机场用量从钥匙串中的订阅链接读取。
// 参数: 样式名 (如「中·用量趋势」或「趋势」); 不填或尺寸不支持 → 该尺寸的默认样式

import { VStack, Text, Image, Widget } from 'scripting'

import { loadStash } from './api'
import { loadSubs, localEvents, checkAlerts } from './subs'
import { lastNat } from './net'
import { getLook, getPrefs, type Family } from './settings'
import { resolveStyle, renderStyle } from './styles/index'

async function main() {
  const family = Widget.family as Family
  const prefs = getPrefs()
  let view
  try {
    const [stash, subs] = await Promise.all([loadStash(), loadSubs()])
    await checkAlerts(subs, prefs.alerts).catch(e => console.log(`提醒发送失败: ${(e as Error).message}`))   // 发不出通知不影响小组件
    view = renderStyle(resolveStyle(Widget.parameter, family), family, {
      inApp: false, stash: stash.data, stashErr: stash.error, subs, look: getLook(), prefs, nat: lastNat(), local: localEvents(),
    })
  } catch (e) {
    view = <ErrorView message={(e as Error).message} />
  }
  Widget.present(view, { policy: 'after', date: new Date(Date.now() + prefs.refresh * 60_000) })
}

function ErrorView(props: { message: string }) {
  return (
    <VStack spacing={6} padding={14} frame={{ maxWidth: 'infinity', maxHeight: 'infinity' }}>
      <Image systemName="exclamationmark.triangle.fill" font={20} foregroundStyle="#FF9F0A" />
      <Text font={11} foregroundStyle={{ light: '#6E6E73', dark: '#98989F' }} multilineTextAlignment="center" lineLimit={4}>
        {`${props.message.slice(0, 60)}\n打开 Stash 面板完成设置`}
      </Text>
    </VStack>
  )
}

main()
