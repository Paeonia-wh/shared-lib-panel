/**
 * 共享项目库 · 悬浮球 ｜ v4
 * 层级：项目列表 → 点项目 → 任务卡片（每张卡单独复制）
 * 规则：项目只有 1 个任务 → 项目卡上直接给复制；多任务 → 点进去，逐任务复制
 * 球体 = bloub 引擎（jeremy-prt/bloub, MIT）
 */
import { BotEngine, type BotFrame } from './bot/engine'
import { RAYON, DEMI_VIEWBOX } from './bot/repere'
import { mixHex, COLORS } from './bot/skins'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { isTauri, initTauri, expandWindow, collapseWindow, beginDrag, dragBy } from './tauri'

const VB = DEMI_VIEWBOX
const R = RAYON
const PAPER = '#eceff4'

/* ============ 颜色 ============ */
const savedInk = (() => { try { return localStorage.getItem('bloub-ink') } catch { return null } })()
const initialInk = savedInk && COLORS.some((c) => c.hex === savedInk) ? savedInk : COLORS[0].hex
let inkFrom = initialInk, inkTo = initialInk, inkT = 1
const INK_DUR = 0.42
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)
const curInk = () => (inkT >= 1 ? inkTo : mixHex(inkFrom, inkTo, easeOut(inkT)))
function setColor(hex: string) {
  if (hex === inkTo) return
  inkFrom = curInk(); inkTo = hex; inkT = 0
}

/* ============ 球 ============ */
const uid = 'b' + Math.random().toString(36).slice(2, 8)
const engine = new BotEngine(R, 'idle', null, null)
let clock = 0

function dotMarkup(list: any[], ink: string): string {
  return list.map((d) => {
    const fill = d.color ?? (d.depth === undefined ? ink : mixHex(PAPER, ink, d.depth))
    return d.d
      ? `<path d="${d.d}" transform="translate(${d.x} ${d.y}) rotate(${d.rot ?? 0}) scale(${R})" fill="${fill}" opacity="${d.opacity}"/>`
      : `<circle cx="${d.x}" cy="${d.y}" r="${d.r}" fill="${fill}" opacity="${d.opacity}"/>`
  }).join('')
}
function frameMarkup(f: BotFrame, ink: string): string {
  const defs: string[] = []
  for (const a of f.arcs) {
    const n = Math.max(1, a.grad.stops.length - 1)
    defs.push(
      `<linearGradient id="${uid}-${a.id}" gradientUnits="userSpaceOnUse" x1="${a.grad.x1}" y1="${a.grad.y1}" x2="${a.grad.x2}" y2="${a.grad.y2}">` +
      a.grad.stops.map((c, i) => `<stop offset="${(i / n).toFixed(4)}" stop-color="${c}"/>`).join('') +
      `</linearGradient>`)
  }
  defs.push(
    `<mask id="${uid}-mask" maskUnits="userSpaceOnUse" x="${-VB}" y="${-VB}" width="${VB * 2}" height="${VB * 2}">` +
    `<path d="${f.bodyPath}" fill="#fff"/>` +
    f.eyes.map((e) => `<path d="${e.d}" transform="${e.matrix}" opacity="${e.alpha}" fill="#000"/>`).join('') +
    (f.notch ? `<circle cx="${f.notch.x}" cy="${f.notch.y}" r="${f.notch.r}" fill="#000"/>` : '') +
    `</mask>`)
  const arc = (side: 'back' | 'front') =>
    f.arcs.map((a) => `<path d="${a[side]}" stroke="url(#${uid}-${a.id})" stroke-width="${a.width}" opacity="${a.opacity}"/>`).join('')
  return `<defs>${defs.join('')}</defs>` +
    `<g fill="none" stroke-linecap="round">${arc('back')}</g>` +
    (f.dotsBehind ? `<g>${dotMarkup(f.dots, ink)}</g>` : '') +
    `<g opacity="${f.bodyAlpha}"><path d="${f.bodyPath}" fill="${PAPER}"/>` +
    `<g mask="url(#${uid}-mask)"><rect x="${-VB}" y="${-VB}" width="${VB * 2}" height="${VB * 2}" fill="${ink}"/></g></g>` +
    (!f.dotsBehind ? `<g>${dotMarkup(f.dots, ink)}</g>` : '') +
    (f.notif ? `<circle cx="${f.notif.x}" cy="${f.notif.y}" r="${f.notif.r}" fill="#4b8dff"/>` : '') +
    `<g fill="none" stroke-linecap="round">${arc('front')}</g>`
}

const ballEl = document.getElementById('ball') as HTMLDivElement

/* ⑪ 出场：飞入期间转个圈，落定后回 idle（只播一次） */
window.addEventListener('DOMContentLoaded', () => {
  engine.setState('orbit', 0)   /* 转圈：从远处一路转过来 */
  const settle = () => {
    if (ballEl.classList.contains('settled')) return
    ballEl.classList.add('settled')
    engine.setState('idle', clock)
  }
  setTimeout(() => engine.setState('wink', clock), 1950)
  ballEl.addEventListener('animationend', settle, { once: true })
  setTimeout(settle, 1200)   /* 兜底①：Tauri 里动画事件偶尔不触发，球会卡在缩小帧 */
  setTimeout(settle, 2700)   /* 兜底② */
})
const svg = document.getElementById('bot') as unknown as SVGSVGElement
let last = performance.now()
function tick(now: number) {
  const dt = Math.min((now - last) / 1000, 0.05)
  last = now; clock += dt
  if (inkT < 1) inkT = Math.min(1, inkT + dt / INK_DUR)
  svg.innerHTML = frameMarkup(engine.sample(clock), curInk())
  requestAnimationFrame(tick)
}

