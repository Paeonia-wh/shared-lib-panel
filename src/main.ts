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
  /* ★ 全部内容包进一个 <g id="perf"> —— 这是 ③ 的"表演层"落点（2026-09-16 加）。
     为什么能这么简单：SVG 里**每个元素都用绝对坐标画**（见上面那些 x/y/cx/cy），
     所以在外层套一个 <g transform="…"> 就等于"把整张画面搬动/旋转/压扁"，
     引擎那 15 个状态的几何一个都不用改。
     ⚠ 为什么不把 transform 加到 <svg> 自己身上：它的 transform 已经被
       `.ball svg { transform: scale(var(--bot-scale)) }` 占了（动作缩放），
       而且 `.ball` 上还有入场动画和 hover 缩放 —— 三个东西**都在抢 transform**。
       包一层 <g> 是唯一不打架的做法。 */
  return `<g id="perf">` + `<defs>${defs.join('')}</defs>` +
    `<g fill="none" stroke-linecap="round">${arc('back')}</g>` +
    (f.dotsBehind ? `<g>${dotMarkup(f.dots, ink)}</g>` : '') +
    `<g opacity="${f.bodyAlpha}"><path d="${f.bodyPath}" fill="${PAPER}"/>` +
    `<g mask="url(#${uid}-mask)"><rect x="${-VB}" y="${-VB}" width="${VB * 2}" height="${VB * 2}" fill="${ink}"/></g></g>` +
    (!f.dotsBehind ? `<g>${dotMarkup(f.dots, ink)}</g>` : '') +
    (f.notif ? `<circle cx="${f.notif.x}" cy="${f.notif.y}" r="${f.notif.r}" fill="#4b8dff"/>` : '') +
    `<g fill="none" stroke-linecap="round">${arc('front')}</g>` + `</g>`
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
  tickPerform(clock)      /* ③ 大动作：蹦/转圈/荡秋千（整个画面搬动） */
  svg.innerHTML = frameMarkup(engine.sample(clock), curInk())
  /* ③ 把这一帧的表演变换**设在 <g id="perf"> 上**（见 frameMarkup 里的说明）。
     为什么要重新取一次元素：上一行刚把 innerHTML 换掉，旧的 g 已经被丢了。 */
  const perfG = svg.querySelector('#perf')
  if (perfG) {
    const tr = performTransform(clock)
    if (tr) perfG.setAttribute('transform', tr)
  }
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

/* ==================================================================
   ① 库里发生的事 → 球的反应（2026-09-16 加）
   ==================================================================

   为什么要它：球有 15 个动作、也有自动播放（4~11 秒一次），
   但**它的动作全部由 UI 交互触发** —— 开/关/拖/复制。
   而库里发生的事（另一个会话领了活、发了产出、把任务标完、计划被驳回）
   面板**已经知道**（SSE 事件流 + 兜底轮询），甚至已经有 18 种事件的中文标签，
   但**球一个都没用**。

   设计取舍（不按"怎么好看"排，按"值不值得打扰你"排）：
     · **分级**：不是每种事件都值得蹦一下。领活/建卡只瞟一眼；
       产出落地给个蓝点；收口/驳回才值得出手。
     · **限流**：事件是**流**——一次操作可能连出好几条。不限流球会一直抽搐，
       那就成了噪音，你第一件事会是把它关掉。所以每级各有冷却。
     · **让位**：用户在跟球互动（鼠标贴近）时**不抢戏** —— 这条沿用 autoplay 的口径。
     · **不打断正在播的大动作**：autoplay 的演出播到一半被事件打断会很碎。
       除非事件更重要（tier 1 可以打断 tier 2/3）。
*/
type ReactTier = {
  state: string        /* 播哪个状态 */
  hold: number         /* 播多久（秒）—— 不依赖 ACTION_HOLD，事件反应要更短更轻 */
  cooldown: number     /* 这一档最短间隔（秒） */
  dart: boolean        /* 顺手让视线瞟一下（很轻的那一档） */
}
const REACT_TIERS: Record<number, ReactTier> = {
  1: { state: 'notify', hold: 1.6, cooldown: 4, dart: false },   // 值得看一眼
  2: { state: 'wide',   hold: 1.1, cooldown: 5, dart: true },    // 轻瞟一眼
  3: { state: 'alert',  hold: 2.0, cooldown: 8, dart: false },   // 这里卡住了
}
/* 事件 → 档位。没列出来的事件**不反应**（宁缺勿滥 —— 球不是事件日志）。
   名字都取自 daemon 实际会发的事件（KIND_TEXT 那张表是同一批）。 */
const EVENT_TIER: Record<string, number> = {
  /* 收口类：有东西真的完成了 —— 最值得看一眼 */
  task_reconciled: 1,
  plan_committed: 1,
  project_created: 1,
  /* 落地类：有产出/检查点 —— 中等 */
  artifact_published: 1,
  plan_rejected: 3,
  /* 动静类：有人来了/有活动了 —— 最轻 */
  task_claimed: 2,
  task_created: 2,
  checkpoint_saved: 2,
  session_registered: 2,
  handoff_created: 2,
  code_map_updated: 2,
  /* 卡住类：这个得让人知道 */
  task_lease_expired: 3,
}
let lastReactAt: Record<number, number> = { 1: -999, 2: -999, 3: -999 }
let lastReactTier = 0
/* 事件反应想播多久（秒）。0 = 没在播事件反应，走 ACTION_HOLD 的默认口径。
   为什么事件反应要自己的时长：它比 autoplay 的演出**更短更轻** ——
   库里掉一条事件不该让球演 3 秒（见 REACT_TIERS 里的 hold）。 */
let reactHold = 0

/**
 * 库里发生了一件事 → 球给个反应。由 onLibraryChanged 调。
 *
 * ⚠ 为什么用 **clock**（引擎时钟、秒）而不是 Date.now()（毫秒）：
 *   球所有的时间判断都走 clock（见 tickAutoplay / scheduleNextAuto），
 *   混用两套时钟会让"冷却"/"让位"这些判断对不上。
 */
function reactToLibraryEvent(kind: string): void {  const tier = EVENT_TIER[kind]
  if (!tier) return                                    /* 没列出来的事件不反应 */
  const spec = REACT_TIERS[tier]
  if (!spec) return

  /* 用户在跟球互动 → 让位，不抢戏（和 autoplay 同一条口径） */
  const busy = (lookOverride !== null && lookOverride.mix > NEAR_MIX) || (clock - lastMouseMoveAt < 1.5)
  if (busy) return

  /* 冷却：同一档最短间隔 */
  if (clock - (lastReactAt[tier] ?? -999) < spec.cooldown) return

  /* 正在播：更重要的档可以打断，否则让当前这条播完 */
  if (autoPlistState) {
    const playing = REACT_TIER_OF_STATE[autoPlistState] ?? 0
    const playingIsHeavier = playing !== 0 && playing < tier      /* 数字小 = 更重要 */
    if (playingIsHeavier) return
  }

  lastReactAt[tier] = clock
  lastReactTier = tier
  autoPlistState = spec.state
  lastAutoStart = clock
  reactHold = spec.hold
  setBotState(spec.state, clock)
  if (spec.dart) {
    /* 轻瞟一眼：别每次都是同一个角度（否则看着像机械复位） */
    engine.setLook({
      yaw: (Math.random() - 0.5) * 22,
      pitch: (Math.random() - 0.5) * 10,
      mix: 0.5, spin: 0,
      wander: 0.8,
    }, clock)
  }
}
/* 反查：某个状态是"事件反应"还是"autoplay 演出"。
   只给事件反应登记 —— autoplay 那些不在表里，值取 0（最轻），
   所以一次事件可以打断 autoplay，而 autoplay 自己的演出不会被事件打碎两次。 */
const REACT_TIER_OF_STATE: Record<string, number> = {
  notify: 1, wide: 2, alert: 3,
}

/* 测试用：把"事件反应"的内部状态摊出来。
   为什么要导出：这件事**没法靠看内容断言**（它是"球动了没动、动了几次"），
   而球是画在 SVG 上的。所以给它一个可读的快照，测试才能守住
   "分级/限流/让位"这三条不退回。

   ⚠ 顺便暴露 **setClock**：main.ts 里的 `clock` 只在渲染循环（rAF）里推进，
   而测试把 rAF mock 成了 no-op → **clock 冻在 0** → 所有冷却判断都恒为"在冷却内"。
   所以测试需要一个能推时钟的口子，否则它测的是一套假的时间。
   （第一版没暴露它，测试就因为这个假象报了"第一次给反应"失败 —— 见测试文件。） */
export const __botReactProbe = () => ({
  playing: autoPlistState,
  hold: reactHold,
  lastTier: lastReactTier,
  clock,
  /** 和 reactToLibraryEvent 里 busy 判据**同一套表达式** —— 测试用它守"让位" */
  busy: (lookOverride !== null && lookOverride.mix > NEAR_MIX) || (clock - lastMouseMoveAt < 1.5),
  cooldowns: { ...lastReactAt },
})
export const __botReact = reactToLibraryEvent
export const __botTickAutoplay = (now: number) => tickAutoplay(now)
export const __botSetClock = (t: number) => { clock = t }
/** 模拟"鼠标贴近球"（让位判据的输入）。传 null 恢复成"鼠标没在动"。 */
export const __botSetLookOverride = (mix: number | null) => {
  lookOverride = mix === null ? null : { yaw: 0, pitch: 0, mix, spin: 0, wander: 0.5 }
}
export const __botSetLastMouseMoveAt = (t: number) => { lastMouseMoveAt = t }
/** 测试用：把 autoplay 推到很远的将来（或恢复）。
    为什么需要：autoplay 每 4~11 秒自己播一个动作。测试推时钟时会**撞上它** ——
    于是断言 `playing === 'wide'` 拿到的是 autoplay 播的 `burst`（实测踩到）。
    关掉它，测试才只测"事件反应"这一件事。 */
export const __botSetAutoplayEnabled = (on: boolean) => {
  autoplayOff = !on
  if (on) { scheduleNextAuto(clock) } else { nextAutoAt = Number.POSITIVE_INFINITY }
}
/* "autoplay 被关掉了"的标记。
   为什么不能只把 nextAutoAt 设成 Infinity：**tickAutoplay 里那句
   `scheduleNextAuto(now)`（动作播完时）会把它重排回去** ——
   实测踩到：关掉之后推一次时钟，autoplay 又活了，测试拿到 `hexagon`。
   所以要一个**标记**，让"关掉"这件事在重排时也守得住。 */
let autoplayOff = false

/* ==================================================================
   ② 球的"心情"：有活在推进 / 有卡住的 / 全闲（2026-09-16 加）
   ==================================================================

   ## 为什么是"状态驱动"而不是"定时换"

   ① 是**点事件**（库里发生了一件事）→ 事件驱动 + 冷却，所以有"间隔"。
   ② 是**一个面**（库里现在的整体状况）→ 只在**状态真的变了**才该变。
   给 ② 定固定间隔是错的：那就成了"每 30 秒换个样子"的背景噪音，
   而且用户永远学不会"这个样子是什么意思"。

   所以更新点只有**一处**：`applyProjects()` ——
   也就是"数据来了"的时候。它由 SSE（实时）和轮询（5 秒兜底）共同喂。

   ## 颜色**不参与**（用户 2026-09-16 明确要求）

   用户原话："颜色就纯随机 真随机 完全随机"。
   所以这一版**完全不碰 `setColor`** —— 自动换色照旧随机。
   心情只走**生命感**（呼吸/漂移的幅度 + 视线活力度）。见 face.ts 的 vitality。

   ## 三档

     stuck  有卡住的：stalledTasks>0 或 overdueEta>0    → vitality 1.15（像"警觉"）
     alive  有活在推进：liveClaims>0 或 liveTasks>0 或 lastWorkMin<=90 → 1.0（原样）
     quiet  全闲                                        → 0.85（像"打盹"）

   ⚠ 为什么不把"全闲"做得更夸张（比如 0.5）：
     球整天在角落待着，**大部分时间都是"全闲"**。做得太明显就变成
     "这个球永远半死不活" —— 那也是噪音。0.85 是"看得出来但不烦人"的量。
*/
type BotMood = 'alive' | 'stuck' | 'quiet'
const MOOD_VITALITY: Record<BotMood, number> = { alive: 1, stuck: 1.15, quiet: 0.85 }

let botMood: BotMood = 'alive'        /* 还没数据时按"正常"处理（别一上来就装睡） */
let moodAt = -999                     /* 上次心情**真的**变了的时刻（防抖用） */
/** 心情变化的防抖（秒）。为什么需要：库里的计数会**抖** ——
    一个会话写着检查点，`lastWorkMin` 会在 90 分钟边界上进进出出；
    不防抖的话球会每隔几秒闪一下，比不动还烦。 */
const MOOD_DEBOUNCE = 20

/** 按库里的数据算心情。只看**已经有的**字段（都是我核过的）。 */
function moodFromProjects(): BotMood {
  /* ⚠ 这里查过一个真 bug（2026-09-16，测试抓到的）：
     原来那个"还没数据就别装睡"的 guard 写的是
         if (stuck === 0 && alive === 0) return botMood
     —— 它判的是"**有没有信号**"。而"有一行数据、那行既没在干活也没卡住"
     也会命中它 → 于是 `quiet` 那一档**永远到不了**，整条 ② 的一半就废了。
     正确的判据是"**有没有数据**"：没数据 = 面板还没读到，按正常；
     有数据但没信号 = 真的全闲 → 该 quiet。 */
  if (ALL.length === 0) return botMood === 'stuck' ? 'alive' : botMood

  let stuck = 0, alive = 0
  for (const p of ALL) {
    stuck += (p.stalledTasks || 0) + (p.overdueEta || 0)
    if ((p.liveClaims || 0) > 0 || (p.liveTasks || 0) > 0) alive++
    else if ((p.lastWorkMin ?? -1) >= 0 && (p.lastWorkMin as number) <= 90) alive++
  }
  if (stuck > 0) return 'stuck'
  if (alive > 0) return 'alive'
  return 'quiet'
}

