// kit.tsx — 页面骨架: 系统底色 + 分组卡片 + 行

import {
  Button, Circle, HStack, Image, NavigationLink, Picker, Rectangle, RoundedRectangle, ScrollView, Spacer, Text, Toggle, VStack, ZStack,
} from 'scripting'
import type { Color } from 'scripting'

const HAS_GLASS = Number((Device.systemVersion || '0').split('.')[0]) >= 26
const RADIUS = HAS_GLASS ? 26 : 12
const MARGIN = HAS_GLASS ? 20 : 16

const SEPARATOR: Color = 'separator'
const CARD: Color = 'secondarySystemGroupedBackground'

export function Page(props: { title: string; large?: boolean; bar?: any; children?: any }) {
  return (
    <ScrollView
      navigationTitle={props.title}
      navigationBarTitleDisplayMode={props.large ? 'large' : 'inline'}
      toolbar={props.bar}
      background={<Rectangle fill="systemGroupedBackground" ignoresSafeArea />}
    >
      <VStack alignment="leading" spacing={22} padding={{ horizontal: MARGIN, vertical: 12 }}>{props.children}</VStack>
    </ScrollView>
  )
}

export function Card(props: { radius?: number; inner?: number; tall?: number; children?: any }) {
  return (
    <VStack
      alignment="leading"
      spacing={0}
      padding={props.inner ?? 0}
      frame={{ maxWidth: 'infinity', minHeight: props.tall, alignment: 'topLeading' }}
      background={<RoundedRectangle cornerRadius={props.radius ?? RADIUS} style="continuous" fill={CARD} />}
    >
      {props.children}
    </VStack>
  )
}

export function Grid(props: { children?: any }) {
  const items = (Array.isArray(props.children) ? props.children : [props.children]).flat().filter(Boolean)
  const rows: any[][] = []
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2))
  return (
    <VStack spacing={10}>
      {rows.map(row => (
        <HStack spacing={10} alignment="top">
          <VStack frame={{ maxWidth: 'infinity' }}>{row[0]}</VStack>
          <VStack frame={{ maxWidth: 'infinity' }}>{row[1] ?? null}</VStack>
        </HStack>
      ))}
    </VStack>
  )
}

export function Block(props: { title?: string; note?: string; children?: any }) {
  return (
    <VStack alignment="leading" spacing={8}>
      {props.title ? <Text font={13} foregroundStyle="secondaryLabel" padding={{ leading: MARGIN }}>{props.title}</Text> : null}
      {props.children}
      {props.note ? <Text font={12} foregroundStyle="secondaryLabel" padding={{ horizontal: MARGIN }}>{props.note}</Text> : null}
    </VStack>
  )
}

export function Panel(props: { title?: string; note?: string; children?: any }) {
  return (
    <Block title={props.title} note={props.note}>
      <Card inner={14}><VStack alignment="leading" spacing={12} frame={{ maxWidth: 'infinity', alignment: 'leading' }}>{props.children}</VStack></Card>
    </Block>
  )
}

export function StatTile(props: { label: string; value: string; sub?: string; color?: Color }) {
  return (
    <Card inner={14} tall={84}>
      <VStack alignment="leading" spacing={3}>
        <Text font={12} foregroundStyle="secondaryLabel" lineLimit={1}>{props.label}</Text>
        <Text font={20} fontWeight="semibold" fontDesign="rounded" monospacedDigit foregroundStyle={props.color ?? 'label'} lineLimit={1} minScaleFactor={0.6}>{props.value}</Text>
        {props.sub ? <Text font={11} foregroundStyle="secondaryLabel" lineLimit={1}>{props.sub}</Text> : null}
      </VStack>
    </Card>
  )
}

export function ToggleTile(props: { icon: string; title: string; sub?: string; value: boolean; onChanged: (v: boolean) => void; disabled?: boolean }) {
  return (
    <Card inner={14} tall={104}>
      <VStack alignment="leading" spacing={3}>
        <HStack padding={{ bottom: 6 }}>
          <Image systemName={props.icon} font={18} foregroundStyle="systemBlue" />
          <Spacer />
          <Toggle title={props.title} labelsHidden value={props.value} onChanged={props.onChanged} disabled={props.disabled} />
        </HStack>
        <Text font={15} foregroundStyle="label" lineLimit={1}>{props.title}</Text>
        {props.sub ? <Text font={12} foregroundStyle="secondaryLabel" lineLimit={1}>{props.sub}</Text> : null}
      </VStack>
    </Card>
  )
}

export function KV(props: { k: string; v: string; color?: Color }) {
  return (
    <HStack spacing={12} padding={{ horizontal: 14, vertical: 11 }}>
      <Text font={14} foregroundStyle="label">{props.k}</Text>
      <Spacer />
      <Text font={13} foregroundStyle={props.color ?? 'secondaryLabel'} lineLimit={2} multilineTextAlignment="trailing">{props.v}</Text>
    </HStack>
  )
}

export function NavTile(props: { icon: string; title: string; value?: string; destination: any }) {
  return (
    <NavigationLink destination={props.destination} buttonStyle="plain">
      <Card inner={14} tall={92}>
        <VStack alignment="leading" spacing={3}>
          <Image systemName={props.icon} font={18} foregroundStyle="systemBlue" frame={{ height: 24 }} padding={{ bottom: 6 }} />
          <Text font={15} foregroundStyle="label" lineLimit={1}>{props.title}</Text>
          {props.value ? <Text font={12} foregroundStyle="secondaryLabel" lineLimit={1}>{props.value}</Text> : null}
        </VStack>
      </Card>
    </NavigationLink>
  )
}