/* Tauri：把球放到屏幕右上角，并把窗口缩到球那么大 */
initTauri().then(async () => {
  if (isTauri) {
    await loadProjects()
    await startSSE()
  }
})
requestAnimationFrame(tick)

document.addEventListener('mousemove', (e) => {
  const r = ballEl.getBoundingClientRect()
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2
  const dx = e.clientX - cx, dy = e.clientY - cy
  const dist = Math.hypot(dx, dy) || 1
  const near = Math.max(0, Math.min(1, 1 - (dist - 70) / 520))
  engine.setLook({ yaw: (dx / dist) * 24 * near, pitch: (dy / dist) * 15 * near, mix: near, spin: 0, wander: 1 - near }, clock)
})

/* ============ 面板 ============ */
const panel = document.getElementById('panel') as HTMLElement
const listEl = document.getElementById('list') as HTMLElement
const filtersEl = document.getElementById('filters') as HTMLElement
const swatchesEl = document.getElementById('swatches') as HTMLElement
const statsEl = document.getElementById('stats') as HTMLElement
let open = false

function positionPanel() {
  const r = ballEl.getBoundingClientRect()
  const gap = 16
  const pw = panel.offsetWidth || 384
  const ph = panel.offsetHeight || 520

  /* 水平：优先放球的左侧（球默认在右上角），左边不够就放右侧 */
  const onLeft = r.left > pw + 24
  if (onLeft) { panel.style.left = 'auto'; panel.style.right = window.innerWidth - r.left + gap + 'px' }
  else { panel.style.right = 'auto'; panel.style.left = Math.min(r.right + gap, window.innerWidth - pw - 12) + 'px' }

  /* 垂直：默认顶部与球顶对齐（从球往左下长），下方不够再底部对齐 */
  const above = window.innerHeight - r.top >= ph + 14
  if (above) { panel.style.bottom = 'auto'; panel.style.top = Math.max(12, r.top) + 'px' }
  else { panel.style.top = 'auto'; panel.style.bottom = Math.max(12, window.innerHeight - r.bottom) + 'px' }

  /* 展开动画原点对准球：从球里长出来 */
  panel.style.transformOrigin =
    `${onLeft ? 'calc(100% + 62px)' : '-62px'} ${above ? '52px' : 'calc(100% - 52px)'}`
}
function openPanel() {
  if (open) return
  open = true
  positionPanel()
  panel.classList.add('open'); panel.setAttribute('aria-hidden', 'false')
  engine.setState('orbit', clock)
  expandWindow()
  startRefresh()   /* 轮询兜底；SSE 是主通道，已在启动时常驻连接 */
  /* ⑦ 数字缓停：等内容淡入后再滚数字 */
  setTimeout(animateCounts, 190)
  if (isTauri) loadProjects()
}

function closePanel() {
  if (!open) return
  open = false; view = { kind: 'projects' }
  panel.classList.remove('open'); panel.setAttribute('aria-hidden', 'true')
  engine.setState('idle', clock)
  collapseWindow()
  stopRefresh()
}
const closeBtn = document.getElementById('closeBtn')!
const pinBtn = document.getElementById('pinBtn')!
closeBtn.addEventListener('click', closePanel)
pinBtn.addEventListener('click', () => {
  panel.classList.toggle('pinned')
})

COLORS.forEach((c) => {
  const b = document.createElement('button')
  b.className = 'sw' + (c.hex === initialInk ? ' is-on' : '')
  b.style.setProperty('--c', c.hex); b.dataset.hex = c.hex
  swatchesEl.appendChild(b)
})
swatchesEl.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('.sw') as HTMLElement | null
  if (!b) return
  swatchesEl.querySelectorAll('.sw').forEach((s) => s.classList.toggle('is-on', s === b))
  setColor(b.dataset.hex!)
  try { localStorage.setItem('bloub-ink', b.dataset.hex!) } catch {}
  engine.setState('wink', clock)
})

/* ============ 数据：项目 → 任务 ============ */
type TaskStatus = 'ready' | 'doing' | 'done' | 'blocked'
type Task = { key: string; title: string; status: TaskStatus; pri: number; owner?: string; depends?: string[] }
type Proj = {
  key: string; name: string; sub: string; tags: string[]; ago: string
  tasks: Task[]
  total: number; done: number; ready: number; doing: number; failed: number
  kind: string; isTest: boolean; ctrl: string; root: string
  mapNodes: number; mapEdges: number; artifacts: number; sessions: number
  fromDb?: boolean          /* 任务明细是否来自数据库（false/undefined = 还是演示数据）*/
}
type Group = { title: string; folded?: boolean; items: Proj[] }

