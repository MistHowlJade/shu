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
      {/* 卡片头部:标题居左,操作按钮靠右 */}
      <div className="flex shrink-0 items-center gap-2 px-5 pb-3 pt-4" style={{ borderBottom: '1px solid var(--border)' }}>
        <Icon size={15} className="accent" />
        <h2 className="text-base font-semibold">{title}</h2>
        {actions && <div className="ml-auto flex shrink-0 items-center gap-1.5">{actions}</div>}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-5">{children}</div>
    </section>
  )
}

/** 设定中心:人物 / 物品 / 世界观 三列等宽白卡,卡片间距 20px */
export default function CodexView() {
  return (
    <div className="flex min-h-0 flex-1 gap-5 p-4">
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
