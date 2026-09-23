import { Globe2, Package, Users } from 'lucide-react'
import CharacterPanel from './CharacterPanel'
import ItemPanel from './ItemPanel'
import WorldviewPanel from './WorldviewPanel'

function Column({
  title,
  icon: Icon,
  children
}: {
  title: string
  icon: typeof Users
  children: React.ReactNode
}) {
  return (
    <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-2 px-4 py-2.5" style={{ borderBottom: '1px solid var(--border)' }}>
        <Icon size={15} className="accent" />
        <h2 className="serif text-sm font-semibold tracking-wider">{title}</h2>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">{children}</div>
    </section>
  )
}

/** 设定中心:人物 / 物品 / 世界观 三列并排,全部同时可见 */
export default function CodexView() {
  return (
    <div className="flex min-h-0 flex-1">
      <Column title="人 物" icon={Users}>
        <CharacterPanel />
      </Column>
      <div className="w-px shrink-0" style={{ background: 'var(--border)' }} />
      <Column title="物 品 图 鉴" icon={Package}>
        <ItemPanel />
      </Column>
      <div className="w-px shrink-0" style={{ background: 'var(--border)' }} />
      <Column title="世 界 观" icon={Globe2}>
        <WorldviewPanel />
      </Column>
    </div>
  )
}