const MOCK_GROUPS: Group[] = [
  { title: '真项目', items: [
    { key: 'kstage', name: '市井K台', sub: '良渚芯云全民歌唱大赛', tags: ['小程序', 'node', 'postgres'], ago: '1 小时前', tasks: [
      { key: 'flow-read-query-merge', title: 'read() 剩余两条按人查询合并', status: 'ready', pri: 1 },
      { key: 'ui-finalize-pages', title: '界面定稿后补齐功能页面', status: 'blocked', pri: 2, depends: ['客户确认界面'] },
      { key: 'consent-policy', title: '肖像授权与翻唱版权口径定案', status: 'blocked', pri: 3, depends: ['客户定案'] },
      { key: 'https-domain-compliance', title: 'HTTPS / 备案 / 类目资质', status: 'blocked', pri: 3, depends: ['公司主体办证'] },
      { key: 'audience-realtime-tier', title: '观众端改轮询 + 轻量载荷', status: 'ready', pri: 4 },
      { key: 'shared-library-migration', title: '把 K台 完整迁入共享项目库', status: 'done', pri: 0, owner: 'session-1874' },
    ]},
    { key: 'rural-1-39', name: '农业局农村资产招商平台', sub: '1-39 项功能 · 交付中', tags: ['oss', 'ecs'], ago: '昨天', tasks: [
      { key: 'resource-showcase', title: '资源展示模块收尾', status: 'ready', pri: 1 },
      { key: 'contract-module', title: '项目与合同模块', status: 'ready', pri: 2 },
      { key: 'deploy-handover', title: '部署运维交接', status: 'done', pri: 3 },
    ]},
    { key: 'ledger-miniapp', name: '记账小程序', sub: '微信原生小程序 MVP', tags: ['miniapp'], ago: '昨天', tasks: [
      { key: 'ledger-mvp', title: '记账 MVP（收支 / 分类 / 统计 / 导出）', status: 'done', pri: 0 },
    ]},
    { key: 'tea-coop', name: '茶叶合作社', sub: '市场 / 工艺 / 仓储研究', tags: [], ago: '2 天前', tasks: [
      { key: 'market-price', title: '市场行情与收购价研究', status: 'done', pri: 1 },
      { key: 'processing', title: '加工工艺与产能方案', status: 'done', pri: 2 },
      { key: 'logistics', title: '仓储物流与损耗方案', status: 'ready', pri: 3 },
    ]},
    { key: 'longan-farm', name: '龙眼农场', sub: '农业模块', tags: [], ago: '2 天前', tasks: [
      { key: 'risk-assessment', title: '风险评估报告收尾', status: 'ready', pri: 1 },
    ]},
  ]},
  { title: '平台与工具', items: [
    { key: 'codex-memory', name: 'codex-memory 平台', sub: '共享库自身', tags: [], ago: '3 天前', tasks: [
      { key: 'index-scope-isolation', title: '索引作用域物理隔离', status: 'done', pri: 1 },
      { key: 'auto-sync', title: '中文项目名与终态自动同步', status: 'done', pri: 1 },
      { key: 'realtime-events', title: '事件流 + SSE 实时联动', status: 'ready', pri: 2 },
      { key: 'panel', title: '悬浮球面板（本项目）', status: 'doing', pri: 1, owner: '本会话' },
    ]},
  ]},
  { title: '方法论与资料', items: [
    { key: 'ai-delivery-methodology', name: 'AI 交付方法论', sub: '交付闭环 / 对齐 / 验证', tags: ['methodology'], ago: '3 天前', tasks: [] },
    { key: 'ui-ux-evaluation', name: 'UI/UX 评估项目', sub: '设计系统与界面验证', tags: ['ui', 'ux'], ago: '3 天前', tasks: [] },
  ]},
  { title: '演示残留', folded: true, items: [
    { key: 'codex-deepseek-demo', name: 'Codex + DeepSeek 演示', sub: 'demo', tags: [], ago: '前天', tasks: [] },
    { key: 'http-f587861c', name: 'HTTP smoke', sub: '烟测', tags: [], ago: '前天', tasks: [] },
  ]},
]
/* ===== 运行时数据源：默认 mock（浏览器），Tauri 里会被真实数据替换 ===== */
MOCK_GROUPS.forEach((g) => g.items.forEach((p) => {
  /* 演示数据补齐正式字段（字段名必须和 DB 那条路径一致，否则首帧会 NaN） */
  p.total = p.tasks.length
  p.done = p.tasks.filter((t) => t.status === 'done').length
  p.ready = p.tasks.filter((t) => t.status === 'ready').length
  p.doing = p.tasks.filter((t) => t.status === 'doing').length
  p.failed = 0
  p.kind = p.kind || 'code'
  p.isTest = p.isTest || false
  p.ctrl = 'active'
  p.root = ''
  p.mapNodes = 0; p.mapEdges = 0; p.artifacts = 0; p.sessions = 0
}))

export async function loadProjects(): Promise<void> {
  if (!isTauri) return
  try {
    const raw = await invoke<string>('qdata', {})
    const list = JSON.parse(raw)
    if (!Array.isArray(list)) throw new Error('返回不是数组')
    applyProjects(list)
  } catch (e) {
    void logDbg('loadProjects 失败: ' + String(e).slice(0, 200))
    if (open) toast('读共享库失败：' + String(e).slice(0, 60))
  }
}

