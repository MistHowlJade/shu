/**
 * 全局 Window.api 类型(由 preload 的 contextBridge 注入)。
 * 本文件为全局脚本声明(无顶层 import/export),直接合并 Window 接口;
 * 类型通过 import() 内联引用 preload 暴露的 Api。
 */
interface Window {
  api: import('../preload/index').Api
}
