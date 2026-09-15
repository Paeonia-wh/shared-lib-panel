/**
 * 共享项目库 · 悬浮球 ｜ v4
 * 层级：项目列表 → 点项目 → 任务卡片（每张卡单独复制）
 * 规则：项目只有 1 个任务 → 项目卡上直接给复制；多任务 → 点进去，逐任务复制
 * 球体 = bloub 引擎（jeremy-prt/bloub, MIT）
 */
import { BotEngine, type BotFrame } from './bot/engine'
import { RAYON, DEMI_VIEWBOX } from './bot/repere'
import { mixHex, COLORS, SHAPES, SHAPE_BY_ID, DEFAULT_SHAPE } from './bot/skins'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { isTauri, initTauri, expandWindow, collapseWindow, beginDrag, dragBy } from './tauri'

const VB = DEMI_VIEWBOX
const R = RAYON
const PAPER = '#eceff4'

/* ============ 颜色 ============ */
const savedInk = (() => { try { return localStorage.getItem('bloub-ink') } catch { return null } })()
const initialInk = savedInk && COLORS.some((c) => c.hex === savedInk) ? savedInk : COLORS[0].hex
/* 自动模式 = 球自己轮颜色和形状。你手动点过调色盘就关掉（色锁住，存 localStorage，
   重启也记得）；点调色盘末尾的「自」按钮回到自动。 */
let inkAuto = !savedInk
let inkLastChangedAt = 0
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
  setBotState('orbit', 0)   /* 转圈：从远处一路转过来 */
  const settle = () => {
    if (ballEl.classList.contains('settled')) return
    ballEl.classList.add('settled')
    setBotState('idle', clock)
  }
  setTimeout(() => setBotState('wink', clock), 1950)
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
  tickAutoplay(clock)     /* 动作：没人理它的时候自己动 */
  tickAutoSkin(clock)     /* 形状与颜色：节奏更慢，和动作错开 */
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

/* ============ 自动动作：没人理它的时候自己动 ============
 *
 * 用户要求（2026-09-15）："让他加一点动态感自己动起来，现在是我鼠标动它才会动，
 * 鼠标不动它就一直盯着那个方向盘"——所以要有自己的节奏。
 * 后来要求"把上游所有动作全部搞进去" + "动作塞不下你可以改嘛，反正都是开源的"
 * ——所以不砍动作，改成**按需整体缩小**让它们装下（见 ACTION_SCALE）。
 *
 * 上游 bloub 的完整清单见 jeremy-prt/bloub 的 SEQUENCE，共 14 个。
 * 窗口 = 球本身 = 54px，球半径 27px，所以画布给到的极限就是 **1.00R**。
 *
 * 各动作的绘制范围（从 decor.ts 的常量算出来，单位 R）：
 *   wink/wide/egg/hexagon/exclaim/comet  1.00R  —— 正好贴边，不用缩
 *   alert  0.87R · thinking 0.76R · sleep 0.35R  —— 本来就有余量
 *   notify 1.15R（蓝点在 1.003R 处 + 自身半径 0.15）
 *   burst  1.05R（往外飞的粒子）
 *   play   1.38R（SWOOSH 光带）
 *   orbit  1.40R（RINGS 六道光环）
 *
 * 上面四个超出 1.00R —— 不砍掉，改为**只在它们播放时把整个画面缩到 1.00R 以内**
 * （ACTION_SCALE）。缩的是渲染层，不动引擎的上游测量值：所有几何、掩码、描边
 * 一起等比缩，画面本身完全不变，只是这个动作期间球显得略小一点 ——
 * 换来的是"上游全部 14 个动作都能看到"。
 *
 * `swirl` 仍然不纳入：上游标注它是"界面转场，不是动作目录里的一员"
 * （transition d'interface, pas une animation du catalogue : hors SEQUENCE）。
 *
 * 权重分层：小幅表情（眨眼、歪头）出现得多，变形和大幅动作少一些。
 */
const AUTOPLAY_ACTIONS: { id: string; w: number }[] = [
  /* —— 小幅表情：常来，最自然 —— */
  { id: 'wink', w: 5 },      // 眨眼
  { id: 'thinking', w: 4 },  // 歪头想事
  { id: 'wide', w: 3 },      // 睁大眼
  /* —— 中等：偶尔 —— */
  { id: 'alert', w: 2 },     // 感叹号冲出来
  { id: 'exclaim', w: 2 },   // 变成一个感叹号
  { id: 'egg', w: 2 },       // 缩成一颗蛋
  { id: 'hexagon', w: 2 },   // 变六边形
  { id: 'notify', w: 2 },    // 蓝点提示
  /* —— 少见：大幅演出 —— */
  { id: 'sleep', w: 1 },     // 缩成小球上下浮（像睡着）
  { id: 'comet', w: 1 },     // 缩成一点 + 拖尾
  { id: 'burst', w: 1 },     // 炸开成粒子再重组
  { id: 'play', w: 1 },      // 三角 + 光带扫过
  { id: 'orbit', w: 1 },     // 三角绕圈 + 六道光环
]
const AUTOPLAY_TOTAL_W = AUTOPLAY_ACTIONS.reduce((n, a) => n + a.w, 0)

/* 各状态的持续时间（秒）。取自 states.ts 的 duration，留一点余量再回到 idle。 */
const ACTION_HOLD: Record<string, number> = {
  wink: 1.6, wide: 1.8, thinking: 2.6, alert: 2.4, exclaim: 2.0, notify: 2.2,
  egg: 1.8, hexagon: 1.6, sleep: 2.4, comet: 2.4, burst: 2.6, play: 2.0, orbit: 3.4,
}

/* 播放这些动作时把整个画面缩到 1.00R 以内。
   系数 = 1.00 / 该动作的最大绘制范围（上面注释里那几个数），再取整到两位。
   没列出来的动作一律按 1 处理（不缩）。 */
const ACTION_SCALE: Record<string, number> = {
  notify: 0.87,   // 1.15R → 1.00R
  burst: 0.95,    // 1.05R → 1.00R
  play: 0.72,     // 1.38R → 0.99R
  orbit: 0.71,    // 1.40R → 0.99R
}

/* 自动形状和自动换色。
 *
 * 用户要求："不仅仅动作吧，他不是还会变形状吗，反正都是全都结合起来。"
 * 上游本来就带两套可换的东西：
 *   - 形状：skins.ts 的 SHAPES（圆形 / 方圆 / 三角 / 六边形 / 水滴 / 胶囊）
 *   - 颜色：COLORS 的 12 色
 * 以前这两样只能手动点，现在让它自己也轮。
 *
 * 两条调度线跟动作那条分开，节奏错开：
 *   动作   4~11 秒一次（变化快，是"活着"的感觉）
 *   形状  25~50 秒一次（变化慢，太快了晃眼）
 *   换色  35~70 秒一次
 *
 * 换形状只在**空闲**时做：动作播放期间球体由动作自己掌控（egg/hexagon/exclaim
 * 这些状态声明了 baseBody=false，就是用它们自己的形体），这时候插一脚会打架。
 * 引擎的 setState 带 0.45s 形变，所以换形状是"慢慢变过去"而不是硬切。
 */
const AUTO_SHAPE_IDS = SHAPES.map((s) => s.id).filter((id) => id !== DEFAULT_SHAPE)