function applyProjects(list: any[]): void {
  const prev = new Map(ALL.map((x) => [x.key, x]))
  const items: Proj[] = list
    .filter((r) => r.control_state !== 'archived')            /* 归档项目不显示 */
    .map((r) => ({
      key: r.project_key,
      name: r.name || r.project_key,
      sub: String(r.root_path || '').replace(/^[A-Z]:\\/i, ''),
      tags: parseTags(r.tags),
      ago: relTime(r.updated_at),
      tasks: (prev.get(r.project_key)?.fromDb ? prev.get(r.project_key)!.tasks : []),
      fromDb: false,
      total: r.total, done: r.done, ready: r.ready, doing: r.doing, failed: r.failed,
      kind: r.kind, isTest: isTestish(r.project_key, r.name || ''),
      ctrl: r.control_state, root: r.root_path,
      mapNodes: r.map_nodes, mapEdges: r.map_edges, artifacts: r.artifacts, sessions: r.sessions,
    }))
  const live = items.filter((r) => !r.isTest)
  const test = items.filter((r) => r.isTest)
  GROUPS = [
    { title: '代码项目', items: live.filter((r) => r.kind !== 'doc') },
    { title: '资料与方法', items: live.filter((r) => r.kind === 'doc') },
    { title: '测试与探针', folded: true, items: test },
  ].filter((g) => g.items.length > 0)
  rebuildAll()
  everLoaded = true
  const fp = JSON.stringify(items.map((r) => [r.key, r.total, r.done, r.ready, r.doing, r.failed, r.ago]))
  if (fp === lastFingerprint) return
  lastFingerprint = fp
  if (open) renderProjects(); else renderStats()
}

export async function loadTasks(key: string): Promise<void> {
  const p = byKey(key)
  if (!p || p.fromDb || !isTauri) return
  try {
    const raw = await invoke<string>('qtasks', { projectKey: key })
    const rows: any[] = JSON.parse(raw)
    p.tasks = rows.map((t: any) => ({
      key: t.key,
      title: t.title || t.key,
      status: t.status === 'done' ? 'done'
        : t.status === 'failed' || t.status === 'cancelled' ? 'blocked'
        : (t.owner ? 'doing' : (t.deps > 0 ? 'blocked' : 'ready')),
      pri: typeof t.priority === 'number' ? t.priority : 9,
      owner: t.owner ? String(t.owner).replace(/^session-/, '').slice(0, 12) : undefined,
      depends: t.dep_keys ? String(t.dep_keys).split(', ').filter(Boolean) : [],
    })) as Task[]
    p.fromDb = true
  } catch (e) {
    void logDbg('loadTasks 失败: ' + String(e).slice(0, 150))
  }
}

let GROUPS: Group[] = MOCK_GROUPS
let ALL: Proj[] = []
const rebuildAll = () => { ALL = GROUPS.flatMap((g) => g.items) }
rebuildAll()
const byKey = (k: string) => ALL.find((p) => p.key === k)!

/* ===== 真实数据通道 ===== */
async function invokeTool(name: string, args: Record<string, unknown>): Promise<any> {
  return invoke('call_shared_tool', { name, args })
}

