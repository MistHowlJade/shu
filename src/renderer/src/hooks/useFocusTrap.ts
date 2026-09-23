import { useEffect, type RefObject } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * 简易焦点陷阱:弹窗打开期间把 Tab 循环限制在容器内,关闭时把焦点还给打开它的控件。
 *
 * - 初始聚焦优先取容器内带 [data-autofocus] 的元素,否则聚焦容器本身
 *   (容器带 tabIndex={-1},Tab 会自然落到第一个可聚焦控件);
 * - 多个陷阱并存时(设置弹窗上又开命令面板),焦点在谁里面就听谁的,不互相抢;
 * - 焦点意外掉到 body 时,Tab 直接拉回弹窗内。
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean): void {
  useEffect(() => {
    if (!active || !ref.current) return
    const root = ref.current
    const prev = document.activeElement instanceof HTMLElement ? document.activeElement : null

    ;(root.querySelector<HTMLElement>('[data-autofocus]') ?? root).focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.getClientRects().length > 0
      )
      if (items.length === 0) {
        e.preventDefault()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const cur = document.activeElement instanceof HTMLElement ? document.activeElement : null

      if (!cur || cur === document.body) {
        e.preventDefault()
        ;(e.shiftKey ? last : first).focus()
        return
      }
      /* 焦点在另一个更上层的弹窗里:不抢,交给它的陷阱处理 */
      if (!root.contains(cur)) return

      if (e.shiftKey && (cur === root || cur === first)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && cur === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      if (prev && prev.isConnected && prev !== document.body) prev.focus()
    }
  }, [active, ref])
}