/**
 * 把心情喂给引擎。由 `applyProjects()` 调 —— 也就是"数据来了"的时候。
 *
 * ⚠ 防抖：除非是"转成有卡住的"（那是要人看的信号，不该等），
 *   否则两次变化之间至少隔 `MOOD_DEBOUNCE` 秒。
 */
function applyMood(now: number): void {
  const next = moodFromProjects()
  if (next === botMood) return
  const urgent = next === 'stuck'                  /* 卡住是要人看的，不等 */
  if (!urgent && now - moodAt < MOOD_DEBOUNCE) return
  botMood = next
  moodAt = now
  engine.setVitality(MOOD_VITALITY[next], now)
}

/* 测试用：把心情探出来 + 直接喂一个心情（不然只能靠造真数据）。 */
export const __botMoodProbe = () => ({ mood: botMood, at: moodAt, vitality: MOOD_VITALITY[botMood] })
export const __botApplyMood = (now: number) => applyMood(now)
/** 测试用：走**完整链路**（applyProjects → 心情）——
    只测 applyMood 是测不出"数据 → 心情"那一段的。 */
export const __botApplyProjects = (list: any[]) => applyProjects(list)

/* ==================================================================
   ③ 大动作：蹦 / 转圈 / 荡秋千（2026-09-16 加）
   ==================================================================

   ## 用户要的

   "比如上下蹦一蹦 没事干 然后转两个圈圈啥的 荡荡秋千啊这种"

   ## ★ 先说物理边界（这决定"大"能多大）

     窗口 560×660 · 球 54px · 钉在 right:22px / top:22px
     → **向右只有 22px、向上只有 22px** 就顶到窗口边，再往外被裁。
     （向下/向左各有 538px，但球在右上角，向下蹦会跑进面板区域。）

     SVG 是 55×55px 装 viewBox 316×316 单位 → **1 单位 ≈ 0.1741px**，
     所以 22px ≈ **126 个 SVG 单位 ≈ 0.40R**（R=158）。

   ⇒ **"蹦"靠「压扁 + 拉伸」骗眼睛，不靠大位移。**
     这是动画里的常规做法（squash & stretch），而且**正好绕开窗口限制**。

   ## 三个动作怎么实现的（都不改引擎）

     把整张画面包进 `<g id="perf">`（见 frameMarkup），每帧改它的 transform：
       蹦    : translate(0, -bounce)  +  scale(sx, sy)   ← 压扁拉伸 + 小位移
       转圈  : rotate(angle) 绕自己中心
       荡秋千: rotate(±35°) 绕**球上方一个支点**（transform 里的 rotate 带 cx,cy）

   ## 节奏（用户 2026-09-16 定）

     中动作 20 秒左右 · 大动作 40 秒左右
*/
type PerfSpec = {
  id: string
  hold: number                     /* 播多久（秒） */
  /** 归一化进度 t∈[0,1] → 这一帧的变换 */
  frame: (t: number) => { dx: number; dy: number; rot: number; cx: number; cy: number; sx: number; sy: number }
}
const IDENT = { dx: 0, dy: 0, rot: 0, cx: 0, cy: 0, sx: 1, sy: 1 }

/* 阻尼正弦（回弹）。n 个半周期，末端趋近 0 —— 蹦完自然落定。 */
function damped(t: number, cycles: number, decay: number): number {
  return Math.sin(t * Math.PI * 2 * cycles) * Math.exp(-t * decay)
}

const PERF: PerfSpec[] = [
  {
    /* ---- 蹦（2 下）----
       位移只用 0.26R（约 41 单位 ≈ 7px）—— 保守，因为向上只有 22px；
       主要靠压扁（落地 sx 1.20 / sy 0.78）和拉伸（起跳/stretch sy 1.10）骗眼睛。 */
    id: 'hop', hold: 1.9,
    frame: (t) => {
      const up = Math.max(0, damped(t, 2, 3.2))          /* 只取正的半周期 = 离地 */
      const land = Math.max(0, -damped(t, 2, 3.2))       /* 负的 = 落地压扁 */
      return {
        dx: 0,
        dy: -up * 41,
        rot: 0, cx: 0, cy: 0,
        sx: 1 + land * 0.20 - up * 0.06,
        sy: 1 - land * 0.22 + up * 0.10,
      }
    },
  },
  {
    /* ---- 转两个圈 ----
       绕自己中心转 720°。前 85% 转完，剩下 15% 让它停稳（easeOutQuint 的味道）。 */
    id: 'spin2', hold: 2.6,
    frame: (t) => {
      const k = t < 0.85 ? (1 - Math.pow(1 - t / 0.85, 3)) : 1
      return { ...IDENT, rot: 720 * k }
    },
  },
  {
    /* ---- 荡秋千 ----
       绕球**上方**一个支点摆 —— 支点取球顶再往上一点（球心上方 0.55R ≈ 87 单位）。
       摆幅 ±34°，用阻尼正弦（像真的荡了两下慢慢停下来）。
       ⚠ rotate 的 cx,cy 就是支点：这样球是"吊着"摆的，不是原地转。 */
    id: 'swing', hold: 3.0,
    frame: (t) => ({
      ...IDENT,
      rot: damped(t, 2, 1.6) * 34,
      cx: 0,
      cy: -(R * 0.55),
    }),
  },
]

let perf: { spec: PerfSpec; start: number } | null = null
/* 中动作 20 秒 / 大动作 40 秒（用户 2026-09-16 定）。两条线各有各的"上次播的时刻"。 */
let midLastAt = -1e9
let bigLastAt = -1e9
const MID_GAP = 20
const BIG_GAP = 40

/**
 * 该不该出一场表演；该出就挑一条 —— **欠账最多的那条优先**。
 *
 * ★ 这里改过三次，前两版都是自找的麻烦（记下来免得再犯）：
 *   第一版 `bigDue = now >= bigNextAt` → 大动作一旦过期就永远优先，把中动作挤死。
 *   第二版 改成"比谁到期更早" → 两个都过期时只推一条、另一条悬在过去，
 *          结果 **swing 连播 215 次**。
 *   第三版 想用"播完再重算"，但那句 `midWrap = midNextAt <= now` 在
 *          **动作播完之后**才求值，而那一刻 mid 早就在过去了 → 又错。
 *
 *   正解（这一版）：**不存"下次该在什么时候"，只存"上次是何时"** ——
 *   然后算 `欠账 = 现在 - 上次 - 间隔`，谁欠得多谁先上。
 *   没有边界相等的问题、没有旗标过期的问题，也不需要"顺手推另一条"。
 *   而且它天然是"两者交替、各按各的间隔走"。
 */
function dueGap(now: number): { playBig: boolean } | null {
  const midDue = now - midLastAt - MID_GAP
  const bigDue = now - bigLastAt - BIG_GAP
  if (midDue < 0 && bigDue < 0) return null
  return { playBig: bigDue >= midDue }
}

/**
 * 每帧调：推进表演 + 到点了就挑一个。
 *
 * ⚠ 闸门（和 autoplay 同一套口径 —— 不许另起一套）：
 *   · 用户在跟球互动 → 让位
 *   · 有动作在播（autoplay / 事件反应）→ 不抢
 *   · 入场动画还没落定 → 不抢（那一套自己就有 2.6 秒的戏）
 */
function tickPerform(now: number): void {
  if (perf) {
    const t = (now - perf.start) / perf.spec.hold
    if (t >= 1) perf = null               /* 播完就清空；"上次何时"在开演时就记了 */
    return
  }
  if (!ballEl.classList.contains('settled')) return      /* 入场还没结束 */
  if (autoPlistState) return                             /* 有动作在播，不抢 */
  const busy = (lookOverride !== null && lookOverride.mix > NEAR_MIX) || (now - lastMouseMoveAt < 1.5)
  if (busy) return
  if (now < visualHoldUntil) return
  const gap = dueGap(now)
  if (!gap) return
  const pool = gap.playBig ? ['hop', 'spin2'] : ['swing']
  const wanted = pool[Math.floor(Math.random() * pool.length)]
  /* ⚠ 这里原来写的是 `PERF.find(...)!` —— 那个 `!` 把"找不到"悄悄变成
     `undefined`，然后 `perf.spec.id` 在探针里炸（TypeError，排查了一轮）。
     **类型断言不是检查**。现在显式兜底：找不到就当作没到点、下次再来。 */
  const spec = PERF.find((p) => p.id === wanted) ?? null
  if (!spec) return
  perf = { spec, start: now }
  /* ★ 记"上次是何时" —— 用**开演时刻**，不是播完时刻。
     这样"间隔"的含义是"两次表演之间隔多久"，符合直觉。
     （也正因为如此，闸门被挡住时不记 —— 下次再试还是同样的欠账。） */
  if (gap.playBig) bigLastAt = now
  else midLastAt = now
}

/** 这一帧该给 `<g id="perf">` 的 transform。没在表演时是空串（零开销）。 */
function performTransform(now: number): string {
  if (!perf) return ''
  const t = (now - perf.start) / perf.spec.hold
  const f = perf.spec.frame(Math.max(0, Math.min(1, t)))
  const bits: string[] = []
  if (f.dx || f.dy) bits.push(`translate(${f.dx.toFixed(2)} ${f.dy.toFixed(2)})`)
  if (f.rot) bits.push(`rotate(${f.rot.toFixed(2)} ${f.cx.toFixed(2)} ${f.cy.toFixed(2)})`)
  if (f.sx !== 1 || f.sy !== 1) bits.push(`scale(${f.sx.toFixed(4)} ${f.sy.toFixed(4)})`)
  return bits.join(' ')
}