function scheduleAutoShape(from: number) {
  shapeNextAt = from + 3 + Math.random() * 6      // 3~9 秒
}
function scheduleAutoColor(from: number) {
  colorNextAt = from + 4 + Math.random() * 6      // 4~10 秒
}

/** 空闲时才轮换形状和颜色；有动作在播、或用户在操作时跳过。 */
function tickAutoSkin(now: number) {
  if (autoPlistState) return                              // 动作期间不抢
  const busy = (lookOverride !== null && lookOverride.mix > NEAR_MIX) || (now - lastMouseMoveAt < 1.5)
  /* 忙的时候只是不动，**不重置倒计时** —— 否则用户一直动鼠标，倒计时永远归零，
     松手后还要重新等一整个间隔。 */
  if (busy) return

  if (now >= shapeNextAt) {
    /* 轮流换，别连着两次同一个；也允许偶尔变回圆 */
    const pool = [DEFAULT_SHAPE, ...AUTO_SHAPE_IDS].filter((id) => id !== inkShapeId)
    const next = pool[Math.floor(Math.random() * pool.length)]
    const sp = SHAPE_BY_ID.get(next)
    if (sp) {
      inkShapeId = next
      engine.setShape([...sp.radii], now)          // 引擎做 0.45s 形变
      scheduleAutoShape(now)
      visualHoldUntil = now + 1.2                  // 让动作等一步，别立刻盖过去
    }
  }
  if (inkAuto && now >= colorNextAt) {
    const pool = COLORS.filter((c) => c.hex !== inkTo)
    const next = pool[Math.floor(Math.random() * pool.length)]
    if (next) {
      setColor(next.hex)
      inkLastChangedAt = now
      scheduleAutoColor(now)
      visualHoldUntil = now + 1.2
    }
  }
  if (!inkAuto) colorNextAt = now + 999            // 手动模式：不再安排换色
}

const NEAR_MIX = 0.25          // 鼠标多近算"用户在跟它互动"
let nextAutoAt = 0             // 下一次自动动作的时间（引擎时钟）
let autoPlistState: string | null = null
let lastAutoStart = 0
let lookOverride: any = null   // 鼠标给的注视目标；null = 鼠标很久没动，交还给引擎
let lastMouseMoveAt = -999     // 鼠标**真的移动**过的时刻（不是收到事件的时刻）
let lastMouseXY = { x: -9999, y: -9999 }
let shapeNextAt = 0            // 下一次换形状
let colorNextAt = 0            // 下一次换色
let inkShapeId: string = DEFAULT_SHAPE
/* 形状/颜色刚变过的一小段时间里不让动作抢场 —— 否则动作每 4~11 秒来一次、
   每次持续 1.6~3.4 秒，空闲窗口被吃得差不多，形状和颜色根本轮不到。 */
let visualHoldUntil = 0

function scheduleNextAuto(from: number) {
  nextAutoAt = from + 4 + Math.random() * 7     // 4~11 秒
}

function pickAutoAction(): string {
  let r = Math.random() * AUTOPLAY_TOTAL_W
  for (const a of AUTOPLAY_ACTIONS) {
    r -= a.w
    if (r <= 0) return a.id
  }
  return 'wink'
}

/**
 * 切状态 + 自动管缩放。
 *
 * 为什么要缩放：窗口 = 球本身，画布能给到的极限就是 1.00R；
 * notify / burst / play / orbit 四个动作的装饰会伸到 1.05~1.40R，直接播会被裁。
 * 与其砍掉它们，不如**播放期间把整个画面等比缩小**（ACTION_SCALE），
 * 播完再放回去。缩的是渲染层，不动引擎里那些从参考视频量出来的几何值 ——
 * 所以掩码、描边、渐变全都跟着一起缩，画面本身不会变形。
 *
 * 实现放在 SVG 元素上（不是每个路径上）：SVG 撑满球、球在正中心，
 * transform-origin 取中心正好是球心，缩放锚点天然对；而且能吃到 CSS 过渡，平滑。
 * 所有切状态的地方都走这个函数，别直接调 engine.setState —— 否则缩放会漏掉。
 */
function setBotState(id: string, now: number) {
  const k = ACTION_SCALE[id] ?? 1
  svg.style.setProperty('--bot-scale', String(k))
  engine.setState(id as any, now)
}

/** 每帧调一次：随机干活、干完回 idle、鼠标靠近就让位。 */
function tickAutoplay(now: number) {
  if (autoPlistState) {
    const st = autoPlistState
    const hold = ACTION_HOLD[st] ?? 2.4
    if (now - lastAutoStart >= hold) {
      setBotState('idle', now)
      autoPlistState = null
      scheduleNextAuto(now)
    }
    return
  }
  /* 用户在跟它互动（鼠标靠近或刚动过）就让位，不抢戏 */
  /* 关键：判"用户在用"看的是**鼠标真的在动**，不是"收到 mousemove 事件"。
     浏览器里鼠标停着不动也会持续发 mousemove，用事件时间戳判会让 busy 永远为真
     —— 实测过：鼠标移到很远（mix=0）时 busy 仍然 600/600 帧为真，小球永远不动。
     所以按位移>2px 才算"动了"（顺带把抖动噪声滤掉）。 */
  const busy =
    (lookOverride !== null && lookOverride.mix > NEAR_MIX) ||
    (now - lastMouseMoveAt < 1.5)
  if (busy) { nextAutoAt = Math.max(nextAutoAt, now + 2); return }
  /* 形状/颜色刚变过：先让它们被看见，动作推迟一下再上 */
  if (now < visualHoldUntil) { nextAutoAt = Math.max(nextAutoAt, visualHoldUntil + 0.3); return }
  if (now >= nextAutoAt) {
    const id = pickAutoAction()
    autoPlistState = id
    lastAutoStart = now
    setBotState(id as any, now)
    /* 顺手让眼神也跟着偏一点，别每次都是同一个"死鱼眼"角度 */
    engine.setLook({ yaw: (Math.random() - 0.5) * 26, pitch: (Math.random() - 0.5) * 12, mix: 0.6, spin: 0, wander: 1 }, now)
  }
}

document.addEventListener('mousemove', (e) => {
  const r = ballEl.getBoundingClientRect()
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2
  const dx = e.clientX - cx, dy = e.clientY - cy
  const dist = Math.hypot(dx, dy) || 1
  const near = Math.max(0, Math.min(1, 1 - (dist - 70) / 520))
  lookOverride = { yaw: (dx / dist) * 24 * near, pitch: (dy / dist) * 15 * near, mix: near, spin: 0, wander: 1 - near }
  /* 只有真的移动了才记时间。停着不动的 mousemove 不算"用户在用"，
     否则自动动作永远轮不到 —— 见 tickAutoplay 里的说明。 */
  if (Math.hypot(e.clientX - lastMouseXY.x, e.clientY - lastMouseXY.y) > 2) {
    lastMouseXY = { x: e.clientX, y: e.clientY }
    lastMouseMoveAt = clock
  }
  engine.setLook(lookOverride, clock)
})

/* 鼠标离开窗口 / 很久不动 → 把注视交还给自动动作，别一直死盯一个方向 */
window.addEventListener('blur', () => { lookOverride = null })
setInterval(() => {
  if (lookOverride && clock - lastMouseMoveAt > 3) {
    lookOverride = null
    engine.setLook(null, clock)     // 交还给引擎自己的 idle 微动
  }
}, 1000)