function Round(props: { icon: string; title: string }) {
  return (
    <VStack spacing={6}>
      <ZStack frame={{ width: 52, height: 52 }}>
        <Circle fill={CARD} />
        <Image systemName={props.icon} font={20} foregroundStyle="systemBlue" />
      </ZStack>
      <Text font={12} foregroundStyle="secondaryLabel" lineLimit={1}>{props.title}</Text>
    </VStack>
  )
}

export function RoundButton(props: { icon: string; title: string; action: () => void; disabled?: boolean }) {
  return <Button action={props.action} buttonStyle="plain" disabled={props.disabled} frame={{ maxWidth: 'infinity' }}><Round icon={props.icon} title={props.title} /></Button>
}

export function RoundLink(props: { icon: string; title: string; destination: any }) {
  return <NavigationLink destination={props.destination} buttonStyle="plain" frame={{ maxWidth: 'infinity' }}><Round icon={props.icon} title={props.title} /></NavigationLink>
}

export function Stage(props: { children?: any }) {
  return (
    <VStack spacing={12} padding={{ vertical: 6 }} frame={{ maxWidth: 'infinity' }}>
      {props.children}
    </VStack>
  )
}

export function Group(props: { title?: string; note?: string; inset?: number; children?: any }) {
  const rows = (Array.isArray(props.children) ? props.children : [props.children]).flat().filter(Boolean)
  return (
    <VStack alignment="leading" spacing={8}>
      {props.title ? <Text font={13} foregroundStyle="secondaryLabel" padding={{ leading: MARGIN }}>{props.title}</Text> : null}
      <Card>
        {rows.flatMap((row: any, i: number) => (i ? [<Rectangle fill={SEPARATOR} frame={{ height: 0.5 }} padding={{ leading: props.inset ?? 56 }} />, row] : [row]))}
      </Card>
      {props.note ? <Text font={12} foregroundStyle="secondaryLabel" padding={{ horizontal: MARGIN }}>{props.note}</Text> : null}
    </VStack>
  )
}

export function Chip(props: { icon: string; color?: Color; size?: number }) {
  const size = props.size ?? 28
  return <Image systemName={props.icon} font={size * 0.62} foregroundStyle={props.color ?? 'systemBlue'} frame={{ width: size, height: size }} />
}

type Label = { icon: string; color?: Color; title: string; sub?: string }

function Line(props: Label & { children?: any }) {
  return (
    <HStack spacing={14} padding={{ horizontal: 14, vertical: 11 }} frame={{ maxWidth: 'infinity', minHeight: 48 }}>
      <Chip icon={props.icon} color={props.color} />
      <VStack alignment="leading" spacing={2}>
        <Text font={16} foregroundStyle="label" lineLimit={1}>{props.title}</Text>
        {props.sub ? <Text font={12} foregroundStyle="secondaryLabel" lineLimit={2}>{props.sub}</Text> : null}
      </VStack>
      <Spacer minLength={8} />
      {props.children}
    </HStack>
  )
}

const Chevron = () => <Image systemName="chevron.right" font={13} fontWeight="semibold" foregroundStyle="tertiaryLabel" />

export function InfoRow(props: Label & { value?: string }) {
  return <Line {...props}>{props.value ? <Text font={15} foregroundStyle="secondaryLabel" lineLimit={1}>{props.value}</Text> : null}</Line>
}

export function NavRow(props: Label & { value?: string; destination: any }) {
  return (
    <NavigationLink destination={props.destination} buttonStyle="plain">
      <Line {...props}>
        {props.value ? <Text font={15} foregroundStyle="secondaryLabel" lineLimit={1}>{props.value}</Text> : null}
        <Chevron />
      </Line>
    </NavigationLink>
  )
}

export function ActionRow(props: Label & { value?: string; action: () => void; disabled?: boolean; destructive?: boolean }) {
  return (
    <Button action={props.action} buttonStyle="plain" disabled={props.disabled}>
      <Line {...props}>
        {props.value ? <Text font={15} foregroundStyle="secondaryLabel" lineLimit={1}>{props.value}</Text> : null}
      </Line>
    </Button>
  )
}

export function ToggleRow(props: Label & { value: boolean; onChanged: (v: boolean) => void; disabled?: boolean }) {
  return (
    <Line {...props}>
      <Toggle title={props.title} labelsHidden value={props.value} onChanged={props.onChanged} disabled={props.disabled} />
    </Line>
  )
}

export function PickerRow<T extends string | number>(props: Label & { value: T; options: [T, string][]; onChanged: (v: T) => void; disabled?: boolean }) {
  return (
    <Line {...props}>
      <Picker title={props.title} labelsHidden pickerStyle="menu" value={props.value} disabled={props.disabled} onChanged={(v: any) => props.onChanged(v as T)}>
        {props.options.map(([v, text]) => <Text tag={v}>{text}</Text>)}
      </Picker>
    </Line>
  )
}

export function SmallButton(props: { title: string; action: () => void; disabled?: boolean }) {
  return <Button title={props.title} buttonStyle={HAS_GLASS ? 'glass' : 'bordered'} controlSize="small" disabled={props.disabled} action={props.action} />
}
