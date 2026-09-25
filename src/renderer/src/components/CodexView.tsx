import { Globe2, Package, Users } from 'lucide-react'
import CharacterPanel, { CharacterActions } from './CharacterPanel'
import ItemPanel, { ItemActions } from './ItemPanel'
import WorldviewPanel from './WorldviewPanel'

function Column({
  title,
  icon: Icon,
  actions,
  children
}: {
  title: string
  icon: typeof Users
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="panel flex min-w-0 flex-1 flex-col overflow-hidden">
      {/* 卡片头部:主色图标芯片 + 标题居左,操作按钮靠右 */}
      <div
        className="flex shrink-0 items-center gap-2.5 px-5 pb-3 pt-4"
        style={{ borderBottom: '1px solid color-mix(in srgb, var(--border) 60%, transparent)' }}
      >
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
          style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
        >
          <Icon size={15} />
        </span>
        <h2 className="text-[15px] font-semibold tracking-wide">{title}</h2>
        {actions && <div className="ml-auto flex shrink-0 items-center gap-1.5">{actions}</div>}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">{children}</div>
    </section>
  )
}

/** 设定中心:人物 / 物品 / 世界观 三列等宽白卡,卡片间距 16px */
export default function CodexView() {
  return (
    <div className="flex min-h-0 flex-1 gap-4 p-4">
      <Column title="人物" icon={Users} actions={<CharacterActions />}>
        <CharacterPanel />
      </Column>
      <Column title="物品图鉴" icon={Package} actions={<ItemActions />}>
        <ItemPanel />
      </Column>
      <Column title="世界观" icon={Globe2}>
        <WorldviewPanel />
      </Column>
    </div>
  )
}
