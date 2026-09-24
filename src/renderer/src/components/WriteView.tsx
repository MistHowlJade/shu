import { useState } from 'react'
import { PanelLeftOpen } from 'lucide-react'
import { useStore } from '../store'
import Sidebar from './Sidebar'
import Editor from './Editor'

/**
 * 写作页:章节栏 + 正文画布。
 * AI 助手面板已上移为全局右栏(见 App),跨页面共享、可收起;沉浸模式下只留正文。
 */
export default function WriteView() {
  const focusMode = useStore((s) => s.focusMode)
  const [sideOpen, setSideOpen] = useState(() => localStorage.getItem('sidebarOpen') !== '0')

  const toggleSide = (): void => {
    setSideOpen((v) => {
      localStorage.setItem('sidebarOpen', v ? '0' : '1')
      return !v
    })
  }

  if (focusMode) return <Editor />

  return (
    <div className="flex min-h-0 flex-1">
      {sideOpen && <Sidebar onCollapse={toggleSide} />}

      <div className="relative flex min-w-0 flex-1 flex-col">
        {!sideOpen && (
          <button
            className="btn-ghost absolute left-2 top-2 z-10 !px-2"
            title="展开章节栏"
            onClick={toggleSide}
          >
            <PanelLeftOpen size={16} />
          </button>
        )}
        {/* 章节栏折叠开关在 Sidebar 头部 */}
        <Editor />
      </div>
    </div>
  )
}