/* 测试钩子：表演层没法靠看内容断言（它是"画面上动了几度"），给个可读快照 */
export const __botPerfProbe = () => ({
  playing: perf && perf.spec ? perf.spec.id : null,
  hasSpec: !!(perf && perf.spec),          /* 诊断用：perf 有对象但 spec 丢了就是这个 */
  transform: performTransform(clock),
  midLastAt, bigLastAt, midGap: MID_GAP, bigGap: BIG_GAP, clock,
})
/** 导出规格表本身 —— 测试要独立验每个动作的**幅度**（见测试里的物理边界那条）。 */
export const __botPerfSpecs = () => PERF.map((p) => ({ id: p.id, hold: p.hold, frame: p.frame }))
export const __botPerfTick = (now: number) => tickPerform(now)

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
    /* 事件反应有它自己的时长（更短更轻）；autoplay 走 ACTION_HOLD。 */
    const hold = reactHold > 0 ? reactHold : (ACTION_HOLD[st] ?? 2.4)
    if (now - lastAutoStart >= hold) {
      setBotState('idle', now)
      autoPlistState = null
      reactHold = 0
      /* 被测试关掉时不重排 —— 否则那句 scheduleNextAuto 会把"关掉"撤销 */
      if (!autoplayOff) scheduleNextAuto(now)
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
  contract?: string      /* 合同：目标与验收标准 —— 活的要求（可随范围变化，见下面 loadTasks 的注释）*/
  ownerAlive?: boolean   /* 占用者心跳还新吗 —— 判断"在做"必须看它，不能只看有没有主 */
  ownerBeatMin?: number  /* 占用者最后一次心跳距今多少分钟（-1 = 没有心跳记录）*/
}
type Proj = {
  key: string; name: string; sub: string; tags: string[]; ago: string
  scope?: string         /* 库里的项目一句话定位（每个项目都有） */
  tasks: Task[]
  total: number; done: number; ready: number; doing: number; failed: number; review?: number
  kind: string; isTest: boolean; ctrl: string; root: string
  mapNodes: number; mapEdges: number; artifacts: number; sessions: number
  checkpoints?: number   /* 检查点数：库里唯一记录"过程"的量 —— 看一个任务里干了多少活 */
  liveClaims?: number    /* 心跳还新的认领数（后端 live_claims）—— 判断"在做"用这个 */
  staleClaims?: number   /* 有主但占用者早就不动了的数量 */
  liveSessions?: number  /* 心跳还新的会话数（2 小时窗口 —— 太宽，别单独拿它判"在做"） */
  workingSessions?: number /* **正自称 working 的会话数**（2026-09-15 加）—— 判"现在有人在"最硬的信号 */
  lastBeatMin?: number     /* 最新一次心跳距今多少分钟（-1 = 从没心跳过） */
  lastActivityMin?: number /* 活动信号（任务/检查点/产出）里最新的那个距今多少分钟 */
  lastWorkMin?: number     /* **真干活**的证据（检查点/产出）距今多少分钟 —— 判断"进行中"用这个 */
  liveTasks?: number       /* 活着的任务数（liveness 还在 = 有 worker 在） */
  stalledTasks?: number    /* **占着但没推进**的任务数（磨洋工/卡住 —— 双租约最有价值的一格） */
  overdueEta?: number      /* 逾期没交的任务数（会话声明过 ETA，现在过了 → 该问一句） */
  taskUpdatedAt?: string   /* 该项目下最新的任务更新时间：指纹要比它，否则改了任务说明却不重绘 */
  held?: number            /* 等前置的任务数（pending 但有未完成前置）*/
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
      /* 卡面上的"多久前"用活动信号（含任务更新）—— 它比"真干活"宽松一点，
         但对用户更有信息量（能看到"刚才有人动过这个项目"）。 */
      ago: activityText(
        typeof r.last_activity_min === 'number' && r.last_activity_min >= 0
          ? r.last_activity_min
          : (typeof r.last_work_min === 'number' && r.last_work_min >= 0
            ? r.last_work_min
            : Math.round((Date.now() - Date.parse(String(r.updated_at || '').trim().replace(' ', 'T'))) / 60000))
      ) || relTime(r.updated_at),
      /* ⚠ 这三个字段的"缓存标志"历史（2026-09-15 审计发现的第 3 个高危 bug）：
         原来写的是 `tasks: prev.fromDb ? prev.tasks : []` + `fromDb: false` ——
         于是**第 1 次轮询**能把明细带过去（那时 prev.fromDb 还是 true），
         **第 2 次轮询** prev.fromDb 已是 false → 明细被清成 []。
         而"深度核对"的门槛正是 `if (!p.fromDb || !p.tasks.length) continue`，
         结果它在项目列表视图下**跳过每一个项目**，还打印绿灯「一致（0 个项目）」——
         **一直在假装核对过**。
         修法：明细是有效缓存就带过来，并**保留** fromDb=true（它表示"这份明细来自数据库"，
         不是"这次是新拉的"）。 */
      tasks: (prev.get(r.project_key)?.fromDb ? prev.get(r.project_key)!.tasks : []),
      fromDb: prev.get(r.project_key)?.fromDb === true,
      total: r.total, done: r.done, ready: r.ready, doing: r.doing, failed: r.failed, review: num(r.review),
      kind: r.kind, isTest: isTestish(r.project_key, r.name || ''),
      ctrl: r.control_state, root: r.root_path,
      mapNodes: r.map_nodes, mapEdges: r.map_edges, artifacts: r.artifacts, sessions: r.sessions,
      checkpoints: num(r.checkpoints),
      liveClaims: num(r.live_claims),
      staleClaims: num(r.stale_claims),
      liveSessions: num(r.live_sessions),
      workingSessions: num(r.working_sessions),
      lastBeatMin: typeof r.last_beat_min === 'number' ? r.last_beat_min : -1,
      lastActivityMin: typeof r.last_activity_min === 'number' ? r.last_activity_min : -1,
      lastWorkMin: typeof r.last_work_min === 'number' ? r.last_work_min : -1,
      liveTasks: num(r.live_tasks),
      stalledTasks: num(r.stalled_tasks),
      overdueEta: num(r.overdue_eta),
      held: num(r.held),
      taskUpdatedAt: String(r.task_updated_at || ''),
    }))

  /* 归档项目：面板不显示，但要留一份名单 —— 同步报告里会如实说
     "另有 N 个已归档未显示"，免得用户以为东西丢了（2026-09-15 用户提的担心）。 */
  archivedProjects = list
    .filter((r) => r.control_state === 'archived')
    .map((r) => ({ key: r.project_key, name: r.name || r.project_key, total: num(r.total) }))

  /* 和上一次的数据对比，算出"变了什么" —— 同步报告要用。
     只在同步流程里收集（平时每 5 秒轮询也跑这里，不该刷屏）。 */
  if (collecting) {
    const now = Date.now()
    for (const r of items) {
      const before = prev.get(r.key)
      if (!before) { addedProjects.push(r.key); continue }
      const was = [before.total, before.done, before.ready, before.doing, before.review, before.failed].join('/')
      const is = [r.total, r.done, r.ready, r.doing, r.review, r.failed].join('/')
      if (was !== is) {
        changedProjectCount++
        const bits: string[] = []
        if (r.done !== before.done) bits.push(`完成 ${before.done}→${r.done}`)
        if (r.doing !== before.doing) bits.push(`在做 ${before.doing}→${r.doing}`)
        if (r.ready !== before.ready) bits.push(`待开始 ${before.ready}→${r.ready}`)
        if (r.review !== before.review) bits.push(`待验收 ${before.review}→${r.review}`)
        if (r.total !== before.total) bits.push(`任务数 ${before.total}→${r.total}`)
        if (bits.length) changedProjectDetail.push(`${r.name}：${bits.join('、')}`)
      }
      /* 说明/下一步改了但计数没变 —— 用 task_updated_at 判定（这批改动正是为了让它可见） */
      else if (r.taskUpdatedAt && before.taskUpdatedAt && r.taskUpdatedAt !== before.taskUpdatedAt) {
        changedProjectCount++
        changedProjectDetail.push(`${r.name}：任务内容有更新（${before.taskUpdatedAt.slice(11, 16)} → ${r.taskUpdatedAt.slice(11, 16)}）`)
      }
    }
    for (const k of prev.keys()) {
      if (!items.some((x) => x.key === k)) changedProjectCount++
    }
    lastLoadAt = now
  }

  const live = items.filter((r) => !r.isTest)
  const test = items.filter((r) => r.isTest)
  GROUPS = [
    { title: '代码项目', items: live.filter((r) => r.kind !== 'doc') },
    { title: '资料与方法', items: live.filter((r) => r.kind === 'doc') },
    { title: '测试与探针', folded: true, items: test },
  ].filter((g) => g.items.length > 0)
  rebuildAll()
  everLoaded = true
  /* ★ 心情（②，2026-09-16 加）：**在指纹短路之前**算。
     为什么位置重要：下面那句 `if (fp === lastFingerprint) return` 会在
     "数据没变"时提前返回 —— 而心情是**独立于重绘**的一件事
     （计数没变，但"有没有人在干"可能已经变了）。
     放在 return 之后的话，心情永远不会更新。 */
  applyMood(clock)

  /* 指纹要含**真正会变**的东西。
     原来只有计数和 ago（由 project.updated_at 推出来的相对时间），于是
     "只改了任务说明/状态、计数没变"的情况会被判定成没变化 → 不重绘（实测踩到过）。
     补上 project.updated_at 和该项目最新的 task.updated_at。 */
  const fp = JSON.stringify(items.map((r) => [
    r.key, r.total, r.done, r.ready, r.doing, r.failed, r.ago, r.taskUpdatedAt,
  ]))
  if (fp === lastFingerprint) return
  lastFingerprint = fp
  /* 按当前视图分发重绘 —— 不能无脑 renderProjects()（2026-09-15 修的 bug）。
     原来这里写死 renderProjects()，而它第一件事就是 listEl.innerHTML = …，
     会把用户正在看的**任务明细 DOM 直接盖掉，却不动 view**。
     而指纹里的 ago 是分钟级的 → 每分钟至少变一次，加上任何 SSE 事件，
     于是"点进去看任务，只要库里有人干活就被踢回项目列表"，
     而且 view 还停在 tasks（按 Esc 时行为与画面脱钩）。
     这是用户几乎每天都会遇到的，所以优先级高。 */
  if (!open) { renderStats(); return }
  if (view.kind === 'tasks') renderTasks(view.proj); else renderProjects()
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
      /* 库里**显式标了 blocked** 就是等待中 —— 不管有没有未完成的前置。
         （2026-09-15 统一口径：后端 failed 桶的判据就是 status IN ('blocked','failed','cancelled')，
         前端如果只在"有未完成前置"时才显示 blocked，两边就会对不上 ——
         实测 rural-1-39 的 deploy-frontend-three-ends 就是这样差 1 个。
         那个任务库里标 blocked 但没有未完成前置，说明卡在外部原因（等客户/等资质），
         statusLine 会如实说"库里标了 blocked"，不编"卡在谁"。） */
      : t.status === 'blocked' ? 'blocked'
      /* 有主 ≠ 在做（2026-09-15 用户报的 bug）。
         原来只看 owner 是否为空，于是 rural-1-39 里一个**23 小时前**被占住的 blocked 任务
         让整个项目显示「进行中」，而当天真正在干活的 kstage 显示「待开始」—— 完全反了。
         平台自己是用租约/心跳判断认领还有没有效的（reap_expired_leases），
         而且它只清 status='running' 且租约过期的，blocked+无租约的永远清不掉，
         所以面板必须自己看心跳：owner 还活着才算 doing，否则按 blocked/ready 算。 */
      : (t.ownerAlive && t.owner ? 'doing' : (t.unmet_deps > 0 ? 'blocked' : 'ready')),
      raw: t.status,
      pri: typeof t.priority === 'number' ? t.priority : 9,
      owner: t.owner ? String(t.owner).replace(/^session-/, '').slice(0, 12) : undefined,
      ownerAlive: t.owner_alive === true,
      ownerBeatMin: typeof t.owner_beat_min === 'number' ? t.owner_beat_min : -1,
      depends: t.dep_keys ? String(t.dep_keys).split(', ').filter(Boolean) : [],
      desc: String(t.description || '').trim(),
      nextAct: String(t.next_action || '').trim(),
      /* 合同（目标 / 验收标准）。为什么要它：
         任务的标题和说明是**创建时写死的 —— 平台没有任何工具能改**
         （project_task_update 只 SET status / next_action / lease / updated_at）。
         所以范围延伸之后"名字对不上"是常态，**合同才是这件事现在的定义**。
         面板以前完全没查 agent_task_contracts，等于把最该看的东西藏起来了。 */
      contract: String(t.contract || '').trim(),
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
/* 库里有过变更、但当时没在看那个项目的任务明细 → 把 key 记进这个集合，
   下次点进该项目时重新拉一次。
   原来这里是**一个全局布尔**，缺点：进 A 项目拉完就把它清掉了，
   于是 B 项目在面板关着期间发生的变更再也补不上（B 会一直显示内存里的旧明细）。
   2026-09-15 查出来，改成按项目记。 */
const dirtyProjects = new Set<string>()

/* ============ 同步报告用的一堆状态 ============
   用户要那个「点一下同步」的按钮，并且要能回答"库里有、面板有没有"这类疑问。
   所以同步时不只是重读一遍，还要把"变了什么 / 藏了什么 / 核对结果"如实报出来。 */
let archivedProjects: { key: string; name: string; total: number }[] = []
let collecting = false            /* 只在同步流程里收集 delta，平时轮询不收集 */
let addedProjects: string[] = []
let changedProjectCount = 0
let changedProjectDetail: string[] = []
let lastLoadAt = 0                /* 上次读完库的时刻（同步报告里报"数据是几秒前的"） */
/* 全部用 PostgreSQL 里的真值（不再猜） */
const num = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0)
const totalOf = (p: Proj) => num(p.total)
const doneOf = (p: Proj) => num(p.done)
const readyOf = (p: Proj) => num(p.ready)
const doingOf = (p: Proj) => num(p.doing)
const failedOf = (p: Proj) => num(p.failed)
const reviewOf = (p: Proj) => num(p.review)      /* 待验收：等别人验，不是等自己做 */
const heldOf = (p: Proj) => num(p.held)          /* 等前置：pending 但前置没做完 */
/** 前端状态映射里，"被卡住"那一组同时包含「等前置」和「库里标了 blocked」两类 ——
 *  核对的 blocked 数要把它们加起来，才和后端的 (held + stuck) 对得上。 */
const blockedOf = (p: Proj) => heldOf(p) + failedOf(p)

/* 「在做」的**可用**口径（2026-09-15 修 bug 引入）。
   后端的 doing 口径是"有主且未完成"，但它不看认领是否还有效 ——
   一个 23 小时前被占住的 blocked 任务也算在内，于是整个项目显示「进行中」。
   所以项目级判断优先用后端的 live_claims（心跳还新的认领数）；
   没拿到那个字段时（比如测试夹具），退化成"任务里 ownerAlive 的数量"。 */
const liveDoingOf = (p: Proj): number => {
  if (typeof p.liveClaims === 'number') return p.liveClaims
  return p.tasks.filter((t) => t.status === 'doing' && t.ownerAlive).length
}
/** 有主但没完成 = 在做；加上失败/取消的也算"没闲着" */
const inFlightOf = (p: Proj) => liveDoingOf(p) + failedOf(p)
const prog = (p: Proj) => ({ done: doneOf(p), total: totalOf(p) })

