/**
 * 构建前端：esbuild 打包 + 把构建时间写进 index.html 的 <meta name="panel-build">。
 *
 * 为什么要构建时间戳：改完前端重启面板后，没有任何办法确认看到的界面是新版还是旧版
 * （查 exe 内嵌？不内嵌。查 WebView2 缓存？查不到）。于是把构建时间显示在面板标题旁边，
 * 一眼可辨。这个脚本替代 package.json 里原来那条裸 esbuild 命令。
 *
 * 用法：npm run front
 *   - 只替换标记行，index.html 其余部分原样保留
 *   - 同时刷新 dist/index.html 与 dist/style.css（它们没有构建步骤，以前要手动复制，容易忘）
 *
 * 注意：这里用 esbuild 的 JS API，不走 execFileSync('node_modules/.bin/esbuild')——
 * 后者在 Windows 上会被 shell 拆错（".bin/esbuild.cmd" 路径含正斜杠，cmd 不认）。
 */
import * as esbuild from 'esbuild'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const dist = path.join(root, 'dist')
const stamp = new Date().toLocaleString('zh-CN', {
  month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
}).replace(/\//g, '-')

// 1) 打包
esbuild.buildSync({
  entryPoints: [path.join(root, 'src', 'main.ts')],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  outfile: path.join(dist, 'bundle.js'),
  logLevel: 'info',
})

// 2) 把构建时间写进 dist/index.html 的 meta 标记
const metaRe = /(<meta name="panel-build" content=")[^"]*(")/
const srcHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
if (!metaRe.test(srcHtml)) {
  console.error('✗ index.html 里找不到 <meta name="panel-build">，无法写构建戳')
  process.exit(1)
}
const outHtml = srcHtml.replace(metaRe, `$1${stamp}$2`)

// 3) 静态资源一起刷进 dist
fs.mkdirSync(dist, { recursive: true })
fs.writeFileSync(path.join(dist, 'index.html'), outHtml)
fs.writeFileSync(path.join(dist, 'style.css'), fs.readFileSync(path.join(root, 'style.css'), 'utf8'))

console.log(`✓ 构建完成 · 构建戳 ${stamp} · dist/{bundle.js,index.html,style.css} 已刷新`)