/* ============ 面板 ============ */
const panel = document.getElementById('panel') as HTMLElement
const listEl = document.getElementById('list') as HTMLElement
/* 筛选条已移除（用户要求：不要「全部/今日/进行中…」，直接把任务全列出来） */
const swatchesEl = document.getElementById('swatches') as HTMLElement
const statsEl = document.getElementById('stats') as HTMLElement
let open = false

/* 构建时间戳：一眼看出面板跑的是哪一版。
   为什么要有它：改完前端重启面板后，无法确认"看到的到底是新是旧"——
   这条路我已经绕过一次弯（查 exe 内嵌、查 WebView2 缓存，都不确定）。
   现在把构建时间写在标题旁边，是不是新的一眼就知道。 */
;(() => {
  const meta = document.querySelector('meta[name="panel-build"]')
  const stamp = document.getElementById('buildStamp')
  if (stamp) stamp.textContent = meta ? (meta.getAttribute('content') || 'dev') : 'dev'
})()

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
  setBotState('orbit', clock)
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
  setBotState('idle', clock)
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
/* 调色盘末尾多一个「自动」小按钮：回到自动换色/换形状的状态。
   规矩很简单 —— 只要你手动点过任何一个色，就进入手动模式（色被锁住，存进 localStorage，
   重启也记得）；点「自动」就解锁，球自己轮色轮形状。 */
const autoBtn = document.createElement('button')
autoBtn.className = 'sw sw-auto'
autoBtn.title = '自动换色 / 换形状'
autoBtn.textContent = '自'
swatchesEl.appendChild(autoBtn)

function renderAutoSwatch() {
  /* 「自」按钮只在自动模式下点亮；手动模式时 12 个色里有一个是亮的 */
  swatchesEl.classList.toggle('is-auto', inkAuto)
}

swatchesEl.addEventListener('click', (e) => {
  const t = e.target as HTMLElement
  if (t.closest('.sw-auto')) {
    /* 回到自动：清掉手动选择，球接着自己轮 */
    inkAuto = true
    swatchesEl.querySelectorAll('.sw').forEach((s) => s.classList.remove('is-on'))
    try { localStorage.removeItem('bloub-ink') } catch { }
    renderAutoSwatch()
    setBotState('wink', clock)
    return
  }
  const b = t.closest('.sw') as HTMLElement | null
  if (!b) return
  inkAuto = false                                   /* 手动点色 = 锁定，不再自动换 */
  swatchesEl.querySelectorAll('.sw').forEach((s) => s.classList.toggle('is-on', s === b))
  renderAutoSwatch()
  setColor(b.dataset.hex!)
  try { localStorage.setItem('bloub-ink', b.dataset.hex!) } catch { }
  setBotState('wink', clock)
})
renderAutoSwatch()

/* ============ 数据：项目 → 任务 ============ */
type TaskStatus = 'ready' | 'doing' | 'review' | 'done' | 'blocked'
type Task = {
  key: string; title: string; status: TaskStatus; pri: number; owner?: string; depends?: string[]
  raw?: string           /* 库里原始状态，用于区分「真被卡住」和「只是有依赖」 */
  desc?: string          /* 库里的任务说明：真正的任务书，常带"别再查一遍"的交接暗号 */
  nextAct?: string       /* 库里别人留的下一步 */
}
type Proj = {
  key: string; name: string; sub: string; tags: string[]; ago: string
  scope?: string         /* 库里的项目一句话定位（每个项目都有） */
  tasks: Task[]
  total: number; done: number; ready: number; doing: number; failed: number; review?: number
  kind: string; isTest: boolean; ctrl: string; root: string
  mapNodes: number; mapEdges: number; artifacts: number; sessions: number
  taskUpdatedAt?: string   /* 该项目下最新的任务更新时间：指纹要比它，否则改了任务说明却不重绘 */
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
      scope: String(r.scope || '').trim(),
      tags: parseTags(r.tags),
      ago: relTime(r.updated_at),
      tasks: (prev.get(r.project_key)?.fromDb ? prev.get(r.project_key)!.tasks : []),
      fromDb: false,
      total: r.total, done: r.done, ready: r.ready, doing: r.doing, failed: r.failed, review: num(r.review),
      kind: r.kind, isTest: isTestish(r.project_key, r.name || ''),
      ctrl: r.control_state, root: r.root_path,
      mapNodes: r.map_nodes, mapEdges: r.map_edges, artifacts: r.artifacts, sessions: r.sessions,
      taskUpdatedAt: String(r.task_updated_at || ''),
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
  /* 指纹要含**真正会变**的东西。
     原来只有计数和 ago（由 project.updated_at 推出来的相对时间），于是
     "只改了任务说明/状态、计数没变"的情况会被判定成没变化 → 不重绘（实测踩到过）。
     补上 project.updated_at 和该项目最新的 task.updated_at。 */
  const fp = JSON.stringify(items.map((r) => [
    r.key, r.total, r.done, r.ready, r.doing, r.failed, r.ago, r.taskUpdatedAt,
  ]))
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
        /* 库里显式标了 blocked 就照实显示（2026-09-15 对账发现：
           以前没有这个分支，blocked 会被降级成「进行中」或「待开始」，
           和共享库里写的对不上）。 */
        : t.status === 'blocked' ? 'blocked'
        /* 只有"未完成的前置"才算被卡住。
           以前用 deps（总前置数），导致前置全做完的任务永远显示成等待中
           —— 对账发现 cross-consistency 的 5 个前置全 done 了还被标卡住。 */
        /* 平台白名单里 status 还可以是 running 和 review，这两个原来都没有分支
         （和之前 blocked 被降级是同一个毛病）：
         running = 明确在做 → 进行中，不管有没有主（标了 running 说明有人在推）
         review  = 待验收 → 单独一档 */
      : t.status === 'running' ? 'doing'
      : t.status === 'review' ? 'review'
      : (t.owner ? 'doing' : (t.unmet_deps > 0 ? 'blocked' : 'ready')),
      raw: t.status,
      pri: typeof t.priority === 'number' ? t.priority : 9,
      owner: t.owner ? String(t.owner).replace(/^session-/, '').slice(0, 12) : undefined,
      depends: t.dep_keys ? String(t.dep_keys).split(', ').filter(Boolean) : [],
      desc: String(t.description || '').trim(),
      nextAct: String(t.next_action || '').trim(),
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
/* 库里有过变更、但当时没在看任务明细 → 标记为脏，下次点进项目重新拉。
   没有它的话，面板关着期间库里改了任务，点开看到的是内存里的旧数据。 */
let libraryDirty = false
/* 全部用 PostgreSQL 里的真值（不再猜） */
const num = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0)
const totalOf = (p: Proj) => num(p.total)
const doneOf = (p: Proj) => num(p.done)
const readyOf = (p: Proj) => num(p.ready)
const doingOf = (p: Proj) => num(p.doing)
const failedOf = (p: Proj) => num(p.failed)
const reviewOf = (p: Proj) => num(p.review)      /* 待验收：等别人验，不是等自己做 */
/** 有主但没完成 = 在做；加上失败/取消的也算"没闲着" */
const inFlightOf = (p: Proj) => doingOf(p) + failedOf(p)
const prog = (p: Proj) => ({ done: doneOf(p), total: totalOf(p) })

