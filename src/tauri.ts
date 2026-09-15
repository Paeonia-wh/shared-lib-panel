/**
 * Tauri 桌面适配
 * - 只做两件事：① 把窗口贴到屏幕右上角 ② 空白区域鼠标穿透
 * - 窗口尺寸固定（= 球 + 面板的空间），不再动态改尺寸（DPI 换算容易出错）
 * - 浏览器里跑时全部自动跳过
 */
export const isTauri = !!(window as any).__TAURI_INTERNALS__ || !!(window as any).__TAURI__

import { getCurrentWindow, LogicalPosition, cursorPosition } from '@tauri-apps/api/window'
import { invoke } from '@tauri-apps/api/core'

const MARGIN = 8               // 距屏幕边缘
const WIN_W = 560              // 与 tauri.conf.json 保持一致（CSS px）

let inited = false
let ignoring: boolean | null = null

function win_() {
  return { win: getCurrentWindow(), Pos: LogicalPosition, cursor: cursorPosition }
}
async function inv(cmd: string, args: any) {
  return invoke(cmd, args)
}

/** 启动：贴屏幕右上角 + 开始穿透检测 */
export async function initTauri() {
  if (!isTauri || inited) return
  inited = true
  document.documentElement.classList.add('tauri')
  document.body.classList.add('tauri')   /* 真桌面：隐藏模拟背景，让真桌面透过来 */
  try {
    const { win, Pos } = win_()
    /* 逻辑坐标：屏幕逻辑宽 - 窗口宽 - 边距（系统自己处理 DPI） */
    const availW = window.screen.availWidth || 1536
    const availH = window.screen.availHeight || 864
    const x = Math.max(0, availW - WIN_W - MARGIN)
    const y = MARGIN
    await win.setPosition(new Pos(x, y))
    const real = await win.outerPosition()
    const sc = await win.scaleFactor()
    startHitTest()
  } catch (e) {
    await inv('debug_log', { msg: 'init ERR: ' + String(e).slice(0, 90) }).catch(() => {})
  }
}

/** 空白处穿透：鼠标不在球/面板上时，点击直接落到下面的窗口 */
function startHitTest() {
    const ballEl = document.getElementById('ball')
  const panelEl = document.getElementById('panel')
  setInterval(async () => {
    try {
      const { win, cursor } = win_()
      const cur = await cursor()                 // 物理坐标
      const pos = await win.outerPosition()      // 物理坐标
      const s = await win.scaleFactor()
      const x = (cur.x - pos.x) / s              // 窗口内 CSS 坐标
      const y = (cur.y - pos.y) / s
      const inside = (el: Element | null) => {
        if (!el) return false
        const r = el.getBoundingClientRect()
        return r.width > 0 && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
      }
      const open = panelEl?.classList.contains('open')
      const hit = inside(ballEl) || (open ? inside(panelEl) : false)
      const shouldIgnore = !hit
      if (shouldIgnore !== ignoring) {
        ignoring = shouldIgnore
        await inv('set_click_through', { ignore: shouldIgnore })
      }
    } catch { /* 忽略 */ }
  }, 90)
}

/** 拖动球：移动窗口 */

/* 兼容旧调用名（面板开合不再改窗口尺寸） */
export const expandWindow = async () => {}
export const collapseWindow = async () => {}

/* ===== 拖动：本地累加位置 + 每帧最多一次 IPC（不再来回查窗口位置）===== */
let winPos: { x: number; y: number } | null = null
let pendingPos: { x: number; y: number } | null = null
let rafBusy = false

export async function beginDrag() {
  if (!isTauri) return
  try {
    const { win } = await win_()
    const p = await win.outerPosition()          // 物理
    winPos = { x: p.x, y: p.y }
  } catch { winPos = null }
}

export function dragBy(dxCss: number, dyCss: number) {
  if (!isTauri || !winPos) return
  const sc = window.devicePixelRatio || 1
  winPos.x += dxCss * sc
  winPos.y += dyCss * sc
  pendingPos = { ...winPos }
  if (rafBusy) return
  rafBusy = true
  requestAnimationFrame(async () => {
    rafBusy = false
    const q = pendingPos
    pendingPos = null
    if (!q) return
    try {
      const { win, Pos } = win_()
      const sc2 = await win.scaleFactor()
      await win.setPosition(new Pos(Math.round(q.x / sc2), Math.round(q.y / sc2)))
    } catch { /* 忽略 */ }
  })
}