function taskLabel(t: Task): { cls: string; label: string; icon: string } {
  if (t.status === 'done') return { cls: 'b-done', label: '已完成', icon: 'i-done' }
  if (t.status === 'doing') return { cls: 'b-doing', label: '进行中', icon: 'i-doing' }
  /* 平台白名单里的 review（待验收）：等别人验，不是等自己做 —— 单独一档 */
  if (t.status === 'review') return { cls: 'b-ready', label: '待验收', icon: 'i-ready' }
  if (t.status === 'blocked') return { cls: 'b-idle', label: '等待中', icon: 'i-wait' }
  return { cls: 'b-ready', label: '待开始', icon: 'i-ready' }
}
export function projState(p: Proj): { cls: string; label: string; icon: string } {
  if (p.total === 0) return { cls: 'b-idle', label: '未拆解', icon: 'i-tasks' }
  if (p.done === p.total) return { cls: 'b-done', label: '已完成', icon: 'i-done' }
  /* 有人在这个项目里干活 —— 三层信号，缺一不可（2026-09-15 连续踩了两次才定下来）：
       ① liveClaims：有任务被"活着的手"认领（心跳 2 小时内的会话）
       ② review：有待验收的
       ③ liveSessions：有会话在近 1 小时里登记过/记过东西
     为什么要有 ③：kstage 出现过"会话 62 分钟前刚登记、61 分钟前写了检查点，
     但所有任务还是 done/pending"——只看任务状态会误判成「待开始」。
     任务状态是**结果**，会话活动是**过程**；项目在不在推进，看过程更准。 */
  /* ---- 判「进行中」的最终口径（2026-09-15 第二次修，为用户报的 kstage 误报）----

     用户报的现象：**kstage 显示「进行中」，点进去没有任何进行中的任务。**

     查出来的实情：那个会话 22:23~22:25 确实在干（发了 4 个产出 + 2 个检查点），
     **然后停了** —— status=idle、心跳停在 22:22、当前任务=None、working 会话 0 个。
     但面板只看到「45 分钟前有产出」→ 一路显示「进行中」。

     **根因：原来的判据只看「最近写过东西」，不看「现在还有没有人在」。**
     45 分钟前的产出是**历史**，不是**当下**。

     所以「进行中」现在要求**两个条件都成立**：
       ① **有人在做**（正在这个项目上干活的证据）
       ② **最近确实推进过**（进度新，或有人声明了还没到期的 ETA）

     ①「有人在做」的几种形态（任一成立即可）：
        · workingSessions > 0 —— 有会话正自称 working ★ 最硬，看的就是"现在"
        · liveTasks > 0   —— 有任务的租约还没过期（平台管的那个租约）
        · liveDoingOf > 0 —— 有任务被"活着的手"认领
        · liveClaims > 0  —— 同上，后端口径（老项目没有前三个字段时靠它）
        · liveSessions > 0 —— 有会话心跳还新（2 小时窗口；同样给老项目兜底）
        · lastBeatMin 在 15 分钟内 —— 刚发过心跳（会话还在，只是可能没占任务）

     ⚠ `lastBeatMin` 的窗口是 **15 分钟**，不是 90 —— 这是**测试抓出来的**：
       第一版我给 90 分钟，结果 kstage 又显示成「进行中」了
       （它的心跳停在 47 分钟前，落进 90 分钟窗口）。
       心跳窗口要**短**才有意义：它回答的是"这个会话刚还在吗"，
       15 分钟 ≈ 平台自己的租约时长（900 秒），两边口径一致。

     ②「最近推进过」的窗口：`PROGRESS_LIVE_MIN = 90`（见 isLive）。
        放宽到 90 是为了长任务（60 分钟太紧，用户遇到过大任务第 61 分钟被显示成「待开始」），
        但放宽必须配上条件①，否则"刚停下的项目"会被一直算成在做 —— 那正是 kstage 那个 bug。

     ⚠ 不把"占着但没推进"降级成「待开始」：有人占着就是在进行，只是可疑 ——
       降级会让这种事从面板上消失，而那正是最该被看见的。
       那种情况由 `stallNote()` 单独标注「占着没推进 / 逾期没交」。 */
  /* 「现在有人吗」的窗口：15 分钟。
     为什么是 15 而不是 90（测试抓出来的）：第一版给 90，结果 kstage 又显示成
     「进行中」—— 它的心跳停在 47 分钟前，落进 90 分钟窗口里。
     这个窗口回答的是"这个会话刚还在吗"，所以必须短；
     15 分钟 ≈ 平台自己的租约时长（900 秒），两边口径一致。 */
  const BEAT_LIVE_MIN = 15
  /* ⚠ `liveSessions`（2 小时窗口）**不能单独**证明"现在有人" —— 实测踩到：
     kstage 有会话在 54 分钟前发过心跳，落进 2 小时窗口，于是又误判成「进行中」。
     它只能当**老项目的兜底**（那些项目没有 workingSessions / lastBeatMin 字段），
     所以放在最后、且要求"最近真的推进过"（progressedRecently）才作数。 */
  const someoneHereNow = num(p.workingSessions) > 0
    || num(p.liveTasks) > 0
    || liveDoingOf(p) > 0
    || num(p.liveClaims) > 0
    || (typeof p.lastBeatMin === 'number' && p.lastBeatMin >= 0 && p.lastBeatMin <= BEAT_LIVE_MIN)
  const progressedRecently = isLive(p)
  /* 老项目兜底：没有新字段时，才允许用 liveSessions（宽窗口）+ 最近推进过 来判 */
  const legacyFallback = p.workingSessions === undefined && p.lastBeatMin === undefined
    && num(p.liveSessions) > 0 && progressedRecently
  const working = (someoneHereNow || legacyFallback) && progressedRecently
  if (working || reviewOf(p) > 0) {
    return { cls: 'b-doing', label: '进行中', icon: 'i-doing' }
  }
  if (readyOf(p) > 0) return { cls: 'b-ready', label: '待开始', icon: 'i-ready' }
  return { cls: 'b-idle', label: '等待中', icon: 'i-wait' }
}

/** 这个项目近 1 小时里有没有**人在真的干活**。
 *
 *  判据只用"有人真的干了活"的证据：检查点、产出（后端 last_work_min）。
 *  为什么不用别的（2026-09-15 连续踩到两次）：
 *    · agent_events —— 里面混着系统噪声（清理陈旧认领、自动同步、基线抓取、地图更新）。
 *      我手动清一个陈旧占位时写的那条 task_lease_expired，当场让 rural-1-39
 *      显示成"进行中"，用户立刻发现了。**我的清理动作制造了假信号。**
 *    · sessions.last_heartbeat —— 目前不是可靠信号：库里心跳类事件总数是 0，
 *      它只在登记会话时写一次，之后不再更新（要靠会话主动调 heartbeat）。
 *  阈值：见 PROGRESS_LIVE_MIN（2026-09-15 从 60 放到 90）。
 *  ⚠ 但**光靠这个判不出"进行中"** —— 它只看"最近写没写过东西"。
 *  kstage 那个误报就是它的锅：45 分钟前有产出、会话早停了，却一路显示「进行中」。
 *  所以 projState() 里它是**两个条件之一**，另一个是"现在有人"（workingSessions / lastBeatMin）。 */
const ACTIVITY_LIVE_MIN = 90
/* 「最近推进过」的窗口（分钟）。为什么是 90：
   60 分钟对"干一个长任务"太紧 —— 用户遇到过大任务第 61 分钟就被显示成「待开始」；
   但光放宽到 90 又会把"刚停下的项目"继续算成在做，
   所以放宽的同时**必须**配上"现在有没有人在"那个条件（见 projState）。 */
const PROGRESS_LIVE_MIN = 90
const isLive = (p: Proj): boolean => {
  if (typeof p.lastWorkMin === 'number' && p.lastWorkMin >= 0) {
    return p.lastWorkMin <= ACTIVITY_LIVE_MIN
  }
  /* 没有后端字段时（测试夹具）退化成"有任务的占用者还活着" */
  return p.tasks.some((t) => t.ownerAlive === true)
}

/** 可疑状态提示：有 worker 占着，但**没在推进**（双租约拆开后才看得见的东西）。
 *
 *  为什么要单独说：这两件事以前混在一个字段里，谁都看不出来 ——
 *    · 占着没推进（stalled）：会话还在（liveness 新），但一小时以上没写检查点/发产出
 *    · 逾期（overdue ETA）：会话声明过"我预计干到 X"，现在过了
 *  它们**不降级成"待开始"**（有人占着就是在进行），但必须看得见 ——
 *  不然"某个会话握着任务不干活"会从面板上完全消失，而那正是最该被发现的。
 */
function stallNote(p: Proj): string {
  const stalled = num(p.stalledTasks)
  const overdue = num(p.overdueEta)
  if (!stalled && !overdue) return ''
  const bits: string[] = []
  if (overdue) bits.push(`${overdue} 个逾期没交`)
  if (stalled) bits.push(`${stalled} 个占着没推进`)
  return `<span class="meta-warn" title="有人占着这些任务，但一小时以上没有检查点或产出。${overdue ? ' 其中一些是会话自己声明过 ETA、现在过了。' : ''}这不是失败，是"该问一句了"。">⚠ ${bits.join(' · ')}</span>`
}

/** 「多久前动过」说人话 —— 卡片副标题上用，回答"这算不算在干" */
function activityText(min?: number): string {
  if (min === undefined || min < 0) return ''
  if (min < 3) return '刚刚动过'
  if (min < 60) return `${min} 分钟前动过`
  const h = Math.floor(min / 60)
  if (h < 48) return `${h} 小时前动过`
  return `${Math.floor(h / 24)} 天前动过`
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
  /* 占用者早就不动了的提示（2026-09-15 加）。
     这类任务面板**不当成"在做"**（判据见 loadTasks 里 ownerAlive 那段），
     但也不能当没主 —— 得如实说"被谁占着、多久没动"，
     否则用户会以为这个任务没人管，而实际上是有人占着不放。 */
  const stale = t.owner && t.ownerAlive === false
  const staleNote = stale
    ? ` · 被 ${t.owner} 占着，${beatText(t.ownerBeatMin)}没动`
    : ''
  if (t.status === 'done') return `${base}${t.owner ? ` · ${t.owner}` : ''}`
  if (t.status === 'doing') return `${base}${t.owner ? ` · 已被 ${t.owner} 领走` : ''}`
  if (t.status === 'blocked') {
    if (unmet.length) return `${base} · 卡在 ${unmet.join('、')}${staleNote}`
    /* 库里标 blocked 但没有未完成的前置 —— 说明卡在别的地方（等客户、等资质等），
       不能编一个"卡在谁"，如实说"无未完成的前置"。
       注意措辞：这里返回的整串是**面板的结论**。要写「库里原始状态：blocked」而不是
       光写「库里标了 blocked」—— 后者和前面的"等待中"并排，读起来像两个状态
       （粘贴到聊天里更容易被误读），加了"原始状态"才明确"这是库里的值，不是第二个结论"。 */
    return `${base} · 库里原始状态：blocked${t.depends?.length ? `（前置 ${t.depends.join('、')} 都已完成）` : ''}${staleNote}`
  }
  /* ready：有前置就说明前置已就绪 */
  if (t.depends?.length) return `${base} · 前置已就绪${t.owner ? `，${stale ? `被 ${t.owner} 占着` : `已被 ${t.owner} 领走`}` : '，还没人领'}`
  if (stale) return `${base} · 还没人领（${t.owner} 占过但已 ${beatText(t.ownerBeatMin)}没动）`
  return `${base} · 还没人领`
}

/** 「多久没动」说人话：分钟 / 小时 / 天 */
function beatText(min?: number): string {
  if (min === undefined || min < 0) return '很久'
  if (min < 60) return `${min} 分钟`
  const h = Math.floor(min / 60)
  if (h < 48) return `${h} 小时`
  return `${Math.floor(h / 24)} 天`
}