function taskLabel(t: Task): { cls: string; label: string; icon: string } {
  if (t.status === 'done') return { cls: 'b-done', label: '已完成', icon: 'i-done' }
  if (t.status === 'doing') return { cls: 'b-doing', label: '进行中', icon: 'i-doing' }
  /* 平台白名单里的 review（待验收）：等别人验，不是等自己做 —— 单独一档 */
  if (t.status === 'review') return { cls: 'b-ready', label: '待验收', icon: 'i-ready' }
  if (t.status === 'blocked') return { cls: 'b-idle', label: '等待中', icon: 'i-wait' }
  return { cls: 'b-ready', label: '待开始', icon: 'i-ready' }
}
function projState(p: Proj): { cls: string; label: string; icon: string } {
  if (p.total === 0) return { cls: 'b-idle', label: '未拆解', icon: 'i-tasks' }
  if (p.done === p.total) return { cls: 'b-done', label: '已完成', icon: 'i-done' }
  /* 有任务在做、或有待验收的 —— 都说明这个项目还在推进，别显示成等待中 */
  if (doingOf(p) > 0 || reviewOf(p) > 0) return { cls: 'b-doing', label: '进行中', icon: 'i-doing' }
  if (readyOf(p) > 0) return { cls: 'b-ready', label: '待开始', icon: 'i-ready' }
  return { cls: 'b-idle', label: '等待中', icon: 'i-wait' }
}

/* ============ 复制文本 ============ */
/*
 * 设计要点（2026-09-15 用户定案）：
 *  1) 复制块必须"按项目"，不是一刀切的套话。项目定位取自库里的 project.scope，
 *     任务说明取自 task.description —— 后者常带"不要再查一遍的事实""已尝试并完整撤销"
 *     这类交接暗号，是跨会话不重复踩坑的关键，以前一个字都没带。
 *  2) 执行要求里**不再写"不要问我"**——哪些该自己定、哪些该来问，交给 AI 自己判断；
 *     但沉淀照样要求，否则下个会话会把同样的事重问一遍。
 *  3) 库里没写说明时不编，如实标注"库里没写"，让接手的人知道该去补。
 */
/* 前置是否真的没做完。
   以前只要 depends 非空就一律标「卡在…」——对账发现 cross-consistency 的 5 个前置
   其实全都 done 了，面板却还在说"卡住"，属于冤枉。所以要查前置的实际状态。 */
function unmetDeps(p: Proj, t: Task): string[] {
  if (!t.depends?.length) return []
  const byKey = new Map(p.tasks.map((x) => [x.key, x]))
  return t.depends.filter((k) => {
    const dep = byKey.get(k)
    return dep ? dep.status !== 'done' : true   /* 查不到就保守当作未完成 */
  })
}

export function statusLine(p: Proj, t: Task): string {
  const base = taskLabel(t).label
  const unmet = unmetDeps(p, t)
  if (t.status === 'done') return `${base}${t.owner ? ` · ${t.owner}` : ''}`
  if (t.status === 'doing') return `${base}${t.owner ? ` · 已被 ${t.owner} 领走` : ''}`
  if (t.status === 'blocked') {
    if (unmet.length) return `${base} · 卡在 ${unmet.join('、')}`
    /* 库里标 blocked 但没有未完成的前置 —— 说明卡在别的地方（等客户、等资质等），
       不能编一个"卡在谁"，如实说"无未完成的前置"。 */
    return `${base} · 库里标了 blocked${t.depends?.length ? `（前置 ${t.depends.join('、')} 都已完成）` : ''}`
  }
  /* ready：有前置就说明前置已就绪 */
  if (t.depends?.length) return `${base} · 前置已就绪${t.owner ? `，已被 ${t.owner} 领走` : '，还没人领'}`
  return `${base} · 还没人领`
}

