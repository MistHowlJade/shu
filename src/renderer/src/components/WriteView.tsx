import { useCallback, useRef, useState } from 'react'
import { PanelLeftOpen, PanelRightClose, PanelRightOpen } from 'lucide-react'
import { useStore } from '../store'
import Sidebar from './Sidebar'
import Editor from './Editor'
import AIPanel from './AIPanel'

const MIN_AI_WIDTH = 300
const MAX_AI_WIDTH = 720

/**
 * 写作页三栏:章节栏 + 正文画布 + AI 助手。
 * 两侧面板均可折叠(记忆到 localStorage),沉浸模式下只留正文。
 */
export default function WriteView() {
  const focusMode = useStore((s) => s.focusMode)

  const [sideOpen, setSideOpen] = useState(() => localStorage.getItem('sidebarOpen') !== '0')
  const [aiOpen, setAiOpen] = useState(() => localStorage.getItem('aiPanelOpen') !== '0')
  const [aiWidth, setAiWidth] = useState(() => {
    const saved = Number(localStorage.getItem('aiPanelWidth'))
    return saved >= MIN_AI_WIDTH && saved <= MAX_AI_WIDTH ? saved : 384
  })

  const widthRef = useRef(aiWidth)
  widthRef.current = aiWidth
  const dragging = useRef(false)

  const toggleSide = (): void => {
    setSideOpen((v) => {
      localStorage.setItem('sidebarOpen', v ? '0' : '1')
      return !v
    })
  }
  const toggleAi = (): void => {
    setAiOpen((v) => {
      localStorage.setItem('aiPanelOpen', v ? '0' : '1')
      return !v
    })
  }

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = widthRef.current
    dragging.current = true
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return
      const next = Math.min(MAX_AI_WIDTH, Math.max(MIN_AI_WIDTH, startWidth + (startX - ev.clientX)))
      widthRef.current = next
      setAiWidth(next)
    }
    const onUp = () => {
      dragging.current = false
      /* 保存拖拽结束时的最终宽度(不能闭包捕获旧 state) */
      localStorage.setItem('aiPanelWidth', String(widthRef.current))
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
    }
    document.body.style.cursor = 'col-resize'
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [])

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
        {!aiOpen && (
          <button
            className="btn-ghost absolute right-2 top-2 z-10 !px-2"
            title="展开 AI 助手面板"
            onClick={toggleAi}
          >
            <PanelRightOpen size={16} />
          </button>
        )}
        {/* 章节栏折叠开关在 Sidebar 头部 */}
        <Editor />
      </div>

      {aiOpen && (
        <>
          {/* AI 面板拖宽手柄 */}
          <div
            className="w-1 shrink-0 cursor-col-resize bg-transparent transition hover:bg-[var(--accent-soft)]"
            onMouseDown={onDragStart}
            title="拖动调整 AI 面板宽度"
          />
          <div className="relative shrink-0" style={{ width: aiWidth }}>
            <button
              className="btn-ghost absolute right-2 top-2 z-10 !px-2"
              title="收起 AI 助手面板"
              onClick={toggleAi}
            >
              <PanelRightClose size={16} />
            </button>
            <AIPanel />
          </div>
        </>
      )}
    </div>
  )
}
