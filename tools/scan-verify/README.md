# 扫书结果核对工具(开发用)

拆书扫描管线的验证脚本:确认 AI 扫出来的设定确实来自原文,而不是模型幻觉。

## verify-scan.mjs — 驱动真实应用扫描并落盘结果

通过 CDP(`127.0.0.1:9222`,开发模式自动开启)连接渲染进程,取 `window.__store`,
把小说文本前 N 字导入拆书工作区,驱动真实扫描管线 `startScan()`,结束后把结果落盘。

```bash
# 先 npm run dev 启动应用,再:
node tools/scan-verify/verify-scan.mjs <小说txt路径> <扫描字数> <结果输出路径>
# 例:
node tools/scan-verify/verify-scan.mjs "D:/下载/《完美世界》.txt" 50000 out/scan-results.json
```

## compare-scan.mjs — 扫描结果 ↔ 原文比对

逐条检查人物/物品/境界/世界观要点是否真的出现在被扫描的文本范围内,统计命中率。

```bash
node tools/scan-verify/compare-scan.mjs <小说txt路径> <扫描字数> <verify-scan输出的json>
```

两个脚本均依赖 Node 18+(内置 fetch/TextDecoder);GBK 文本自动转码。
