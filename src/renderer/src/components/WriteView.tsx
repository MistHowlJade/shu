import { useState } from 'react'
import { PanelLeftOpen } from 'lucide-react'
import { useStore } from '../store'
import Sidebar from './Sidebar'
import Editor from './Editor'

/**
 * 写作页:章节目录融入环境光底,正文是一张浮起的"纸面"。
 * AI 助手是全局右侧抽屉(见 App);沉浸模式下只留纸面。
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

      {/* 环境光留边,纸面浮起 */}
      <div className="flex min-w-0 flex-1 flex-col p-3 pl-4">
        <div className="editor-sheet relative flex min-h-0 flex-1 flex-col overflow-hidden">
          {!sideOpen && (
            <button
              className="btn-ghost absolute left-2 top-2 z-10 !px-2"
              title="展开章节目录"
              onClick={toggleSide}
            >
              <PanelLeftOpen size={16} />
            </button>
          )}
          <Editor />
        </div>
      </div>
    </div>
  )
}