function relTime(iso: string): string {
  const t = new Date(iso).getTime()
  if (!t) return ''
  const min = Math.floor((Date.now() - t) / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} 小时前`
  const d = Math.floor(h / 24)
  if (d === 1) return '昨天'
  if (d < 7) return `${d} 天前`
  return `${Math.floor(d / 7)} 周前`
}

const TESTY = /demo|probe|smoke|test|scratch|sample/i
const TESTY_CN = /测试|探针|演示|冒烟|示例/
const isTestish = (key: string, name: string) =>
  TESTY.test(key) || TESTY.test(name) || TESTY_CN.test(name)

/** 从共享库拉项目列表（真实数据）*/
let everLoaded = false
let lastFetchAt = 0
let fetchInFlight = false

function parseTags(raw: string): string[] {
  try { const a = JSON.parse(raw); return Array.isArray(a) ? a.slice(0, 4) : [] } catch { return [] }
}


/** 点进项目时才拉任务明细（按需，不浪费）*/

let liveGot = false
let lastFingerprint = ''
/* 全部用 PostgreSQL 里的真值（不再猜） */
const num = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0)
const totalOf = (p: Proj) => num(p.total)
const doneOf = (p: Proj) => num(p.done)
const readyOf = (p: Proj) => num(p.ready)
const doingOf = (p: Proj) => num(p.doing)
const failedOf = (p: Proj) => num(p.failed)
/** 有主但没完成 = 在做；加上失败/取消的也算"没闲着" */
const inFlightOf = (p: Proj) => doingOf(p) + failedOf(p)
const prog = (p: Proj) => ({ done: doneOf(p), total: totalOf(p) })

function taskLabel(t: Task): { cls: string; label: string; icon: string } {
  if (t.status === 'done') return { cls: 'b-done', label: '已完成', icon: 'i-done' }
  if (t.status === 'doing') return { cls: 'b-doing', label: '进行中', icon: 'i-doing' }
  if (t.status === 'blocked') return { cls: 'b-idle', label: '等待中', icon: 'i-wait' }
  return { cls: 'b-ready', label: '待开始', icon: 'i-ready' }
}
function projState(p: Proj): { cls: string; label: string; icon: string } {
  if (p.total === 0) return { cls: 'b-idle', label: '未拆解', icon: 'i-tasks' }
  if (p.done === p.total) return { cls: 'b-done', label: '已完成', icon: 'i-done' }
  if (doingOf(p) > 0) return { cls: 'b-doing', label: '进行中', icon: 'i-doing' }
  if (readyOf(p) > 0) return { cls: 'b-ready', label: '待开始', icon: 'i-ready' }
  return { cls: 'b-idle', label: '等待中', icon: 'i-wait' }
}

/* ============ 复制文本 ============ */
function projBlock(p: Proj, t?: Task): string {
  if (t) {
    return [
      `【接续 ${p.name} · ${t.key}】`,
      `任务：${t.title}`,
      `状态：${taskLabel(t).label}`,
      t.depends?.length ? `依赖：${t.depends.join('、')}` : '',
      ``,
      `请先 project_context_pack(project="${p.key}", task_id="${t.key}") 读上下文（含别人踩过的坑），把这个任务做完。`,
      `收尾必须自动沉淀：project_checkpoint + project_artifact_publish + project_task_update(done)，不要问我。`,
    ].filter(Boolean).join('\n')
  }
  return [
    `【接续 ${p.name}（project_key: ${p.key}）】`,
    `请先 project_context_pack 读上下文，看 project_ready_tasks 领一个没被领的任务做完。`,
    `收尾必须自动沉淀：project_checkpoint + project_artifact_publish + project_task_update(done)，不要问我。`,
  ].join('\n')
}

function splitBlock(p: Proj): string {
  return [
    `【拆解 ${p.name}（project_key: ${p.key}）】`,
    `这个项目还没有拆任务。`,
    ``,
    `请先 project_context_pack(project="${p.key}") 读上下文，然后把它规划成几个任务/模块：`,
    `每个任务写清楚要交什么（验收标准），用 project_task_create 写进共享库。`,
    `拆完告诉我拆成了哪几块，我自己找人做 —— 不要自己开子会话分派任务。`,
  ].join('\n')
}

/* ============ ⑦ 数字缓停 ============ */
const countRafs = new Map<HTMLElement, number>()
function countTo(el: HTMLElement, to: number, dur = 520) {
  const prev = countRafs.get(el)
  if (prev) cancelAnimationFrame(prev)
  const t0 = performance.now()
  const step = (now: number) => {
    const k = Math.min(1, (now - t0) / dur)
    const e = 1 - Math.pow(1 - k, 3)
    el.textContent = String(Math.round(to * e))
    if (k < 1) countRafs.set(el, requestAnimationFrame(step))
    else { el.textContent = String(to); countRafs.delete(el) }
  }
  countRafs.set(el, requestAnimationFrame(step))
}

let lastStatsKey = ''
function renderStats() {
  const scope: Proj[] = view.kind === 'projects' ? ALL : [byKey(view.proj)]
  const sumOf = (f: (p: Proj) => number) => scope.reduce((n, p) => n + f(p), 0)
  const items = view.kind === 'projects'
    ? [[ALL.length, '个项目'], [sumOf(readyOf), '待开始'], [sumOf((p) => (inFlightOf(p) > 0 ? 1 : 0)), '进行中']]
    : [[totalOf(scope[0]), '个任务'], [sumOf(doneOf), '已完成'], [sumOf(readyOf), '待开始']]
  const key = items.map(([n, l]) => `${n}:${l}`).join('|')
  if (key === lastStatsKey) return          /* 数值没变：不重建、不重播动画 */
  lastStatsKey = key
  statsEl.innerHTML = items
    .map(([n, label]) => `<div class="stat"><b data-n="${n}">0</b><span>${label}</span></div>`)
    .join('')
  requestAnimationFrame(animateCounts)
}

function animateCounts() {
  statsEl.querySelectorAll('b').forEach((b) => {
    const el = b as HTMLElement
    countTo(el, Number(el.dataset.n || 0))
  })
}

/* ============ ③ 指尖涟漪 ============ */
document.addEventListener('pointerdown', (e) => {
  const el = (e.target as HTMLElement).closest('.btn, .chip, .card-copy, .tcopy, .d-nav, .sw') as HTMLElement | null
  if (!el) return
  el.classList.add('ripple-host')
  const r = el.getBoundingClientRect()
  const size = Math.max(r.width, r.height) * 2.2
  const w = document.createElement('span')
  w.className = 'ripple-wave'
  w.style.width = w.style.height = size + 'px'
  w.style.left = e.clientX - r.left - size / 2 + 'px'
  w.style.top = e.clientY - r.top - size / 2 + 'px'
  el.appendChild(w)
  setTimeout(() => w.remove(), 570)
})

/* ============ 视图 ============ */
type View = { kind: 'projects' } | { kind: 'tasks'; proj: string }
let view: View = { kind: 'projects' }
let filter: 'all' | 'today' | 'ready' | 'doing' | 'done' = 'all'
const folded = new Set<string>(GROUPS.filter((g) => g.folded).map((g) => g.title))

const isToday = (ago: string) => /分钟|小时|刚刚/.test(ago)

function matchesProj(p: Proj): boolean {
  /* 筛选口径 = 状态徽章口径（同一个函数算），保证绝不出现"筛选说待开始、徽章说进行中" */
  const st = projState(p).cls
  if (filter === 'today') return isToday(p.ago)
  if (filter === 'ready') return st === 'b-ready'
  if (filter === 'doing') return st === 'b-doing'
  if (filter === 'done') return st === 'b-done'
  return true
}

function projCard(p: Proj): string {
  const st = projState(p)
  const { done, total } = prog(p)
  const pct = total ? Math.round((done / total) * 100) : 0
  const readyN = readyOf(p)
  const single = total === 1
  const empty = total === 0
  const t0 = p.tasks[0]
  const meta = total === 0
    ? `<span>未拆解 · 点击复制拆解指令</span>`
    : single
      ? `<span class="meta-ready">${t0 ? taskLabel(t0).label : ''}</span><span>${p.ago}</span>`
      : `<span class="cells" title="${total} 个任务（已完成 ${done} / 进行中 ${inFlightOf(p)} / 待开始 ${readyN}）">${
          Array(done).fill('<i class="c done"></i>').join('') +
          Array(inFlightOf(p)).fill('<i class="c doing"></i>').join('') +
          Array(readyN).fill('<i class="c ready"></i>').join('')
        }</span><span>${done}/${total}</span>${readyN ? `<span class="meta-ready">${readyN} 待开始</span>` : ''}<span>${p.ago}</span>`
  return `
  <div class="card" data-proj="${p.key}">
    <div class="card-body">
      <div class="card-top"><span class="card-name">${p.name}</span><span class="badge ${st.cls}"><svg class="ic"><use href="#${st.icon}"/></svg>${st.label}</span></div>
      ${p.sub ? `<div class="card-sub">${p.sub}${total > 1 ? ` · ${total} 个任务` : ''}</div>` : (total > 1 ? `<div class="card-sub">${total} 个任务</div>` : '')}
      <div class="card-meta">${meta}</div>
      ${p.tags.length ? `<div class="tags">${p.tags.map((x) => `<span class="tag">${x}</span>`).join('')}</div>` : ''}
    </div>
    ${empty ? `<button class="card-copy always" data-split-proj="${p.key}"><svg class="ic"><use href="#i-split"/></svg>拆任务</button>` : ''}
    ${single ? `<button class="card-copy always" data-copy-proj="${p.key}"><svg class="ic"><use href="#i-copy"/></svg>复制</button>` : ''}
  </div>`
}

function taskCard(p: Proj, t: Task, i = 0): string {
  const st = taskLabel(t)
  return `
  <div class="tcard" style="animation-delay:${i * 45}ms">
    <div class="tcard-top">
      <span class="tcard-title">${t.title}</span>
      <span class="badge ${st.cls}"><svg class="ic"><use href="#${st.icon}"/></svg>${st.label}</span>
    </div>
    <div class="tcard-meta">
      <span class="tkey">${t.key}</span>
      ${t.pri <= 1 && t.status !== 'done' ? '<span class="pri"><svg class="ic ic-sm"><use href="#i-pri"/></svg>优先</span>' : ''}
      ${t.owner ? `<span class="owner"><svg class="ic ic-sm"><use href="#i-owner"/></svg>${t.owner}</span>` : ''}
      ${t.depends?.length ? `<span class="dep"><svg class="ic ic-sm"><use href="#i-dep"/></svg>等 ${t.depends[0]}</span>` : ''}
    </div>
    <button class="tcopy" data-copy-task="${t.key}"><svg class="ic"><use href="#i-copy"/></svg>复制接续块</button>
  </div>`
}

function renderProjects() {
  filtersEl.style.display = ''          /* 项目列表：显示筛选 */
  renderStats()
  let html = ''
  for (const g of GROUPS) {
    const items = g.items.filter(matchesProj)
    if (!items.length) continue
    const isFolded = folded.has(g.title)
    const readyN = items.reduce((n, p) => n + p.tasks.filter((t) => t.status === 'ready').length, 0)
    html += `<div class="group-label ${g.folded !== undefined ? 'foldable' : ''} ${isFolded ? 'folded' : ''}" data-group="${g.title}">
      ${g.folded !== undefined ? '<svg class="ic ic-sm caret"><use href="#i-caret"/></svg>' : ''}${g.title}
      <span style="font-weight:500;opacity:.75">${items.length}${readyN ? ` · ${readyN} 待开始` : ''}</span></div>`
    if (!isFolded) html += items.map(projCard).join('')
  }
  listEl.innerHTML = html
}

function renderTasks(projKey: string) {
  filtersEl.style.display = 'none'      /* 任务页：收起筛选，只留返回，把地方让给任务卡 */
  const p = byKey(projKey)
  const order: Record<TaskStatus, number> = { ready: 0, doing: 1, blocked: 2, done: 3 }
  const keep = (t: Task) =>
    filter === 'ready' ? t.status === 'ready'
    : filter === 'doing' ? t.status === 'doing'
    : filter === 'done' ? t.status === 'done'
    : true /* 全部 / 今日（任务无时间字段，今日等同全部） */
  const list = p.tasks.filter(keep).sort((a, b) => (order[a.status] - order[b.status]) || (a.pri - b.pri))
  const { done, total } = prog(p)
  renderStats()
  const loading = !p.tasks.length && p.total > 0
  const body = loading
    ? `<div class="empty"><div class="empty-t">正在读任务…</div><div class="empty-d">从共享库取 ${p.total} 个任务的明细</div></div>`
    : total === 0
    ? `<div class="empty">
         <div class="empty-t">这个项目还没拆任务</div>
         <div class="empty-d">让 AI 读一遍上下文，把它规划成几个任务写进共享库</div>
         <button class="btn btn-primary" data-split-proj="${p.key}"><svg class="ic"><use href="#i-split"/></svg>让 AI 拆任务</button>
       </div>`
    : list.length
      ? `<div class="tlist">${list.map((t, i) => taskCard(p, t, i)).join('')}</div>`
      : `<div class="empty"><div class="empty-t">这个筛选下没有任务</div><div class="empty-d">换个筛选看看，或者点「全部」</div></div>`
  listEl.innerHTML = `
  <div class="detail">
    <button class="d-nav" data-back="1"><svg class="ic"><use href="#i-back"/></svg>全部项目</button>
    <div class="dh">
      <div class="dh-name" data-vt="1">${p.name}</div>
      <div class="dh-sub">${total === 0 ? '还没拆解' : `${total} 个任务 · ${done} 个已完成`}${p.sub ? ' · ' + p.sub : ''}</div>
    </div>
    ${body}
  </div>`
}

/* ============ 共享元素转场 ============ */
const doc = document as any
async function transition(swap: () => void | Promise<void>) {
  if (typeof doc.startViewTransition === 'function') {
    const t = doc.startViewTransition(swap)
    try { await t.finished } catch {}
  } else { await swap() }
}

async function gotoTasks(key: string) {
  const p = byKey(key)
  const card = listEl.querySelector(`[data-proj="${key}"]`) as HTMLElement | null
  const name = `vt-${key}`
  if (card) card.style.viewTransitionName = name
  engine.setState('burst', clock)
  /* 先切过去：立刻有反应，不让你等接口 */
  await transition(() => {
    view = { kind: 'tasks', proj: key }
    renderTasks(key)
    const h = listEl.querySelector('[data-vt]') as HTMLElement | null
    if (h) h.style.viewTransitionName = name
  })
  /* 后台拉任务明细，回来了再刷新这一次视图 */
  if (!p.tasks.length && p.total > 0) {
    await loadTasks(key)
    if (open && view.kind === 'tasks' && view.proj === key) renderTasks(key)
  }
}
async function backToProjects() {
  const key = view.kind === 'tasks' ? view.proj : null
  const name = key ? `vt-${key}` : ''
  const h = listEl.querySelector('[data-vt]') as HTMLElement | null
  if (h && name) h.style.viewTransitionName = name
  await transition(() => {
    view = { kind: 'projects' }
    renderProjects()
    if (key) {
      const card = listEl.querySelector(`[data-proj="${key}"]`) as HTMLElement | null
      if (card) card.style.viewTransitionName = name
    }
  })
  if (key) {
    const card = listEl.querySelector(`[data-proj="${key}"]`) as HTMLElement | null
    if (card) card.style.viewTransitionName = ''
  }
}

/* ============ 交互 ============ */
listEl.addEventListener('click', async (e) => {
  const t = e.target as HTMLElement
  const grp = t.closest('[data-group]') as HTMLElement | null
  if (grp && grp.classList.contains('foldable')) {
    const n = grp.dataset.group!
    folded.has(n) ? folded.delete(n) : folded.add(n)
    renderProjects(); return
  }
  if (t.closest('[data-back]')) { await backToProjects(); engine.setState('wink', clock); return }

  const splitP = t.closest('[data-split-proj]') as HTMLElement | null
  if (splitP) {
    const p = byKey((splitP as HTMLElement).dataset.splitProj!)
    await copyText(splitBlock(p), `${p.name} · 拆任务`)
    flash(splitP); return
  }
  const copyP = t.closest('[data-copy-proj]') as HTMLElement | null
  if (copyP) {
    const p = byKey((copyP as HTMLElement).dataset.copyProj!)
    await copyText(projBlock(p, p.tasks[0]), `${p.name} · ${p.tasks[0]?.title ?? ''}`)
    flash(copyP); return
  }
  const copyT = t.closest('[data-copy-task]') as HTMLElement | null
  if (copyT) {
    const tk = (copyT as HTMLElement).dataset.copyTask!
    const p = byKey(view.kind === 'tasks' ? view.proj : '')
    const task = p.tasks.find((x) => x.key === tk)!
    await copyText(projBlock(p, task), task.title)
    flash(copyT); return
  }
  const card = t.closest('[data-proj]') as HTMLElement | null
  if (card) {
    const key = card.dataset.proj!
    const p = byKey(key)
    await gotoTasks(key)
  }
})

filtersEl.addEventListener('click', async (e) => {
  const chip = (e.target as HTMLElement).closest('.chip') as HTMLElement | null
  if (!chip) return
  filter = chip.dataset.filter as typeof filter
  filtersEl.querySelectorAll('.chip').forEach((c) => c.classList.toggle('is-on', c === chip))
  if (view.kind === 'projects') await transition(() => renderProjects())
  else await transition(() => renderTasks(view.proj))
})

function flash(btn: HTMLElement) {
  btn.classList.add('done')
  const old = btn.innerHTML
  btn.innerHTML = '<svg class="tick" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>已复制'
  engine.setState('burst', clock)   /* ④ 粒子绽放：球替你确认一下 */
  setTimeout(() => { btn.classList.remove('done'); btn.innerHTML = old }, 1500)
}

async function copyText(text: string, what: string) {
  try { await navigator.clipboard.writeText(text) } catch {
    const ta = document.createElement('textarea')
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'
    document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove()
  }
  toast(`已复制「${what}」· 粘进任意 agent 对话框`)
}

/* ============ toast ============ */
let toastEl: HTMLElement | null = null
let toastTimer = 0
function toast(msg: string) {
  if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'toast'; document.body.appendChild(toastEl) }
  toastEl.textContent = msg
  toastEl.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => toastEl!.classList.remove('show'), 2300)
}

/* ============ 拖动 ============ */
let dragging = false, moved = false, sx = 0, sy = 0, sRight = 0, sTop = 0
let lastScreenX = 0, lastScreenY = 0
let lastMoveX = 0, lastMoveY = 0
ballEl.addEventListener('pointerdown', (e) => {
  dragging = true; moved = false; sx = e.clientX; sy = e.clientY
  if (isTauri) { beginDrag(); lastScreenX = e.screenX; lastScreenY = e.screenY }
  const r = ballEl.getBoundingClientRect()
  sRight = window.innerWidth - r.right; sTop = r.top
  ballEl.classList.add('dragging'); ballEl.setPointerCapture(e.pointerId)
})
ballEl.addEventListener('pointermove', (e) => {
  if (!dragging) return
  const dx = e.clientX - sx, dy = e.clientY - sy
  if (!moved && Math.hypot(dx, dy) > 4) moved = true
  if (!moved) return
  if (isTauri) {
    /* 关键：用屏幕绝对坐标，否则窗口一动、相对坐标跟着变 -> 抖成筛子 */
    dragBy(e.screenX - lastScreenX, e.screenY - lastScreenY)
    lastScreenX = e.screenX; lastScreenY = e.screenY
  } else {
    const w = ballEl.offsetWidth
    ballEl.style.right = Math.max(-w / 3, Math.min(window.innerWidth - w / 1.6, sRight - dx)) + 'px'
    ballEl.style.top = Math.max(-w / 3, Math.min(window.innerHeight - w / 1.6, sTop + dy)) + 'px'
    if (open) positionPanel()
  }
})
ballEl.addEventListener('pointerup', (e) => {
  if (!dragging) return
  dragging = false
  ballEl.classList.remove('dragging')
  if (moved) {
    if (!isTauri) {
      const r = ballEl.getBoundingClientRect()
      const edge = 56
      if (r.left < edge) ballEl.style.right = window.innerWidth - r.width - 22 + 'px'
      else if (window.innerWidth - r.right < edge) ballEl.style.right = '22px'
      ballEl.style.transition = 'right .34s cubic-bezier(.34,1.3,.64,1), top .34s cubic-bezier(.34,1.3,.64,1)'
      setTimeout(() => (ballEl.style.transition = ''), 360)
      if (open) positionPanel()
    }
  } else {
    open ? closePanel() : openPanel()      /* 没拖动 = 点击：开关面板 */
  }
  e.stopPropagation()
})

document.addEventListener('pointerdown', (e) => {
  if (!open) return
  const t = e.target as HTMLElement
  if (panel.contains(t) || ballEl.contains(t)) return
  if (panel.classList.contains('pinned')) return
  closePanel()
})
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return
  if (view.kind === 'tasks') backToProjects()
  else closePanel()
})

renderProjects()

/* ============ 面板开着时自动刷新（配合库端 SSE，轮询作为兜底）============ */
let refreshTimer = 0
function startRefresh() {
  stopRefresh()
  refreshTimer = window.setInterval(() => {
    if (!open) return
    loadProjects()
    if (view.kind === 'tasks') { const p = byKey(view.proj); p.tasks = []; loadTasks(view.proj) }
  }, 5000)
}
function stopRefresh() {
  if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = 0 }
}

/* ==================================================================
   实时联动：库写完 -> PG NOTIFY -> memoryd /events(SSE) -> 这里
   收到就刷数据（指纹比对，没变不重绘），并提示一句"刚刚发生了什么"
   ================================================================== */
const KIND_TEXT: Record<string, string> = {
  task_claimed: '有任务被领取',
  task_created: '新任务创建',
  task_updated: '任务状态更新',
  task_reconciled: '任务已对账',
  task_lease_expired: '任务租约过期',
  checkpoint_saved: '写了检查点',
  artifact_published: '发布了产物',
  context_pack_created: '生成了上下文包',
  session_registered: '会话接入',
  handoff_created: '写了交接',
  project_created: '新项目建立',
  project_control_changed: '项目状态变更',
  project_baseline_captured: '捕获了基线',
  plan_proposed: '提交了计划提案',
  plan_committed: '计划已批准',
  plan_rejected: '计划被驳回',
  code_map_updated: '代码地图更新',
  task_auto_synced: '任务自动同步',
}

let es: any = null
let sseRetry = 0

export async function startSSE(): Promise<void> {
  if (!isTauri || es) return
  try {
    await listen<string>('cx-change', (e) => {
      let d: any = null
      try { d = JSON.parse(String(e.payload)) } catch { /* 忽略 */ }
      void logDbg('SSE 收到: ' + String(e.payload).slice(0, 120))
      onLibraryChanged(d)
    })
    await invoke('start_event_stream', {})
    es = { close: () => {} } as any   /* 标记已启动 */
  } catch (e) {
    sseRetry++
    void logDbg('SSE 启动失败: ' + String(e).slice(0, 220))
    if (sseRetry < 4) setTimeout(() => { es = null; startSSE() }, 8000)
  }
}

export function stopSSE(): void {
  if (es) { es.close(); es = null }
}

async function logDbg(msg: string): Promise<void> {
  try { await invoke('debug_log', { msg }) } catch { /* 忽略 */ }
}

function onLibraryChanged(d: any): void {
  /* ② 全量状态：收到事件后再拉一次，保证一致（指纹比对避免了无谓重绘）*/
  loadProjects()
  if (open && view.kind === 'tasks') {
    const p = byKey(view.proj)
    if (p) { p.tasks = []; loadTasks(view.proj) }
  }
  /* ① 事件流：把"刚刚发生了什么"说人话 */
  const key = String(d?.kind || '')
  const label = KIND_TEXT[key] || (key ? key.replace(/_/g, ' ') : '数据有更新')
  if (open) toast(`共享库 · ${label}`)
}