export function projBlock(p: Proj, t?: Task): string {
  const info = projInfo(p)

  if (t) {
    const body: string[] = []
    /* 已完成的任务不能再说"继续做"（2026-09-15 修）。
       原来 done 的任务也走同一分支：抬头写"继续做"、还逼它读知识图谱、回写库里 ——
       新会话可能把一个已经收口的活重新开工。done 是"看交接"，不是"接着做"。 */
    const isDone = t.status === 'done'
    body.push(isDone ? `【已完成 · ${p.name} / ${t.key}】` : `【继续做 · ${p.name} / ${t.key}】`)
    body.push(...info)
    body.push('')
    body.push(`任务：${t.title}`)
    body.push(`状态：${statusLine(p, t)}`)
    body.push(`依赖：${t.depends?.length ? t.depends.join('、') : '无'}`)
    body.push('')
    if (t.desc) {
      body.push('接续说明（库里原始记录，含别人踩过的坑）：')
      /* 超长说明截断：原样粘进对话框会变成一大块，用户在输入框里没法核对 */
      const DESC_MAX = 1200
      if (t.desc.length > DESC_MAX) {
        body.push(t.desc.slice(0, DESC_MAX))
        body.push(`……（说明过长已截断，完整 ${t.desc.length} 字请用 project_context_pack 或直接看 task.description）`)
      } else {
        body.push(t.desc)
      }
    } else {
      /* 原来写的是"顺手把说明补上" —— 但平台根本不接受改 description（update_task 只吃
         status/next_action/summary），等于指了一条不存在的路。改成能真正做到的事。 */
      body.push('接续说明：库里这个任务没写说明，能继承的只有上面这些。')
      body.push('  读了上下文后，把你查到的背景和踩到的坑写进检查点的 pitfalls / completed；')
      body.push('  顺带回报一句"这个任务的说明是空的"（description 创建时写死，改不了）。')
    }
    if (t.nextAct) {
      body.push('')
      body.push(`上一步留下的交代：${t.nextAct}`)
    }

    /* blocked 要分开说（2026-09-15 修）。
       原来只在"有未完成前置"时才提醒，于是"等客户/等资质"那类 blocked
       一句提示都没有，新会话看不到为什么卡住，可能硬开工。 */
    if (t.status === 'blocked') {
      const waiting = unmetDeps(p, t)
      body.push('')
      if (waiting.length) {
        body.push(`注意：库里标了 blocked，而且前置「${waiting.join('、')}」还没完成 —— 现在别开工。`)
      } else {
        body.push('注意：库里标了 blocked，但**没有未完成的前置** —— 说明卡的是外部原因（等人/等资质/等决定）。')
        body.push('  别自己想办法绕过去，先把"到底在等谁"问清楚再动手。')
      }
      const dangling = danglingDeps(p, t)
      if (dangling.length) {
        body.push(`另外：前置「${dangling.join('、')}」在当前库里查不到（可能已删/改名/属于别的项目）—— 先问清楚，别猜。`)
      }
    }

    if (isDone) {
      /* 已收口：只讲怎么接手看，不让它重做 */
      body.push('')
      body.push('这个任务已经标记完成了。如果你是想**了解它做了什么**，读上面这些就够了；')
      body.push('如果你觉得还得继续做，先说清楚原因，别直接把状态改回去重开。')
      body.push(`想拿完整上下文：project_task_dispatch(project="${p.key}", task_key="${t.key}") 拿 id → project_context_pack。`)
      return body.join('\n')
    }

    body.push('')
    body.push('执行要求（顺序别换 —— 换错一步会把自己锁死，见第 4 条）：')
    body.push(`  1) 先登记并领任务，拿到它的 id（注意：**id 不是下面这个 key**，是库里 32 位 uuid）：`)
    body.push(`     project_task_dispatch(project="${p.key}", task_key="${t.key}")   ← 返回里找 id`)
    body.push(`     不领就直接干的话，你发不了产出、最后也标不了完成（那两件事都要求"任务在你名下"）。`)
    body.push(`  2) 用那个 id 读上下文：project_context_pack(project="${p.key}", task_id="<上一步的 id>")`)
    body.push('     验收标准以里面的 Objective / Acceptance 为准；这两个是空的就自己写出验收标准并回写。')
    body.push(...mapRequirement(p, '3'))
    body.push('  4) 干活。**收尾顺序也不能换**：')
    body.push('     a. project_checkpoint(project=…, task_id=<id>, state={completed/not_done/pitfalls/blockers/next_action})')
    body.push('     b. project_artifact_publish(project=…, task_id=<id>, kind="doc", path="<真实存在的文件的绝对路径>", revision="<7位以上git短SHA>")')
    body.push('        ⚠ 必须是你自己名下的任务才能发；路径必须落在项目目录内且文件真的存在。')
    body.push('     c. project_task_update(project=…, task_id=<id>, status="done", next_action="下一步")')
    body.push('     d. 代码地图要更新的话，放在**最后**（它要求你手里还有 running 任务，先标 done 就写不进去了）')
    body.push(...discipline())
    body.push('  哪些该你自己定、哪些该来问我，你自己判断 —— 但别让下个会话把同样的事再问一遍。')
    return body.join('\n')
  }

  /* 项目层：项目现状简报（多任务项目卡）+ 单任务项目卡 */
  const body: string[] = []
  body.push(`【继续做 · ${p.name}】`)
  body.push(...info)
  body.push('')
  /* 进度行要说全。原来只列"已完成 / 待开始 / 在做"，于是会出现
     "3/7 已完成 · 2 个待开始" 这种数字加不到总数上、看着像自相矛盾的情况。
     按五桶口径列全（为 0 的不列），跟后端统计 SQL 一一对应。 */
  const pbits: string[] = [`${p.done}/${p.total} 已完成`]
  if (p.doing) pbits.push(`${p.doing} 个在做`)
  if (p.review) pbits.push(`${p.review} 个待验收`)
  if (p.ready) pbits.push(`${p.ready} 个待开始`)
  if (p.failed) pbits.push(`${p.failed} 个卡住/失败`)
  body.push(`进度：${pbits.join(' · ')}`)
  body.push('')
  /* 按状态分组列出，让人一眼看出哪些能接、哪些被卡住。
     分组必须和上面那行五桶口径一一对应 —— 原来没有「待验收」组，
     于是统计说"N 个待验收"、明细里却一个都找不到，数字和明细对不上。 */
  const shown: string[] = []
  const group = (title: string, list: Task[]) => {
    if (!list.length) return
    body.push(`${title}：`)
    for (const x of list) {
      const dep = x.depends?.length ? `（等 ${x.depends.join('、')}）` : ''
      const who = x.owner ? `（${x.owner}）` : ''
      body.push(`  · ${x.key} —— ${x.title}${dep}${who}`)
      shown.push(x.key)
    }
  }
  group('还没人领', p.tasks.filter((x) => x.status === 'ready'))
  group('正在做', p.tasks.filter((x) => x.status === 'doing'))
  group('待验收', p.tasks.filter((x) => x.status === 'review'))
  group('被卡住', p.tasks.filter((x) => x.status === 'blocked'))
  /* 已完成只列最近 5 个：50 个任务的项目全列会有 50 行 / 约 2500 字，
     把"待办"和"档案"混在一起，反而看不清该接哪个。 */
  const doneAll = p.tasks.filter((x) => x.status === 'done')
  const DONE_SHOW = 5
  if (doneAll.length) {
    body.push('已完成：')
    for (const x of doneAll.slice(0, DONE_SHOW)) {
      body.push(`  · ${x.key} —— ${x.title}`)
      shown.push(x.key)
    }
    if (doneAll.length > DONE_SHOW) {
      body.push(`  （另有 ${doneAll.length - DONE_SHOW} 个已完成没列出来，需要时用 project_overview 查）`)
    }
  }
  /* 兜底：库里可能有面板分组之外的状态（比如 failed / cancelled 被归进「没闲着」）。
     列不出来就明确说一句，别让数字和明细对不上。 */
  const rest = p.tasks.filter((x) => !shown.includes(x.key))
  if (rest.length) {
    body.push(`其他状态 ${rest.length} 个：${rest.map((x) => `${x.key}（${x.status}）`).join('、')}`)
  }
  body.push('')
  body.push('执行要求：')
  body.push(`  1) 先看项目现状：project_overview(project="${p.key}") 拿任务清单和最近事件。`)
  body.push(...mapRequirement(p, '2'))
  body.push(`  3) 本会话没指定做哪个任务的话，别回来问 —— 直接查可领的：`)
  body.push(`     project_ready_tasks(project="${p.key}")，挑一个"还没人领"的，`)
  body.push(`     然后 project_task_dispatch(project="${p.key}", task_key="<挑中的那个>") 领走并拿到 id。`)
  body.push('     上面每个任务卡也能单独复制接续块，里面带着那个任务的完整交接说明。')
  body.push(...discipline())
  return body.join('\n')
}
/* ============================================================
   复制块用的公共片段
   ============================================================
   这一段里的每句话都对着共享库的**真实实现**核过（2026-09-15，两轮独立评审 + 逐条实测）。
   踩过/修过的坑，写在这里免得后人再犯：

   · task_id 不是 task_key！服务端 _task() 只按 `WHERE id=%s` 查，id 是 32 位 uuid。
     原来复制块写 `task_id="${t.key}"`，会话照抄第一步就 `Task not found: consent-policy`。
   · 顺序不能换：先 update(status=done) 会连带补空壳检查点 + 抓 git baseline + 导出投影，
     而且代码地图写入要求"手里有 running/review 任务" —— 先标 done 就再也写不了地图。
   · 产出归属：artifact_publish 硬门禁要求"任务在自己名下"，没领过就发不出。
   · "只写检查点面板不会变"是错的：checkpoint 带 next_action 时会一并
     UPDATE agent_tasks.next_action + updated_at，而 next_action 就是面板显示的"下一步"。
   · DSH 侧的桥没暴露 project_task_create / project_plan_review（会 ToolUnavailable），
     所以"建任务"这条路对 DSH 会话来说只有 propose → 别人审批。
   · project_context_pack 的 task_id 是**必填位置参数**，只传 project 直接 TypeError。
   ============================================================ */

function repoLine(p: Proj): string[] {
  const root = (p.root || '').trim()
  return root ? [`仓库：${root}`] : ['仓库：库里没登记这个项目的代码目录（先用 project_for_path 确认工作目录）']
}

/* 项目描述。scope 为空时给一句兜底，别让新会话只看一个项目名就开始猜。 */
function projInfo(p: Proj): string[] {
  const scope = (p.scope || '').trim()
  return scope
    ? [`项目：${scope}`, ...repoLine(p)]
    : [`项目：库里没写这个项目的 scope —— 先用 project_overview(project="${p.key}") 搞清楚它是什么再动手。`, ...repoLine(p)]
}