export function projBlock(p: Proj, t?: Task): string {
  const info = projInfo(p)

  if (t) {
    const body: string[] = []
    /* 已完成的任务不能再说"继续做"（2026-09-15 修）。
       原来 done 的任务也走同一分支：抬头写"继续做"、还逼它读知识图谱、回写库里 ——
       新会话可能把一个已经收口的活重新开工。done 是"看交接"，不是"接着做"。 */
    const isDone = t.status === 'done'
    /* review 要单独说（2026-09-16 加）。
       原来只有 done / 非 done 两个分支 —— 于是 review（待验收）的任务
       抬头写的是「【继续做】」、还让它 project_task_dispatch。

       而 review 的含义正好相反：**活已经做完了，等别人来验**。
       让它"继续做"会误导接手的人重做一遍，或者把已完成的东西又改坏。
       实测确认：review 状态的任务走的就是非 done 分支，抬头是"继续做"。

       ⚠ 平台层面 reconcile **不要求**任务在 review 状态（只要求 reviewer ≠ owner）——
         所以 review 是给人和面板的**信号**，不是流程门槛。但正因为没有平台门槛，
         这里更要说清楚"看到 review 该去干什么"，否则没人知道该去对账。 */
    const isReview = t.status === 'review'
    body.push(isDone ? `【已完成 · ${p.name} / ${t.key}】`
      : isReview ? `【待验收 · ${p.name} / ${t.key}】`
      : `【继续做 · ${p.name} / ${t.key}】`)
    body.push(...info)
    body.push('')
    body.push(`任务：${t.title}`)
    body.push(`状态：${statusLine(p, t)}`)
    body.push(`依赖：${t.depends?.length ? t.depends.join('、') : '无'}`)
    /* 合同：目标 + 验收标准。**这是"这件事现在到底要求什么"的活定义**。
       为什么必须放进来（2026-09-15 用户提问引出的）：
       任务的标题和说明创建时就写死了，平台没有任何工具能改 ——
       所以当一个任务在执行中范围延伸之后，"名字对不上内容"是常态。
       不看合同，接手的人会以为任务名就是全部要求。 */
    if (t.contract) {
      const c = parseContract(t.contract)
      if (c.goal || c.acceptance.length) {
        body.push('')
        body.push('合同（这件事现在的要求 —— 任务名字只是标签，范围以这里为准）：')
        if (c.goal) body.push(`  目标：${c.goal}`)
        if (c.acceptance.length) {
          body.push('  验收标准：')
          for (const a of c.acceptance) body.push(`    · ${a}`)
        }
        if (c.constraints.length) {
          body.push('  约束：')
          for (const x of c.constraints) body.push(`    · ${x}`)
        }
      }
    }
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
      /* 那个任务的接续说明里可能夹着**历史注释**（原来的会话写的现场记录，含它当时的
         变通办法）。那是别人踩坑的真实第一手信息，不能删；但它反映的是**当时**的库，
         工具和行为后来可能已经变了 —— 实测有一张卡里写着"库里没有退回待领取的接口，
         可以直接 update(status=running) 接手"，而那句话现在既过时又行不通。
         所以：原文照留，但明确标注它的性质，让接手的会话知道该去核对而不是照抄。 */
      body.push('')
      body.push('⚠ 上面的「接续说明」是**当时那个会话写下的现场记录**，可能夹着它当时的变通办法。')
      body.push('  那些办法反映的是**当时的库**，工具和行为后来变过 —— 照抄前先用 project_overview 核一遍，')
      body.push('  或者直接问用户；不要因为一句话就绕过现在的前置/权限规则。')
      const dangling = danglingDeps(p, t)
      if (dangling.length) {
        body.push(`另外：前置「${dangling.join('、')}」在当前库里查不到（可能已删/改名/属于别的项目）—— 先问清楚，别猜。`)
      }
    }

    if (isDone) {
      /* 已收口：只讲怎么接手看，不让它重做 */
      body.push('')
      body.push('这个任务已经标记完成了。如果你是想**了解它做了什么**，读上面这些就够了；')
      body.push('如果你觉得还得继续做，**先用这条路把它退回队列**（别直接改状态 —— 终态不能直接改）：')
      body.push(`  project_task_reopen(task_id=<下面那个 id>, session_id=<你的 id>, reason="<为什么要重开>")`)
      body.push('  它把任务退回 pending 并留 task_reopened 事件（reason 必填，平台不留悄悄改终态的口子）；')
      body.push('  之后就能正常走：领 → 补检查点 → 再标 done。')
      /* ★ 重开有上限（2026-09-16 加）：同一张卡重开到第 3 次会自动变 blocked。
         为什么必须在这里说：这个块是"要接着做"时读的，而它只教了 reopen ——
         不说上限的话，会话重开到第三次会莫名看到任务变成 blocked，以为出错。
         真实含义是"这活干不下去（范围没定清/缺外部依赖/判据有问题），该人来定"。 */
      body.push('  ⚠ **但有上限**：同一张卡重开到第 3 次，平台会自动把它标成 `blocked`')
      body.push('     （反复重开 = 这活干不下去，不是在"再试一遍"）。看到它变 blocked，')
      body.push('     不是失败 —— 是"该人来定怎么走了"，去问用户，别再重开第四遍。')
      /* 这里原来写的是 project_task_dispatch —— **实测拿不到**：
         dispatch 回的是 task:null + reason:already done（claim 有状态白名单）。
         已 done 的任务只能从 overview 里找，不能再走派发。 */
      body.push(`想拿完整上下文：project_overview(project="${p.key}") 看它这一项`)
      body.push('  （已 done 的任务不能再 dispatch —— 会回 already done）；也可以直接读它历史上的检查点。')
      /* 补一句"标了 done 也能补写代码地图"（2026-09-16 补）。
         为什么：代码地图的门禁是"你在本项目里干过"（拥有任务 / 近 7 天有检查点），
         **不看任务是不是 done** —— 但这里没写，会话会以为"做完了就不能补地图了"，
         于是架构图一直缺一块。这个口径在 discipline() 里提过，但那段在 isDone 分支里
         **走不到**（本分支提前 return 了），所以必须单独写。 */
      body.push('另外：**代码地图标了 done 也能补写** —— 门禁看的是"你在本项目里干过"')
      body.push('  （拥有任务 / 近 7 天有检查点），不看任务是否已完成。发现上面那张图缺了就补。')
      return body.join('\n')
    }

    /* ---- 待验收：不是让你继续做，是让你找人对账（2026-09-16 加）----
       为什么单独一个分支：原来它和非 done 的任务走同一条路 ——
       抬头写「继续做」、还让你 project_task_dispatch。而 review 的含义正相反：
       **活做完了，等别人验**。照原来那样做，接手的人会重做一遍、或把做好的改坏。

       平台层面 reconcile **不要求**任务在 review（只要求 reviewer ≠ owner）——
       所以 review 是给人和面板的信号，不是流程门槛。正因为平台不管，
       这里更要说清"看到 review 该去干什么"，否则没人知道该去对账。 */
    if (isReview) {
      body.push('')
      body.push('这个任务已经做完了，**正在等验收** —— 别继续做、也别重做。')
      body.push('要做的是**找另一个会话来对账**（对账人不能是任务所有者）：')
      body.push('  project_reconcile(project=…, task_id=<下面那个 id>, status="verified",')
      body.push('                    reviewer_session_id=<另一个会话的 id>, summary="对账结论")')
      body.push('  · 对账时平台会**自动跑合同里的可判定判据**，结果作为证据留档 ——')
      body.push('    所以判据写得好不好，直接决定对账是不是"读一遍说通过"。')
      body.push('  · 要是发现没做完 → status="rejected"，而且**必须写清 location / defect / fix**')
      body.push('    （只写 rejected 不写细节，下一个会话除了"没过"什么都得不到）。')
      body.push('  · 对账完把任务状态按结果改：过了 → 留 review 等人确认收口；没过 → 退回 pending 返工。')
      body.push('⚠ 你自己不能验自己（会报 "The task owner cannot verify its own task"）——')
      body.push('  如果现在只有你一个会话，就把这条**报告给用户**，请另开一个会话。')
      return body.join('\n')
    }

    body.push('')
    /* ⚠ 2026-09-16 大改：这段原来把"从领活到收尾"的完整流程抄了一遍（约 1900 字），
       而那份流程现在在 docs\接手任务.md 里。块只留**这一刻特有**的：
       这个任务自己的 id 怎么拿 + 指路。
       （合同 / 检查点 / 依赖 / 状态 那些块特有数据在上面，不动。） */
    body.push('')
    body.push('★ 怎么做这件事（领活 → 读上下文 → 收尾）在这份说明里：')
    body.push('     D:\\codex-memory\\docs\\接手任务.md')
    body.push('')
    body.push(`  先做的事：project_task_dispatch(project="${p.key}", task_key="${t.key}")`)
    body.push('     ⚠ 它返回的 **id（32 位 uuid）才是后面所有工具要的 task_id** —— 不是上面那个 key。')
    body.push('     后面接 project_context_pack(project=…, task_id=<那个 id>) 读上下文。')
    body.push('')
    body.push('  ⚠ 两条最容易踩的（细节在文档里）：')
    body.push('     · ★ **没做完的绝对不要标 done**（平台会按判据拦，改了要 project_task_reopen）。')
    body.push('     · 收尾顺序别换：检查点五项 → 发产出 → preflight 验判据 → 标 done。')

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
  const group = (title: string, list: Task[]) => {
    if (!list.length) return
    body.push(`${title}：`)
    for (const x of list) {
      const dep = x.depends?.length ? `（等 ${x.depends.join('、')}）` : ''
      const who = x.owner ? `（${x.owner}）` : ''
      body.push(`  · ${x.key} —— ${x.title}${dep}${who}`)
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
    }
    if (doneAll.length > DONE_SHOW) {
      body.push(`  （另有 ${doneAll.length - DONE_SHOW} 个已完成没列出来，需要时用 project_overview 查）`)
    }
  }
  /* 兜底：库里可能有面板分组之外的状态（比如 failed / cancelled 被归进「没闲着」）。
     列不出来就明确说一句，别让数字和明细对不上。

     ⚠ 这里**不能**用 `!shown.includes(x.key)` 当排除条件（2026-09-15 修的 bug）。
     shown 里只有"实际列出来的"条目 —— 而「已完成」刻意只列最近 5 条，
     于是剩下的 done 任务会掉进这个桶，输出成
       「其他状态 15 个：task-12（done）、task-13（done）…」
     明明上面的抬头就写着「已完成」，却把它们叫"其他状态"。
     **任务越多越明显**（一个会话干出很多任务、都沉淀进库之后正是这个场景）。
     正确做法：排除**全部已分组的状态**，而不是"已显示的条目"。 */
  const known = new Set(['ready', 'doing', 'review', 'blocked', 'done'])
  const rest = p.tasks.filter((x) => !known.has(x.status))
  if (rest.length) {
    body.push(`其他状态 ${rest.length} 个：${rest.map((x) => `${x.key}（${x.status}）`).join('、')}`)
  }
  body.push('')
  /* ⚠ 2026-09-16 大改：这段的通用流程（怎么看现状 / 怎么领活 / 怎么写判据）
     现在在 docs\接手任务.md 里。块只留**这一刻特有**的：这是本项目的待办清单 + 指路。 */
  body.push('')
  body.push('★ 这个项目现在什么情况、该怎么往下做 —— 见这份说明：')
  body.push('     D:\\codex-memory\\docs\\接手任务.md')
  body.push(`  一句话：project_overview(project="${p.key}") 看全貌，`)
  body.push(`         project_ready_tasks(project="${p.key}") 看有哪些活，`)
  body.push(`         然后 project_task_dispatch(project="${p.key}", task_key="<挑中的>") 领走。`)
  body.push('  上面每个任务卡也能单独复制「接续块」—— 里面带着那个任务的合同与交接说明。')

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
     而且代码地图写入原来要求"手里有 running/review 任务"（2026-09-15 已放宽为「在本项目里干过」）。
   · 产出归属：artifact_publish 硬门禁要求"任务在自己名下"，没领过就发不出。
   · "只写检查点面板不会变"是错的：checkpoint 带 next_action 时会一并
     UPDATE agent_tasks.next_action + updated_at，而 next_action 就是面板显示的"下一步"。
   · DSH 侧的桥原来没暴露 project_task_create / project_plan_review（2026-09-15 已补进白名单），
     所以"建任务"这条路对 DSH 会话来说只有 propose → 别人审批。
   · project_context_pack 的 task_id 是**必填位置参数**，只传 project 直接 TypeError。
   ============================================================ */

function repoLine(p: Proj): string[] {
  const root = (p.root || '').trim()
  return root ? [`仓库：${root}`] : ['仓库：库里没登记这个项目的代码目录（先用 project_for_path 确认工作目录）']
}

/** 解析合同（存的是 jsonb，取出来是 JSON 字符串）。
 *  字段名是平台定的：goal / acceptance / constraints / note / blocked_by …
 *  解析失败就返回空 —— 宁可少显示，也不要让复制块变成一团乱码。 */
function parseContract(raw: string): { goal: string; acceptance: string[]; constraints: string[] } {
  const empty = { goal: '', acceptance: [] as string[], constraints: [] as string[] }
  try {
    const o = JSON.parse(raw)
    if (!o || typeof o !== 'object') return empty
    const asList = (v: any): string[] => {
      if (v === null || v === undefined) return []
      if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean)
      const s = String(v).trim()
      return s ? [s] : []
    }
    return {
      goal: String(o.goal || o.objective || '').trim(),
      acceptance: asList(o.acceptance),
      constraints: asList(o.constraints),
    }
  } catch {
    return empty
  }
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
/* 判据引导 —— 一个公共片段，被 discipline() 和 splitBlock() 共用。
   ⚠ 为什么要提取（2026-09-16）：这两个地方原来各写了一份完整的判据引导，
   于是**同一个块复制出去，同一件事说了两遍**（实测 7 个事实重复、约 700 字）。
   提取成一份之后：每块里只出现一次，而且两处**内容永远一致**（不会漂移）。 */
function predicateGuide(indent = '      '): string[] {
  return [
    'file_exists:<路径> / no_placeholders:<路径> / grep_absent:<路径>::<文本> /',
    'sha256:<路径>::<摘要> / tests_pass:<命令> / endpoint_ok:<URL>',
    '要点：把**具体路径 / 具体命令 / 具体 URL** 写出来 ——',
    '  "测试全部通过"没用（不知道跑什么）→ "测试 npm test 全部通过"才行；',
    '  "结论回写文档"没用 → "结论回写 docs/xxx.md"才行。',
    '⚠ **别指望事后自动转换**：实测全库 176 条验收标准自动提判据只提出 9 条（5%），',
    '  且全是"提到了某个具体文件"那类 —— "功能可用"这种话里本来就没有可判定的东西。',
    '  判据只能**写合同的时候顺手写**；拿不准能不能判就跑一下 preflight，它会告诉你。',
  ].map((l) => indent + l)
}



/* 收尾纪律。三条都是实战里踩出来的：报错要照贴、格式不合法要降级、完成由对账说了算。 */
function discipline(): string[] {
  /* ⚠ 2026-09-16 大改：原来这里返回 1800 字的干活纪律，被 5 个块各内联一份
     （实测合计 9058 字重复）。现在抽成独立文档，这里只留**一行指路**。

     为什么这么改（而不是各块各留一份）：
       · 那份纪律讲的是"干活和收尾"，而好几种块（比如「开始一个新东西」）
         那一刻连任务都还没有 —— 对它是废话；
       · 改一条纪律要改 5 个地方（今晚已经吃过这个苦）；
       · "会话会去读文档"这个前提**已经成立** —— 新版块本来就要靠文档才知道怎么建项目。

     风险与对价：会话不读文档就学不到纪律。所以那条最要命的
     （★ 没做完的任务绝对不要标 done）我在文档里放了**开头第一节**，
     而且开头就点明它是最重的一条。 */
  return [
    '',
    '  ⚠ 干活和收尾的纪律（★ 不许标假 done / 检查点五项 / 中断前冻现场 / 记设计决策…）：',
    '     见 D:\\codex-memory\\docs\\干活纪律.md —— **动手之前先读它**。',
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
  /* 首行也要带 2 空格 —— 它是「执行要求：」编号列表的一项，
     否则会出现 1)、2) 顶到最左、3) 缩进 2 格的错位（粘到聊天里一眼就是坏的）。 */
  const head =
    '  ' + num + ') 读知识图谱（代码地图）—— 弄清模块划分、各自职责、代码在哪个文件、模块之间怎么调。'
  /* 节点字段说明只写一份（两个分支原来各抄了一遍，重复 600+ 字）。
     这些都是**实测出来会卡人的点**，一条都不能省。 */
  const fields = [
    '     ⚠ 节点字段（实测过，照这个写不会卡）：',
    '       · **kind 是固定枚举，写错直接报错**：frontend | backend | database | cloud | security | messagebus | external',
    '         （写 kind="module" 会被拒：must be one of: backend, cloud, database, …）',
    '       · status 也是枚举（默认 planned）：planned | wip | done | broken | retired',
    '       · 最小形态（node_key + kind + label 是必填，其余可省）：',
    '         nodes=[{node_key:"core", kind:"backend", label:"核心", responsibility:"干什么", paths:["src/xxx.py"]}]',
    '         edges=[{from_key:"core", to_key:"store", label:"调用"}]',
    '       · paths 传字符串数组即可；node_key 只能字母开头 + 字母数字-_',
  ]

  if (nodes > 0) {
    return [
      head,
      `     已记录 ${nodes} 个模块 / ${edges} 条调用关系；context_pack 里就带着，`,
      `     也可以单独 project_code_map(project="${p.key}") 取完整版。动手前先看它，别重读全仓库。`,
      `     改了代码的形状就用 project_code_map_write 更新回去，**记得带 revision**（7 位以上 git 短 SHA），`,
      `     不传的话下个会话看到的会是 unversioned（会打 WARNING）；replace=True 会被拒，只能合并。`,
      ...fields,
    ]
  }
  return [
    head,
    '     但这个项目现在**还没有**代码地图（0 个模块）—— 读不到东西。',
    '     所以顺手做一件事：读一遍代码后用 project_code_map_write 把地图建起来，',
    '     下个会话才不用重读全仓库（**记得带 revision** = 7 位以上 git 短 SHA）。',
    ...fields,
  ]
}

export function splitBlock(p: Proj): string {
  const body: string[] = []
  const hasTasks = p.total > 0
  body.push(`【给 ${p.name} 加任务】`)
  body.push(...projInfo(p))
  body.push('')
  /* ⚠ 2026-09-16 大改：原来这块把"怎么建卡"的完整流程抄了一遍（约 5900 字），
     而那份流程现在在 docs\加新任务.md 里。块只留**这一刻特有**的：
     这个项目现在什么情况（几个任务）+ 指路。 */
  body.push(hasTasks
    ? `这个项目现在有 ${p.total} 个任务（已完成 ${p.done}）。你要往里**加新任务**。`
    : '这个项目一个任务都还没有。你要把它**拆成任务**。')
  body.push('')
  body.push('★ 做法在这份说明里（含"先判断该不该建卡""计划锁着怎么走提案"等完整步骤）：')
  body.push('     D:\\codex-memory\\docs\\加新任务.md')
  body.push('')
  body.push('  ⚠ 几个容易踩的先提醒（细节在文档里）：')
  body.push('     · ★ **先判断这块活该不该建卡** —— 还在已有任务合同范围内的，别建新卡。')
  body.push('     · ★ **先确认计划锁没锁**：没锁直接 project_task_create；')
  body.push('       锁着只能 project_plan_propose 提案，且**要另一个会话来批**（不能自批）。')
  body.push('     · 建卡时把**验收标准写成判据**（file_exists: / tests_pass: … 写具体路径/命令）。')
  body.push('     · 建完之后：**没做完的卡绝对不要标 done**。')
  body.push('')
  body.push('  想拆得跟用户对齐再落卡：先把方案给他看，他确认了再建。')
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
  const ckN = p.checkpoints || 0
  /* 显示形态：图标 + 数字，不写文字。第一版写成"· 2 个产出 · 图谱 44 节点"，
     太长，把计数行挤换行、卡片被撑高（用户截图反馈）。完整说法放进 title。 */
  const extraBits: string[] = []
  if (artN > 0) extraBits.push(`<span class="meta-extra" title="${artN} 个产出（会话发布过的交付物）"><svg class="ic"><use href="#i-artifact"/></svg>${artN}</span>`)
  /* 检查点数 = "过程"的量。为什么要显示（2026-09-15 用户提问引出的）：
     一个任务里可以干很多轮活（ui-finalize-pages 就有 12 个检查点），
     光看任务状态是 0/1 或 1/1，完全看不出里面做了多少。
     加了它，"一个任务里干了多少活"才看得见 —— 也就不用为每一轮去建重复的任务卡。 */
  if (ckN > 0) extraBits.push(`<span class="meta-extra" title="${ckN} 条检查点（会话记录的过程：做了什么 / 坑 / 下一步）"><svg class="ic"><use href="#i-log"/></svg>${ckN}</span>`)
  if (mapN > 0) extraBits.push(`<span class="meta-extra" title="代码地图 ${mapN} 节点 / ${p.mapEdges || 0} 条调用关系"><svg class="ic"><use href="#i-graph"/></svg>${mapN}</span>`)
  const extraRow = extraBits.length ? `<div class="mr">${extraBits.join('')}</div>` : ''
  const meta = total === 0
    ? `<div class="mr"><span>未拆解 · 先用「拆任务」把它拆开</span></div>${extraRow}`
    : single
      ? `<div class="mr"><span class="meta-ready">${t0 ? taskLabel(t0).label : ''}</span><span>${p.ago}</span></div>${stallNote(p)}${extraRow}`
      : `<div class="mr"><span class="cells" title="${total} 个任务（已完成 ${done} / 进行中 ${inFlightOf(p)} / 待验收 ${reviewOf(p)} / 待开始 ${readyN}）">${
          Array(done).fill('<i class="c done"></i>').join('') +
          Array(inFlightOf(p)).fill('<i class="c doing"></i>').join('') +
          Array(readyN).fill('<i class="c ready"></i>').join('')
        }</span><span>${done}/${total}</span>${readyN ? `<span class="meta-ready">${readyN} 待开始</span>` : ''}<span>${p.ago}</span></div>${stallNote(p)}${extraRow}`

  /* 卡片上的按钮（2026-09-15 由横排改成竖排）：
     用户截图反馈「复制现状简报」压住了右边的「13 待开始」和时间 ——
     窄卡片横排放不下两个带字的按钮，竖排放得下、两个功能都保住。 */
  const acts = empty
    ? ''
    : `<div class="card-acts">` +
      (!single ? `<button class="card-copy always" data-copy-proj="${p.key}"><svg class="ic"><use href="#i-copy"/></svg>复制现状简报</button>` : '') +
      `<button class="card-copy always" data-export-proj="${p.key}" title="导出进度报告（PDF）"><svg class="ic"><use href="#i-download"/></svg>导出</button>` +
      `</div>`

  return `
  <div class="card" data-proj="${p.key}">
    <div class="card-body">
      <div class="card-top"><span class="card-name">${p.name}</span><span class="badge ${st.cls}"><svg class="ic"><use href="#${st.icon}"/></svg>${st.label}</span></div>
      ${p.sub ? `<div class="card-sub">${p.sub}${total > 1 ? ` · ${total} 个任务` : ''}</div>` : (total > 1 ? `<div class="card-sub">${total} 个任务</div>` : '')}
      <div class="card-meta">${meta}</div>
      ${p.tags.length ? `<div class="tags">${p.tags.map((x) => `<span class="tag">${x}</span>`).join('')}</div>` : ''}
    </div>

    ${acts}
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
         <div class="empty-t">这个项目还没有任务</div>
         <div class="empty-d">让 AI 读一遍上下文，把它规划成几个任务写进共享库</div>
         <button class="btn btn-primary" data-split-proj="${p.key}"><svg class="ic"><use href="#i-split"/></svg>让 AI 拆任务</button>
       </div>`
    : list.length
      /* ★ 「加新任务」按钮（2026-09-16 加）—— 放在任务列表下面。
         原来 `data-split-proj` **只在 total === 0 时渲染**，
         而 project_bootstrap 要求至少一个任务、project_create 又不在 DSH 白名单，
         于是这个按钮**在有任务的项目上永远看不到**（实测已成死代码）。
         而"给已有项目加新任务"正是最常用的需求，所以这里也渲染一个，
         共用同一个 copySplit 处理器（看 data-split-proj 找它）。 */
      ? `<div class="tlist">${
          segments.map((seg) =>
            `<div class="tgroup"><span class="tgroup-t">${TASK_GROUP_TITLE[seg.status]}</span>` +
            `<span class="tgroup-n">${seg.items.length}</span></div>` +
            seg.items.map((t) => taskCard(p, t, list.indexOf(t))).join('')
          ).join('')
        }</div>
        <div class="tadd"><button class="btn btn-ghost btn-addtask" data-split-proj="${p.key}"><svg class="ic"><use href="#i-plus"/></svg>让 AI 加新任务</button></div>`
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
     所以维护一个 dirty 集合：库里变更过、当时又没在看明细的项目，点进来就重拉。 */
  if ((!p.tasks.length || dirtyProjects.has(key)) && p.total > 0) {
    p.tasks = []
    p.fromDb = false
    dirtyProjects.delete(key)
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
  const expP = t.closest('[data-export-proj]') as HTMLElement | null
  if (expP) {
    /* 导出是异步且要跑几秒（拉检查点 + Edge 打 PDF），所以这里不能 await 完再返回
       —— 会让整个点击处理卡住，用户以为没反应。fire-and-forget，进度用按钮转圈表示。 */
    void exportProjectPdf((expP as HTMLElement).dataset.exportProj!, expP)
    return
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
export const LIBRARY_RECORD_REQUIREMENT = [
  `【记录进共享库】`,
  ``,
  `  你干完活了，要把结果写回库。**做法在这份说明里**（完整步骤，照它做就行）：`,
  `     D:\\codex-memory\\docs\\记录进库.md`,
  ``,
  `  ⚠ 三件最要紧的先说（全文在文档里）：`,
  `     1. ★ **没做完的任务，绝对不要标 done。** 标了 done，面板会说这件事完了、`,
  `        下个会话以为不用再管、对账时拿不到东西；而且平台禁止 done 直接改回 running，`,
  `        要改回来只能走 project_task_reopen(task_id=<id>, session_id=<你>, reason=…)`,
  `     2. **本会话做过不止一个任务的话，每轮都要记** —— 检查点必须挂在具体任务上，`,
  `        做了 N 个就记 N 次，不能只记最后一轮。`,
  `     3. **发现了但没做的活，必须写进检查点的 not_done** —— 那是它传给下个会话的`,
  `        唯一通道（面板不显示检查点，不写就等于丢了）。`,
  ``,
  `  收尾顺序（写反了会把自己锁死）：检查点五项 → 发产出 → preflight 验判据 → 标 done。`,
  `  通用纪律（含"标错了怎么改回来"）见 D:\\codex-memory\\docs\\干活纪律.md。`,
].join('\n')

/* ============ 开一个新项目（右上角按钮复制的就是它）============
 *
 * 为什么必须有这一块（2026-09-16 加）：
 * 面板上原有的四个复制块**全是"项目卡上的按钮"** —— 而新项目在面板上
 * 还没有卡，一个都点不到。于是"从零建一个项目"这件事**没有任何地方说过**。
 * 放在右上角这一排（不挂项目卡）正是因为：它不属于任何已有项目。
 *
 * 内容全部来自实测（建了 6 个探针项目，全部清理）：
 *   · bootstrap 的必填字段：缺一个就报错，报错会说明缺哪个
 *   · ★ tasks 是**必填**：tasks=[] 和不传都报
 *       "project_bootstrap requires at least one planned task"
 *   · ★ 建出来就是**锁着**的（plan_locked=True），之后 project_task_create 被拒
 *   · ★ 批准**一次**提案就**永久解锁**（代码 L896；实测批准后 plan_locked=False）
 *   · 提案的审批者必须**属于同一个项目**，且**不能是提议者本人**
 *   · 不给 contract 会**自动生成**一条模糊的验收标准
 *       {"objective": 标题, "acceptance": ["完成可验证交付物并留下检查点"]}
 *       —— 等于没有判据，平台就拦不住假 done
 */
export const NEW_PROJECT_START = [
  `【开始一个新东西】`,
  ``,
  `  你被打开在**一个还不存在的东西**上 —— 可能什么都没有：`,
  `  没有目录、没有代码、没有任务，用户手上也许只有一个想法或一份文档。**这都正常。**`,
  ``,
  `★ 0) 先读这份说明（它是专门为这个场景写的，读完你就知道怎么做）：`,
  `     D:\\codex-memory\\docs\\怎么开新项目.md`,
  `     里面讲了：这个库是什么 / 用户可能让你做什么 / 从零建项目的完整步骤 /`,
  `     建完该做哪三件事 / 什么时候**不该**建任何东西 / 几条边界。`,
  `     （更通用的机制在 D:\\codex-memory\\README.md 的「一、给 AI 会话看的」。）`,
  ``,
  `★ 1) ★★ **然后问用户要干什么 —— 别自己挑一个就开始做。**`,
  `     用户可能说：只是聊聊 / 分析一下 / 把这事拆成任务 / 从零做 XX / 看看库里有什么。`,
  `     每一种该怎么做，那份说明里都有对应的一节。`,
  `     · 谈需求走 \`grill-me\` skill（每次只问 1~2 个，问完复述确认）。`,
  `     · 要"拆任务"类：**先拆好给用户看，他确认了才落卡**。`,
  `     · 用户只说"聊聊"：那就纯讨论，**不落库、不建任何东西**。`,
  ``,
  `  ⚠ 讨论阶段**没有任何记录**（会话一断全丢）→ 谈清楚就尽快落库，别聊到天荒地老。`,
  ...discipline(),
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

/* ============ 右上角「开新项目」按钮 ============
 *
 * 和 reqBtn 一模一样的交互（按压果冻 + 成功变绿打勾 + 粒子绽放），
 * 因为对用户来说这两个按钮是同一类动作：**复制一段说明给会话**。
 * 不抽公共函数是因为 reqBtn 那边已经稳定跑通、且它俩是仅有的两处；
 * 抽出来反而要动已经测过的代码 —— 当前更划算的是**照抄一份**。
 */
const newProjBtn = document.getElementById('newProjBtn') as HTMLButtonElement | null
if (newProjBtn) {
  newProjBtn.addEventListener('pointerdown', () => {
    newProjBtn.classList.remove('press')
    void newProjBtn.offsetWidth
    newProjBtn.classList.add('press')
    setTimeout(() => newProjBtn.classList.remove('press'), 340)
  })
  newProjBtn.addEventListener('click', async () => {
    await copyText(NEW_PROJECT_START, '开始一个新东西')
    if (newProjBtn.classList.contains('done')) return
    const old = newProjBtn.innerHTML
    newProjBtn.classList.add('done')
    newProjBtn.innerHTML = '<svg class="tick" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    setBotState('burst', clock)
    setTimeout(() => { newProjBtn.classList.remove('done'); newProjBtn.innerHTML = old }, 1500)
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
let sseLastOkAt = 0        /* 上次成功挂上事件通道的时刻，Date.now()（0 = 从没成功过） */

/* 事件通道的启动与重试。
 *
 * 原来的写法有个真问题（2026-09-15 查出来）：重试 4 次之后就永久放弃 ——
 *   if (sseRetry < 4) setTimeout(...)
 * 而且 `es` 被赋成一个假对象当"已启动"标记，导致随后任何 startSSE() 都被
 *   if (!isTauri || es) return
 * 直接挡回去。结果是：通道死了、**一声不响**，只能靠面板开着时的 5 秒轮询兜底。
 * 用户不会知道"实时"其实已经变成了"每 5 秒"，也没法恢复（只能重启面板）。
 *
 * 现在改成：不封顶重试（退避到最多 30 秒一次），并且记下最后一次成功的时刻，
 * 同步报告里会把这个状态如实说出来。
 */
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
    sseRetry = 0
    sseLastOkAt = Date.now()
  } catch (e) {
    sseRetry++
    void logDbg(`SSE 启动失败（第 ${sseRetry} 次）: ` + String(e).slice(0, 220))
    /* 不封顶：失败就一直退避重试，最多 30 秒一次。别再"试 4 次就算了"。 */
    const wait = Math.min(30000, 4000 * sseRetry)
    setTimeout(() => { es = null; void startSSE() }, wait)
  }
}

/** 强制重连：把"已放弃"的死状态清掉，重新走一遍启动。同步按钮用这个。 */
export function reconnectSSE(): void {
  es = null
  sseRetry = 0
  void startSSE()
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
    for (const x of ALL) dirtyProjects.add(x.key)
  }
  /* ① 事件流：把"刚刚发生了什么"说人话 */
  const key = String(d?.kind || '')
  const label = KIND_TEXT[key] || (key ? key.replace(/_/g, ' ') : '数据有更新')
  if (open) toast(`共享库 · ${label}`)
  /* ② 球也对这件事给个反应（2026-09-16 加）。
     为什么放在 toast 后面：toast 是给"正在看面板的人"的，球是给
     "没看面板、但眼睛扫到角落"的人的 —— 两条路各管一拨，不互相等。
     ⚠ 即使面板关着也要喂给它：**关着的时候才最需要球说一声**
     （用户不看面板，就靠这个角落里的东西知道'那边有动静了'）。 */
  reactToLibraryEvent(key)
}

/* ============ 同步按钮：点一下，把面板拉回与共享库一致 ============
 *
 * 用户 2026-09-15 的要求：加个按钮，点一下就把项目/任务/状态/数量全刷成最新的；
 * 并且他担心"某个会话正在库里干活、面板显示的是旧状态"。
 *
 * 先说清这个担心的真实边界（查过代码，不是猜的）：
 *   链路 = PG触发器 → memoryd 的 LISTEN（daemon.py:494 断线自愈）→
 *          Rust 转发（main.rs:134 外层 loop 每 3 秒重连）→ 前端 startSSE。
 *   前三段都会自愈；**前端原来会在重试 4 次后永久放弃且不吭声**（已修）。
 *   而且面板开着时还有 5 秒轮询兜底（startRefresh），所以最坏也只是落后 5 秒，
 *   不存在"永远对不上"。轮询只在面板可见时跑；关着的时候靠 dirtyProjects 补。
 *
 * 所以这个按钮的价值不是"救活坏掉的面板"，而是**给确定性**：
 * 让你此刻就能确认"我看到的和库里是一致的"，不用等、不用猜、不用怀疑。
 *
 * 全程**只读** —— 一条 INSERT/UPDATE 都不发，所以不会和任何正在干活的会话冲突。
 * （面板本来就没有任何写库能力，这是它的根本设计。）
 */
let syncing = false

async function syncNow(): Promise<void> {
  if (syncing) return                      /* 防连点：同时只允许一个同步在跑 */
  syncing = true
  const btn = document.getElementById('syncBtn') as HTMLButtonElement | null
  btn?.classList.add('spinning')

  const problems: string[] = []
  try {
    /* ① 重连事件通道：把"4 次后放弃"的死状态清掉，重新走一遍启动 */
    reconnectSSE()

    /* ② 重读项目列表（顺带收集 delta）+ ③ 重读当前项目的任务明细 */
    collecting = true
    addedProjects = []
    changedProjectCount = 0
    changedProjectDetail = []
    await loadProjects()
    collecting = false

    const viewing = view.kind === 'tasks' ? view.proj : ''
    if (viewing) {
      const p = byKey(viewing)
      /* 先记下旧的任务状态，才能说清"哪几个任务的显示变了" */
      const before = new Map((p?.tasks ?? []).map((t) => [t.key, t.status]))
      if (p) { p.tasks = []; p.fromDb = false }
      await loadTasks(viewing)
      dirtyProjects.delete(viewing)
      const after = byKey(viewing)?.tasks ?? []
      for (const t of after) {
        const was = before.get(t.key)
        if (was && was !== t.status) changedProjectDetail.push(`任务 ${t.key}：${was} → ${t.status}`)
        else if (!was) changedProjectDetail.push(`任务 ${t.key}：新出现`)
      }
      if (open && view.kind === 'tasks' && view.proj === viewing) renderTasks(viewing)
    }

    /* ④ 深度核对：面板算出来的状态 vs 后端给的计数。
       两边口径不同源（一边是 SQL 的 FILTER 计数，一边是前端的状态映射），
       所以这是真交叉验证：对不上就说明面板会显示错。 */
    const verify = await verifyConsistency()

    /* ⑤ 组装报告 */
    const lines: string[] = []
    const fresh = lastLoadAt ? Math.round((Date.now() - lastLoadAt) / 1000) : -1
    const sseOk = sseLastOkAt > 0
    const sseAge = sseOk ? Math.round((Date.now() - sseLastOkAt) / 1000) : -1

    if (!addedProjects.length && !changedProjectCount) {
      lines.push('没有变化 —— 面板本来就是最新的')
    } else {
      if (addedProjects.length) lines.push(`新出现：${addedProjects.length} 个项目（${addedProjects.slice(0, 3).join('、')}${addedProjects.length > 3 ? ' …' : ''}）`)
      if (changedProjectCount) lines.push(`有变化：${changedProjectCount} 个项目`)
      for (const d of changedProjectDetail.slice(0, 4)) lines.push('  ' + d)
      if (changedProjectDetail.length > 4) lines.push(`  …还有 ${changedProjectDetail.length - 4} 条`)
    }
    lines.push(sseOk
      ? `实时通道：正常（${sseAge} 秒前挂上）`
      : '实时通道：未挂上 —— 现在靠 5 秒轮询兜底')
    lines.push(`数据读取：${fresh >= 0 ? fresh + ' 秒前' : '刚刚'}`)
    lines.push(verify.ok
      ? (verify.projects === 0
        /* ⚠ 0 个项目时**不许**说"一致"（2026-09-15 审计发现的高危 bug）。
           原来它每次都跳过所有项目（fromDb 被重置），却打印绿灯
           「核对：一致（0 个项目 / 0 个任务）」—— 让人以为核对过了，其实什么都没查。 */
        ? '核对：这次没有可核对的项目（明细还没拉全）—— 所以这一行不算"已核对"'
        : `核对：一致（${verify.projects} 个项目 / ${verify.tasks} 个任务）`
          + (verify.skipped ? `，另有 ${verify.skipped} 个明细没拉全、未核对` : ''))
      : `核对：发现 ${verify.problems.length} 处对不上（核对了 ${verify.projects} 个项目）`)
    for (const p of verify.problems.slice(0, 4)) lines.push('  ⚠ ' + p)
    if (archivedProjects.length) {
      lines.push(`另有 ${archivedProjects.length} 个已归档未显示（${archivedProjects.slice(0, 3).map((a) => a.key).join('、')}${archivedProjects.length > 3 ? ' …' : ''}）`)
    }

    void logDbg('同步报告：' + lines.join(' | ').slice(0, 600))
    /* 核对有问题就不自动淡出，留在那儿让人看见 */
    showSyncReport(lines, !verify.ok)
  } catch (e) {
    void logDbg('同步失败: ' + String(e).slice(0, 300))
    showSyncReport(['同步失败：' + String(e).slice(0, 90), '原始报错已写进调试日志'], true)
  } finally {
    syncing = false
    setTimeout(() => btn?.classList.remove('spinning'), 400)
  }
}

/** 深度核对：把每个项目的"后端计数"和"面板状态映射算出来的结果"比一遍。
 *  当前项目如果再拉一次任务明细，还能把任务级的状态也核一遍。 */
async function verifyConsistency(): Promise<{ ok: boolean; problems: string[]; projects: number; tasks: number; skipped: number }> {
  const problems: string[] = []
  let taskTotal = 0
  let verified = 0
  let skipped = 0
  const scoped = view.kind === 'tasks' ? [byKey(view.proj)].filter(Boolean) as Proj[] : ALL

  for (const p of scoped) {
    /* 只有**明细已经拉全**的项目才做核对。
       为什么加这个前提：五项计数来自后端那句 SQL，它和 total 天然自洽；
       但如果面板手里只有部分明细（比如还没点进这个项目），
       拿"部分任务的分布"去比"全量计数"必然误报 —— 第一版就误报过（测试夹具露出来的）。 */
    if (!p.fromDb || !p.tasks.length) { skipped++; continue }
    if (num(p.total) === 0) { verified++; continue }

    taskTotal += num(p.total)
    verified++
    /* 计数自洽：六桶必须加起来等于总数（后端 SQL 保证，这里再验一遍防回归）。
       2026-09-15 拆出「等前置」这一桶 —— 前端把"pending 但有未完成前置"也算被卡住，
       后端原来只按 status 分，于是 rebuild-ui-assets-294 两边差 1（用户截图里那处）。 */
    const sum = num(p.done) + num(p.doing) + num(p.review) + num(p.ready) + heldOf(p) + num(p.failed)
    if (sum !== num(p.total)) {
      problems.push(p.name + '：六桶相加 ' + sum + ' ≠ 任务总数 ' + num(p.total))
    }
    /* 任务级核对：面板按状态映射算出来的数，对比后端 SQL 给的数 */
    const count = (f: (t: Task) => boolean) => p.tasks.filter(f).length
    const tDone = count((t) => t.status === 'done')
    const tDoing = count((t) => t.status === 'doing')
    const tReview = count((t) => t.status === 'review')
    const tReady = count((t) => t.status === 'ready')
    const tBlocked = count((t) => t.status === 'blocked')
    if (tDone !== num(p.done)) problems.push(p.name + '：完成数 ' + tDone + ' ≠ 后端 ' + num(p.done))
    if (tDoing !== num(p.doing)) problems.push(p.name + '：在做数 ' + tDoing + ' ≠ 后端 ' + num(p.doing))
    if (tReview !== num(p.review)) problems.push(p.name + '：待验收数 ' + tReview + ' ≠ 后端 ' + num(p.review))
    if (tReady !== num(p.ready)) problems.push(p.name + '：待开始数 ' + tReady + ' ≠ 后端 ' + num(p.ready))
    /* 后端把「等前置」和「库里标 blocked」分成两桶，前端都归在「被卡住」一组里 ——
       拿它们的和来比才公平（否则每次都会假报一处不一致）。 */
    if (tBlocked !== blockedOf(p)) problems.push(p.name + '：卡住数 ' + tBlocked + ' ≠ 后端 ' + blockedOf(p))
  }
  return { ok: problems.length === 0, problems, projects: verified, tasks: taskTotal, skipped }
}

/* 报告用底部弹层显示（和「已复制…」同一个位置，升级成多行）。
   sticky=true 时不自动淡出 —— 核对有问题就该留在眼前。
   用户定：2 秒就收（原来是 6 秒）。点一下可以立刻关掉。 */
let syncReportEl: HTMLElement | null = null
let syncReportTimer = 0
function showSyncReport(lines: string[], sticky: boolean): void {
  if (!syncReportEl) {
    syncReportEl = document.createElement('div')
    syncReportEl.className = 'sync-report'
    syncReportEl.addEventListener('click', () => syncReportEl!.classList.remove('show'))
    document.body.appendChild(syncReportEl)
  }
  const [head, ...rest] = lines
  syncReportEl.innerHTML = `<div class="sr-head">${head}</div>` +
    rest.map((l) => `<div class="sr-line${l.startsWith('  ⚠') ? ' warn' : ''}">${l}</div>`).join('')
  syncReportEl.classList.add('show')
  clearTimeout(syncReportTimer)
  if (!sticky) syncReportTimer = window.setTimeout(() => syncReportEl!.classList.remove('show'), 2000)
}

const syncBtn = document.getElementById('syncBtn') as HTMLButtonElement | null
if (syncBtn) {
  syncBtn.addEventListener('click', () => { void syncNow() })
}

export { syncNow }

/* ============ 导出项目进度报告（PDF） ============
 *
 * 用户 2026-09-15 要的：每个项目卡上有个按钮，一键导出这个项目的进度成 PDF，
 * 而且**内容要详细** —— "做了什么 / 没做什么 / 准备做什么"。
 *
 * 这三样**不在任务表里**，在检查点的 state 里（completed / not_done / next_action），
 * 所以要新拉一次 qcheckpoints（只读）。任务表只能给出"标题 + 状态 + 库里写的下一步"。
 *
 * ⚠ 归一化是必须的，不是讲究：
 *   那五个字段的类型**不统一** —— 实测 completed 有 38 次是数组、6 次是整段字符串、10 次是 null。
 *   第一版按"条数"数，遇到字符串就把字符数当条数（出现"完成 666 条"这种假数字）。
 *   所以这里统一成 string[] 再用。
 *
 * 生成方式是 HTML → Edge 无头打印成 PDF（Rust 的 export_pdf）。
 * 为什么不做 .docx：实测 Word COM 调用会卡死（弹出看不见的对话框），不可靠。
 */

/** 把 Rust 传来的检查点 state 解析成对象。
 *
 *  ⚠ 这一步是**必须的**，而且我第一版漏了 —— 导致导出的 PDF 主体内容**永远是空的**
 *  （2026-09-15 审计发现，并打开历史导出文件实证：那三节全写着"检查点里没有记录"）。
 *
 *  为什么会漏：Rust 侧把 jsonb 用 `state::text` 取出来当**字符串**传
 *  （`main.rs` 的 qcheckpoints），前端却直接 `row.state || {}` 当**对象**读，
 *  于是 `s.completed` 永远是 undefined。
 *
 *  为什么我的测试没抓到：测试夹具里我自己写的是**已解析好的对象** ——
 *  **夹具和真实管道的形状不一致，测了个假的**。教训：测跨进程的数据要拿真管道的输出。
 */
export function parseState(raw: any): Record<string, any> {
  if (raw === null || raw === undefined) return {}
  if (typeof raw === 'object') return raw as Record<string, any>
  const s = String(raw).trim()
  if (!s) return {}
  try {
    const o = JSON.parse(s)
    return o && typeof o === 'object' ? o : {}
  } catch {
    return {}
  }
}

/** 把检查点里的字段归一化成 string[] —— 它可能是数组、整段字符串、或 null。
 *  ⚠ 数组元素还可能是**对象**（库里实测 blockers 有 2 条是对象数组，
 *    形如 {item, kind, owner, detail}）—— 直接 String() 会得到 "[object Object]"。
 *    所以对象要挑出可读字段，把其余键拼成附注。 */
export function toItems(v: any): string[] {
  if (v === null || v === undefined) return []
  if (Array.isArray(v)) return v.map(objToLine).filter((s) => s.trim())
  if (typeof v === 'object') return [objToLine(v)].filter((s) => s.trim())
  const s = String(v).trim()
  if (!s) return []
  /* 整段字符串：如果里面有编号或换行，按行拆开更好读；否则当一条 */
  const lines = s.split(/\r?\n/).map((x) => x.trim()).filter(Boolean)
  return lines.length > 1 ? lines : [s]
}

/** 把检查点条目里的对象转成人能读的一行。
 *  {item:"web-access 不可用", kind:"external", owner:"用户", detail:"…"}
 *    → 「web-access 不可用（kind=external · owner=用户）—— detail…」 */
function objToLine(x: any): string {
  if (x === null || x === undefined) return ''
  if (typeof x !== 'object') return String(x)
  const main = x.item ?? x.text ?? x.title ?? x.summary ?? x.note ?? x.what ?? ''
  const detail = x.detail ?? x.description ?? x.why ?? ''
  const rest: string[] = []
  for (const k of ['kind', 'owner', 'who', 'status', 'when', 'file', 'path']) {
    if (x[k] !== undefined && x[k] !== null && String(x[k]).trim()) rest.push(`${k}=${x[k]}`)
  }
  const head = String(main).trim() || JSON.stringify(x)
  const tail = detail ? ` —— ${String(detail).trim()}` : ''
  const meta = rest.length ? `（${rest.join(' · ')}）` : ''
  return `${head}${meta}${tail}`
}


/** 文件名里不能有的字符，换成 - */
const safeName = (s: string) => s.replace(/[\\/:*?"<>|\r\n]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 60)

const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** 截断到 n 字，并**在标点处收尾**（不要切在半句话中间）。
 *  直接用 slice 会出现"…完成后，"这种断头句，读起来很别扭。 */
function clip(s: string, n: number): string {
  const t = String(s).trim()
  if (t.length <= n) return t
  const cut = t.slice(0, n)
  /* 在最后 40 字里找标点/换行，找不到就硬截 */
  const m = /[。；！！？!?、,，\n][^。；！！？!?、,，\n]*$/.exec(cut)
  const at = m ? cut.length - m[0].length + 1 : cut.length
  return cut.slice(0, at).replace(/[。；、,，\s]+$/, '') + '…'
}

/** 日期：2026-09-15 → 二〇二六年九月十五日 这类中文格式太啰嗦，用 2026-09-15 就好 */
const today = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

const STATUS_CN: Record<string, string> = {
  done: '已完成', doing: '进行中', review: '待验收', ready: '待开始', blocked: '等待中',
}
const st = (t: Task) => STATUS_CN[t.status] || t.status

/** 拼一份可打印的 HTML。版式刻意跟面板一致：细线表格、墨色字、无阴影。 */
export function buildReportHtml(p: Proj, ckRows: any[]): string {
  const ck = new Map<string, any>()
  /* 取每个任务**最新**的一条检查点（后端按任务给了最新一条，这里再按时间兜一次底） */
  for (const r of ckRows) {
    const prev = ck.get(r.task_key)
    if (!prev || String(r.at || '') > String(prev.at || '')) ck.set(r.task_key, r)
  }

  /* 收集"做了什么 / 没做什么" —— 汇总所有任务的检查点，去重，标出来源任务 */
  const doneItems: { text: string; from: string }[] = []
  const notDoneItems: { text: string; from: string }[] = []
  const blockers: { text: string; from: string }[] = []
  const nextItems: { text: string; from: string }[] = []
  const seen = new Set<string>()
  const push = (arr: { text: string; from: string }[], text: string, from: string) => {
    const k = text.slice(0, 80)
    if (seen.has(k)) return
    seen.add(k)
    arr.push({ text, from })
  }

  for (const t of p.tasks) {
    const row = ck.get(t.key)
    const s = parseState(row?.state)
    for (const x of toItems(s.completed)) push(doneItems, x, t.key)
    for (const x of toItems(s.not_done)) push(notDoneItems, x, t.key)
    for (const x of toItems(s.blockers)) push(blockers, x, t.key)
    const nx = toItems(s.next_action)
    for (const x of nx) push(nextItems, x, t.key)
  }
  /* 任务表里自己的"下一步"也要收（有的任务没写检查点，但写了 next_action） */
  for (const t of p.tasks) {
    if (t.status !== 'done' && t.nextAct) push(nextItems, t.nextAct, t.key)
  }

  const doing = p.tasks.filter((t) => t.status === 'doing')
  const review = p.tasks.filter((t) => t.status === 'review')
  const ready = p.tasks.filter((t) => t.status === 'ready')
  const blocked = p.tasks.filter((t) => t.status === 'blocked')
  const doneTasks = p.tasks.filter((t) => t.status === 'done')

  /* 表格精简（2026-09-15 用户反馈：导出内容里好多路径、太啰嗦）。
     砍法：说明从 700 字压到 260、下一步从 500 压到 220、前置只留第一个。
     报告的主体价值在"做了什么 / 没做什么 / 准备做什么"那几节（从检查点提炼），
     任务表只是索引 —— 每行贴一大段路径反而把重点埋掉。 */
  const taskTable = (list: Task[]) => list.length ? `
    <table>
      <tr><th style="width:24%">任务</th><th style="width:11%">状态</th><th>说明 / 下一步</th></tr>
      ${list.map((t) => `<tr>
        <td><b>${esc(t.key)}</b><div class="dim">${esc(t.title)}</div></td>
        <td class="${t.status}">${st(t)}${t.owner ? `<div class="dim">${esc(t.owner)}</div>` : ''}</td>
        <td>${t.desc ? `<div class="desc">${esc(clip(t.desc, 260))}</div>` : '<div class="dim">库里没写说明</div>'}
            ${t.nextAct ? `<div class="na"><b>下一步：</b>${esc(clip(t.nextAct, 220))}</div>` : ''}
            ${t.depends?.length ? `<div class="dim">前置：${esc(t.depends[0])}${t.depends.length > 1 ? ` 等 ${t.depends.length} 项` : ''}</div>` : ''}</td>
      </tr>`).join('')}
    </table>` : '<p class="dim">（无）</p>'

  const bullets = (arr: { text: string; from: string }[], empty: string) => arr.length
    ? `<ul>${arr.map((x) => `<li>${esc(x.text)}<span class="src">来源：${esc(x.from)}</span></li>`).join('')}</ul>`
    : `<p class="dim">${empty}</p>`

  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>${esc(p.name)} · 进度报告</title>
<style>
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: "Microsoft YaHei", "PingFang SC", sans-serif; font-size: 10.5pt; color: #111; line-height: 1.75; margin: 0; }
  h1 { font-size: 19pt; margin: 0 0 4px; letter-spacing: -.01em; }
  .sub { color: #666; font-size: 9pt; margin-bottom: 16px; }
  h2 { font-size: 12.5pt; margin: 20px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #ddd; }
  h3 { font-size: 11pt; margin: 14px 0 6px; color: #333; }
  table { border-collapse: collapse; width: 100%; margin: 6px 0 10px; }
  th, td { border: 1px solid #ddd; padding: 6px 8px; font-size: 9.5pt; text-align: left; vertical-align: top; }
  th { background: #f5f5f6; font-weight: 600; }
  ul { margin: 4px 0 10px; padding-left: 20px; }
  li { margin-bottom: 6px; }
  .dim { color: #888; font-size: 9pt; }
  .desc { color: #333; }
  .na { margin-top: 4px; color: #1a4f8a; }
  .src { color: #aaa; font-size: 8pt; margin-left: 6px; }
  .done { color: #17a06b; font-weight: 600; }
  .doing { color: #3b7ef6; font-weight: 600; }
  .review { color: #8a6d1e; font-weight: 600; }
  .ready { color: #777; }
  .blocked { color: #c0392b; font-weight: 600; }
  .kpi { display: flex; gap: 22px; margin: 10px 0 4px; padding: 10px 0; border-top: 1px solid #eee; border-bottom: 1px solid #eee; }
  .kpi div { font-size: 9pt; color: #666; }
  .kpi b { display: block; font-size: 16pt; color: #111; font-weight: 650; }
  .note { margin-top: 18px; padding-top: 8px; border-top: 1px solid #eee; color: #999; font-size: 8.5pt; }
</style></head><body>

<h1>${esc(p.name)}</h1>
<div class="sub">进度报告 · 生成于 ${today()} · 数据来自共享项目库</div>

${p.scope ? `<p>${esc(p.scope)}</p>` : '<p class="dim">（库里没写这个项目的 scope）</p>'}
${p.root ? `<p class="dim">代码目录：${esc(p.root)}</p>` : ''}

<div class="kpi">
  <div><b>${p.done}/${p.total}</b>任务完成</div>
  <div><b>${p.doing}</b>进行中</div>
  <div><b>${p.review}</b>待验收</div>
  <div><b>${p.ready}</b>待开始</div>
  <div><b>${p.failed}</b>卡住 / 失败</div>
  <div><b>${p.artifacts || 0}</b>交付产出</div>
  ${p.mapNodes ? `<div><b>${p.mapNodes}</b>代码模块</div>` : ''}
</div>

<h2>零、任务目标与验收标准</h2>
${(() => {
  /* 合同是"这件事现在的要求"的活定义 —— 任务标题只是标签，范围延伸后名字会跟不上。
     导出报告给外人看时，这一节比任务名更能说明"当初答应做什么"。 */
  const rows = p.tasks.map((t) => ({ t, c: parseContract(t.contract || '') }))
    .filter((x) => x.c.goal || x.c.acceptance.length)
  if (!rows.length) return '<p class="dim">库里这些任务没有登记合同（目标 / 验收标准）。</p>'
  return rows.map(({ t, c }) => `
    <h3>${esc(t.title)}<span class="dim"> · ${esc(t.key)} · ${st(t)}</span></h3>
    ${c.goal ? `<p><b>目标：</b>${esc(c.goal)}</p>` : ''}
    ${c.acceptance.length ? `<ul>${c.acceptance.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}
  `).join('')
})()}

<h2>一、做了什么</h2>
${bullets(doneItems, '各任务的检查点里没有记录"已完成"的条目。')}

<h2>二、还没做什么</h2>
${bullets(notDoneItems, '检查点里没有记录"未完成"的条目 —— 不代表没有，可能是没写进检查点。')}

<h2>三、卡在哪儿</h2>
${blockers.length ? bullets(blockers, '') : '<p class="dim">检查点里没有记录阻塞项。</p>'}
${blocked.length ? `<h3>库里标为「等待中」的任务</h3>${taskTable(blocked)}` : ''}

<h2>四、准备做什么</h2>
${review.length ? `<h3>待验收（等确认，不是等自己做）</h3>${taskTable(review)}` : ''}
${doing.length ? `<h3>正在进行</h3>${taskTable(doing)}` : ''}
${ready.length ? `<h3>待开始</h3>${taskTable(ready)}` : ''}
${nextItems.length ? `<h3>各任务登记的下一步</h3>${bullets(nextItems, '')}` : ''}

<h2>五、已经完成的任务</h2>
${taskTable(doneTasks)}

<div class="note">
  本报告由「共享项目库」悬浮球面板导出，内容全部取自共享项目库（PostgreSQL），未做人工润色。<br>
  任务状态、说明、下一步来自任务表；「做了什么 / 还没做 / 卡在哪儿」来自各会话写的检查点。<br>
  库里的字段不统一（检查点的 completed 等字段可能是数组或整段文本），导出时已统一成条目列出。
</div>
</body></html>`
}

/** 导出当前项目为 PDF。整个流程：拉检查点 → 拼 HTML → 交给 Rust 调 Edge 打 PDF。 */
async function exportProjectPdf(projKey: string, btn?: HTMLElement | null): Promise<void> {
  const p = byKey(projKey)
  if (!p) { toast('找不到这个项目'); return }
  /* 按钮必须由调用方传进来。
     原来用 getElementById 取 —— 但每张卡各有一个同名 id，页面上一共 9 个，
     它只返回第一个：于是转圈转在别的卡上，用户点的那张看起来毫无反应
     （2026-09-15 用户反馈：点了没转圈）。 */
  btn?.classList.add('spinning')
  try {
    /* ① 任务明细要齐（导出内容全靠它） */
    if (!p.fromDb || !p.tasks.length) {
      await loadTasks(projKey)
      if (open && view.kind === 'tasks' && view.proj === projKey) renderTasks(projKey)
    }
    /* ② 拉检查点（只读；这是"做了什么/没做什么"的唯一来源） */
    let ckRows: any[] = []
    try {
      const raw = await invoke<string>('qcheckpoints', { projectKey: projKey })
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) ckRows = parsed
    } catch (e) {
      void logDbg('读检查点失败（报告会少"做了什么"那几节）：' + String(e).slice(0, 200))
    }
    /* ③ 拼 HTML */
    const html = buildReportHtml(p, ckRows)
    /* ④ 交给 Rust：写文件 + Edge 打 PDF */
    const dir = 'D:\\codex-memory\\vault\\exports\\' + projKey
    const stamp = today().replace(/[: ]/g, '-')
    const filename = `${safeName(p.name)}-进度-${stamp}`
    const pdf = await invoke<string>('export_pdf', { html, dir, filename })
    void logDbg('导出成功: ' + pdf)
    /* 用户要求：不要底部提示、不要显示路径，直接把 PDF 打开 —— */
    /* 用自家的 open_file 命令 —— opener 插件的 open_path 要配 scope，导出目录是每个项目一个子目录，没法穷举。 */
    try { await invoke('open_file', { path: pdf }) }
    catch (e2) { void logDbg('自动打开失败: ' + String(e2).slice(0, 200)) }
    setBotState('burst', clock)
  } catch (e) {
    void logDbg('导出失败: ' + String(e).slice(0, 300))
    /* 报错原文照贴，不假装成功 */
    showSyncReport(['导出失败', String(e).slice(0, 200), '原始报错已写进调试日志'], true)
  } finally {
    setTimeout(() => btn?.classList.remove('spinning'), 400)
  }
}