/* 前置依赖里，哪些是库里**真实存在的任务**、哪些只是写在名字上。
   判断依据：拿它对 p.tasks 里的 key 比对 —— 比不出来就是悬空（已被删/改名/或
   当初就是写了一句话而不是真依赖，比如"等公司主体办证"）。
   为什么要提示：unmetDeps 把查不到的依赖保守当成"未完成"，但新会话在库里根本
   找不到那个 key，不说明白它会一直找。 */
function danglingDeps(p: Proj, t: Task): string[] {
  if (!t.depends?.length) return []
  const known = new Set(p.tasks.map((x) => x.key))
  return t.depends.filter((d) => !known.has(d))
}

/* 收尾纪律。三条都是实战里踩出来的：报错要照贴、格式不合法要降级、完成由对账说了算。 */
function discipline(): string[] {
  return [
    '',
    '  几条纪律：',
    '    · 任何工具报错，把**报错原文**照贴回来（含工具名和完整 message），不要自己改述、不要假装成功。',
    '    · 顺序最关键：**先领任务 → 动手 → 检查点/产出 → 最后才标 done → 再更新代码地图**。',
    '      先标 done 会导致：发不出产出、写不了代码地图（那两件事都要求任务还在你名下/是活跃状态）。',
    '    · 标 done 只是标状态。算不算真完成由**独立对账**说了算，而且对账人不能是任务所有者：',
    '      project_reconcile(project=…, task_id=<id>, status="verified", reviewer_session_id=<另一个会话>)。',
    '    · context_pack 报错或内容被截断（出现 [context truncated …]）时：改用 project_overview +',
    '      project_code_map 分批读，别凭印象开工。',
  ]
}

/* 知识图谱（代码地图）读取要求。
   用户 2026-09-15 明确要求：会话必须先读知识图谱 / 知识库结构，不能凭空开始。
   库里的地图装在 agent_code_nodes / agent_code_edges，每个节点带职责说明和对应文件路径，
   由 project_context_pack 一并返回；面板这里补一句显式要求，并按实际情况说清楚
   （有图就说去读，没图就让人先建，别让人对着空气执行）。 */
function mapRequirement(p: Proj, num = '2'): string[] {
  const nodes = p.mapNodes || 0
  const edges = p.mapEdges || 0
  /* 资料类项目（kind=doc）本来就不该有代码地图 —— 逼它建等于每次都在教它做错事 */
  if (p.kind === 'doc') {
    return [
      num + ') 这是资料/方法类项目，不用读代码地图；要梳理的话把资料结构和来源写进知识图谱。',
    ]
  }
  const line = num + ') 读知识图谱（代码地图）—— 弄清模块划分、各自职责、代码在哪个文件、模块之间怎么调。'
  if (nodes > 0) {
    return [
      line,
      `     已记录 ${nodes} 个模块 / ${edges} 条调用关系；context_pack 里就带着，`,
      `     也可以单独 project_code_map(project="${p.key}") 取完整版。动手前先看它，别重读全仓库。`,
      `     改了代码的形状就用 project_code_map_write 更新回去，**记得带 revision**（7 位以上 git 短 SHA），`,
      `     不传的话下个会话看到的会是 unversioned（会打 WARNING）；replace=True 会被拒，只能合并。`,
    ]
  }
  return [
    line,
    `     但这个项目现在**还没有**代码地图（0 个模块）—— 读不到东西。`,
    `     所以顺手做一件事：读一遍代码后用 project_code_map_write 把地图建起来`,
    `     （模块 / 职责 / 文件路径 / 调用关系 + revision），下个会话才不用重读全仓库。`,
  ]
}

export function splitBlock(p: Proj): string {
  const body: string[] = []
  body.push(`【拆解 ${p.name}】`)
  body.push(...projInfo(p))
  body.push('')
  body.push('这个项目还没有拆任务。')
  body.push('执行要求：')
  body.push(`  1) 先看现状：project_overview(project="${p.key}") 拿项目图和最近事件。`)
  body.push(...mapRequirement(p, '2'))
  body.push('  3) 先判断这个项目**要不要**拆任务：')
  body.push('     · 要写代码/要做功能 → 拆成若干任务，每个写清"要交什么"（验收标准）。')
  body.push('     · 纯资料/纯记录类 → 不用拆，把资料结构和来源整理进知识图谱就行，别硬造任务。')
  body.push('  4) **建之前先查重**：project_overview 看一眼已有任务，别和现有的重了 ——')
  body.push('     同一个 key 建第二次会直接报 Task already exists；但换个 key 建同一件事不会报，')
  body.push('     只会让库里多一张重复卡（本会话就干过一次，靠事后核对才发现）。')
  body.push('  5) 要拆的话，注意建任务这条路分两种情况（先确认是哪一种，别撞墙）：')
  body.push(`     · 先 project_session_register(project="${p.key}", provider="<你的 provider>", model="<你的 model>") 登记自己；`)
  body.push('       没登记的话后面所有写操作都会因为"会话不在这个项目里"而失败。')
  body.push('     · 项目计划没锁 → 直接用 project_task_create(project=…, task_key=…, title=…, description=…, priority=…)。')
  body.push('     · 项目计划已锁（报 "initial plan is locked"）→ 只能提案，不能直接建：')
  body.push('       project_plan_propose(project=…, reason=…, changes=[{operation:"add_task", task_key:…, title:…, description:…, priority:…}])')
  body.push('       然后**请用户或另一个会话**去审批（project_plan_review）——')
  body.push('       规则是"提议者不能审自己的提案"，而且 DSH 侧的桥没暴露 review 工具，你自己批不了。')
  body.push('  6) 拆完把结果告诉我：拆成了哪几块。**不要自己开子会话分派任务** —— 我自己找人做。')
  body.push(...discipline())
  return body.join('\n')
}
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
  /* 统计条：五桶口径（进行中 / 待开始 / 待验收）—— 和后端 SQL 的桶一一对应，
     数字和任务卡永远一致。待验收（review）单独一列：它是等别人验，不是等自己做。 */
  const items: [number, string][] = view.kind === 'projects'
    ? [[ALL.length, '个项目'], [sumOf((p) => (inFlightOf(p) > 0 ? 1 : 0)), '进行中'], [sumOf(readyOf), '待开始'], [sumOf(reviewOf), '待验收']]
    : [[totalOf(scope[0]), '个任务'], [sumOf(doneOf), '已完成'], [sumOf((p) => inFlightOf(p)), '进行中'], [sumOf(readyOf), '待开始'], [sumOf(reviewOf), '待验收']]
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
const folded = new Set<string>(GROUPS.filter((g) => g.folded).map((g) => g.title))

/* 项目列表顺序（用户定案 2026-09-15）：
   进行中 → 待开始 → 被卡住 → 已完成 → 还没拆解
   "按紧急程度，正在进行中在待开始上面，已完成去最下面"。
   以前直接用后端返回的顺序（ORDER BY control_state, project_key = 按 key 字母序），
   结果已完成的 codex-memory 排在在做的前面，完全不反映紧急度。
   同一档里：待开始多的排前面（更有的干），再按项目名。 */
function projUrgency(p: Proj): number {
  if (p.total === 0) return 4          /* 还没拆解：等拆完才有活，排最后 */
  if (doingOf(p) > 0) return 0         /* 进行中：最上面 */
  if (readyOf(p) > 0) return 1         /* 有待开始 */
  if (failedOf(p) > 0) return 2        /* 有失败的 */
  return 3                             /* 全部完成：最下面 */
}
function sortProjects(items: Proj[]): Proj[] {
  return [...items].sort((a, b) =>
    (projUrgency(a) - projUrgency(b)) ||
    (readyOf(b) - readyOf(a)) ||
    a.name.localeCompare(b.name, 'zh'))
}
/* 筛选条已按用户要求去掉（2026-09-15）：不再按状态过滤，一律"把任务都列出来"，
   顺序由 buildTaskList() 决定（正在做 → 待开始 → 被卡住 → 已完成）。 */

export function projCard(p: Proj): string {
  const st = projState(p)
  const { done, total } = prog(p)
  const pct = total ? Math.round((done / total) * 100) : 0
  const readyN = readyOf(p)
  const single = total === 1
  const empty = total === 0
  const t0 = p.tasks[0]

  /* 产出数 / 代码地图规模：qdata 一直返回，但面板从没显示过。
     为什么必须显示（2026-09-15 用户提的）：面板的"进度"只数任务，不数提交 ——
     一个大任务里干了一周的活，进度条纹丝不动，看起来像没干。
     而共享库本来就有两个能反映工作量的东西：
       ① artifacts —— 会话发布过的产出（project_artifact_publish）
       ② map_nodes/map_edges —— 知识图谱规模
     把它们亮出来，"干了活但没建任务"的情况就看得见了；顺带能一眼看出哪个项目还没建图谱。 */
  const artN = p.artifacts || 0
  const mapN = p.mapNodes || 0
  /* 显示形态：图标 + 数字，不写文字。第一版写成"· 2 个产出 · 图谱 44 节点"，
     太长，把计数行挤换行、卡片被撑高（用户截图反馈）。完整说法放进 title。 */
  const extraBits: string[] = []
  if (artN > 0) extraBits.push(`<span class="meta-extra" title="${artN} 个产出（会话发布过的交付物）"><svg class="ic"><use href="#i-artifact"/></svg>${artN}</span>`)
  if (mapN > 0) extraBits.push(`<span class="meta-extra" title="代码地图 ${mapN} 节点 / ${p.mapEdges || 0} 条调用关系"><svg class="ic"><use href="#i-graph"/></svg>${mapN}</span>`)
  const extraRow = extraBits.length ? `<div class="mr">${extraBits.join('')}</div>` : ''
  const meta = total === 0
    ? `<div class="mr"><span>未拆解 · 先用「拆任务」把它拆开</span></div>${extraRow}`
    : single
      ? `<div class="mr"><span class="meta-ready">${t0 ? taskLabel(t0).label : ''}</span><span>${p.ago}</span></div>${extraRow}`
      : `<div class="mr"><span class="cells" title="${total} 个任务（已完成 ${done} / 进行中 ${inFlightOf(p)} / 待验收 ${reviewOf(p)} / 待开始 ${readyN}）">${
          Array(done).fill('<i class="c done"></i>').join('') +
          Array(inFlightOf(p)).fill('<i class="c doing"></i>').join('') +
          Array(readyN).fill('<i class="c ready"></i>').join('')
        }</span><span>${done}/${total}</span>${readyN ? `<span class="meta-ready">${readyN} 待开始</span>` : ''}<span>${p.ago}</span></div>${extraRow}`
  return `
  <div class="card" data-proj="${p.key}">
    <div class="card-body">
      <div class="card-top"><span class="card-name">${p.name}</span><span class="badge ${st.cls}"><svg class="ic"><use href="#${st.icon}"/></svg>${st.label}</span></div>
      ${p.sub ? `<div class="card-sub">${p.sub}${total > 1 ? ` · ${total} 个任务` : ''}</div>` : (total > 1 ? `<div class="card-sub">${total} 个任务</div>` : '')}
      <div class="card-meta">${meta}</div>
      ${p.tags.length ? `<div class="tags">${p.tags.map((x) => `<span class="tag">${x}</span>`).join('')}</div>` : ''}
    </div>
    ${empty ? `<button class="card-copy always" data-split-proj="${p.key}"><svg class="ic"><use href="#i-split"/></svg>拆任务</button>` : ''}
    ${single ? `<button class="card-copy always" data-copy-proj="${p.key}"><svg class="ic"><use href="#i-copy"/></svg>复制接续块</button>` : ''}
    ${!empty && !single ? `<button class="card-copy always" data-copy-proj="${p.key}"><svg class="ic"><use href="#i-copy"/></svg>复制现状简报</button>` : ''}
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
  renderStats()
  let html = ''
  for (const g of GROUPS) {
    const items = sortProjects(g.items)      /* 紧急度：进行中 → 待开始 → 被卡住 → 已完成 → 未拆解 */
    if (!items.length) continue
    const isFolded = folded.has(g.title)
    const readyN = items.reduce((n, p) => n + readyOf(p), 0)
    html += `<div class="group-label ${g.folded !== undefined ? 'foldable' : ''} ${isFolded ? 'folded' : ''}" data-group="${g.title}">
      ${g.folded !== undefined ? '<svg class="ic ic-sm caret"><use href="#i-caret"/></svg>' : ''}${g.title}
      <span style="font-weight:500;opacity:.75">${items.length}${readyN ? ` · ${readyN} 待开始` : ''}</span></div>`
    if (!isFolded) html += items.map(projCard).join('')
  }
  listEl.innerHTML = html
}

/* 任务列表顺序（用户定案 2026-09-15）：
   正在做 → 待开始 → 被卡住 → 已完成
   "正在进行中最上面，待开始下面，已完成去最下面"。同组内按 priority（数字小的优先=更紧急）。 */
const TASK_ORDER: Record<TaskStatus, number> = { doing: 0, review: 1, ready: 2, blocked: 3, done: 4 }
const TASK_GROUP_TITLE: Record<TaskStatus, string> = {
  doing: '正在做', review: '待验收', ready: '待开始', blocked: '被卡住', done: '已完成',
}
const buildTaskList = (tasks: Task[]) =>
  [...tasks].sort((a, b) => (TASK_ORDER[a.status] - TASK_ORDER[b.status]) || (a.pri - b.pri))

function renderTasks(projKey: string) {
  const p = byKey(projKey)
  const list = buildTaskList(p.tasks)
  /* 按状态分段，段内保持上面的顺序 */
  const segments: { status: TaskStatus; items: Task[] }[] = []
  for (const t of list) {
    const last = segments[segments.length - 1]
    if (last && last.status === t.status) last.items.push(t)
    else segments.push({ status: t.status, items: [t] })
  }
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
      ? `<div class="tlist">${
          segments.map((seg) =>
            `<div class="tgroup"><span class="tgroup-t">${TASK_GROUP_TITLE[seg.status]}</span>` +
            `<span class="tgroup-n">${seg.items.length}</span></div>` +
            seg.items.map((t) => taskCard(p, t, list.indexOf(t))).join('')
          ).join('')
        }</div>`
      : `<div class="empty"><div class="empty-t">这个项目没有任务</div><div class="empty-d">点「让 AI 拆任务」把它规划成几个任务写进共享库</div>
         <button class="btn btn-primary" data-split-proj="${p.key}"><svg class="ic"><use href="#i-split"/></svg>让 AI 拆任务</button></div>`
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
  setBotState('burst', clock)
  /* 先切过去：立刻有反应，不让你等接口 */
  await transition(() => {
    view = { kind: 'tasks', proj: key }
    renderTasks(key)
    const h = listEl.querySelector('[data-vt]') as HTMLElement | null
    if (h) h.style.viewTransitionName = name
  })
  /* 后台拉任务明细，回来了再刷新这一次视图 */
  /* 拉任务明细的时机。
     原来只有"本地一条都没有"才拉 —— 于是库里改了任务说明/状态之后，
     点进来看到的还是内存里那份旧的（实测踩到过：检查点写了、任务改了，面板没变）。
     所以补一个 libraryDirty：库里有过变更就把缓存作废，重新拉一次。 */
  if ((!p.tasks.length || libraryDirty) && p.total > 0) {
    p.tasks = []
    p.fromDb = false
    libraryDirty = false
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
  if (t.closest('[data-back]')) { await backToProjects(); setBotState('wink', clock); return }

  const splitP = t.closest('[data-split-proj]') as HTMLElement | null
  if (splitP) {
    const p = byKey((splitP as HTMLElement).dataset.splitProj!)
    await copyText(splitBlock(p), `${p.name} · 拆任务`)
    flash(splitP); return
  }
  const copyP = t.closest('[data-copy-proj]') as HTMLElement | null
  if (copyP) {
    const p = byKey((copyP as HTMLElement).dataset.copyProj!)
    /* 单任务项目：卡上这一下要的就是那个任务的接续块。
       多任务项目：要的是"项目现状简报"，所以不能把 tasks[0] 传进去
       —— 传了就会变成复制第一个任务的接续块，跟按钮上写的不是一回事。 */
    if (p.total === 1 && p.tasks[0]) {
      await copyText(projBlock(p, p.tasks[0]), `${p.name} · ${p.tasks[0].title}`)
    } else {
      await copyText(projBlock(p), `${p.name} · 现状简报`)
    }
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

function flash(btn: HTMLElement) {
  btn.classList.add('done')
  const old = btn.innerHTML
  btn.innerHTML = '<svg class="tick" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>已复制'
  setBotState('burst', clock)   /* ④ 粒子绽放：球替你确认一下 */
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

/* ============ 标题栏：复制「怎么记录进共享库」 ============
 *
 * 为什么要有这个按钮（2026-09-15 用户提的）：
 * 有会话老老实实写了 project_checkpoint，但面板纹丝不动 —— 因为**检查点不影响面板
 * 显示的任何字段**（面板读的是任务状态/说明/计数，检查点在另一张表）。
 * 所以需要一段说明告诉别的会话：面板到底读什么、该把结果记在哪，
 * 不然它会以为自己白写了。
 *
 * 内容不是新编的规矩，而是把库里原有的规定（agents_stub.py 写进各项目 AGENTS.md 的
 * 「收工前必须写 checkpoint，五项一个都别省」）+ 面板特有的显示规则合并在一起。
 *
 * 放在标题栏而不是项目卡上：这段说明是**全局**的（讲机制），不针对某个项目，
 * 所以不带 project_key；会话自己知道在做哪个项目。
 */
const LIBRARY_RECORD_REQUIREMENT = [
  `【共享项目库 · 记录要求】`,
  ``,
  `⚠ 本会话可能做了不止一个任务。每一轮做过的都得记，不能只记最后一轮 ——`,
  `   库里没有"整场会话"这种记录粒度（检查点必须挂在具体任务上），做了 N 个就记 N 次。`,
  ``,
  `【第一步 · 盘点】把本会话从开始到现在做过的任务列一遍。改过代码 / 写过文档 /`,
  `   查过问题并得出过结论 —— 都算。特别注意没在库里领过的那些（最容易漏）。`,
  ``,
  `【第二步 · 逐个闭环】对每一个任务，按这个顺序做（顺序错了会把自己锁死）：`,
  `   ① project_task_dispatch(project=…, task_key="<任务的 key>") → 拿到 id（32 位 uuid）`,
  `      ⚠ 后面所有工具要的都是这个 **id**，不是 key —— 传 key 会报 Task not found。`,
  `      没领过任务的后果：发不出产出、标不了完成（都要求"任务在你名下"）。`,
  `   ② project_checkpoint(project=…, task_id=<id>, state={...}) —— 五项一个都别省：`,
  `        completed 完成了什么 / not_done 没完成什么 / pitfalls 踩过的坑（★ 最重要，写具体）`,
  `        / blockers 卡在什么外部依赖 / next_action 下一步`,
  `      ⚠ 带 next_action 的检查点会一并更新任务的"下一步"并让面板刷新；不带就不会动面板。`,
  `   ③ project_artifact_publish(project=…, task_id=<id>, kind="doc", path="<真实文件绝对路径>")`,
  `      路径必须落在项目目录内、文件必须真的存在，否则当场报错。`,
  `   ④ project_task_update(project=…, task_id=<id>, status="done", next_action="下一步")`,
  `   ⑤ 代码地图要更新的话放**最后**（它要求你手里还有活跃任务，先标 done 就写不进去了）。`,
  ``,
  `【第三步 · 自检】逐个念一遍：这个任务在库里是 done 了吗？它有检查点了吗？`,
  `   我第一步列出的任务，有没有哪个还没走完上面这几步？`,
  ``,
  `想让面板动，必须动**任务本身**（状态 / 说明 / 下一步）—— 面板读的是它。`,
  `完整机制（含各种门禁和报错原因）见 D:\\codex-memory\\README.md 和各项目 AGENTS.md。`,
].join('\n')

const reqBtn = document.getElementById('reqBtn') as HTMLButtonElement | null
if (reqBtn) {
  /* ② 果冻压扁：pointerdown 时挂类，动画播完摘掉（摘掉才能再次触发） */
  reqBtn.addEventListener('pointerdown', () => {
    reqBtn.classList.remove('press')
    void reqBtn.offsetWidth            /* 强制回流，保证连点也能重放 */
    reqBtn.classList.add('press')
    setTimeout(() => reqBtn.classList.remove('press'), 340)
  })
  reqBtn.addEventListener('click', async () => {
    await copyText(LIBRARY_RECORD_REQUIREMENT, '怎么记录进共享库')
    /* ⑤ 成功反馈：整块变绿 + 一笔画勾（图标只有 14px，不塞文字，和图钉同尺寸） */
    if (reqBtn.classList.contains('done')) return
    const old = reqBtn.innerHTML
    reqBtn.classList.add('done')
    reqBtn.innerHTML = '<svg class="tick" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    setBotState('burst', clock)        /* ④ 粒子绽放：球替你确认一下 */
    setTimeout(() => { reqBtn.classList.remove('done'); reqBtn.innerHTML = old }, 1500)
  })
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
    if (p) { p.tasks = []; p.fromDb = false; loadTasks(view.proj) }
  } else {
    /* 面板关着（或没在看任务）：这里拿不到"正在看哪个项目"，
       所以统一标记为脏 —— 下次点进任何一个项目都会重新拉明细。
       不这样的话，关着面板期间库里改了任务，点开看到的是内存里的旧数据。 */
    libraryDirty = true
  }
  /* ① 事件流：把"刚刚发生了什么"说人话 */
  const key = String(d?.kind || '')
  const label = KIND_TEXT[key] || (key ? key.replace(/_/g, ' ') : '数据有更新')
  if (open) toast(`共享库 · ${label}`)
}
