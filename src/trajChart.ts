/** 战术抛物线 2D 坐标系绘制 */

import { getActionMode } from './actionModes'
import {
  G,
  LUNA_AIRBURST_S,
  LUNA_BOUNCE_M,
  LUNA_BOUNCE_S,
  THETA_OFFSET_DEG,
  V0,
  type BallisticResult,
  type ThrowParams,
  deg2rad,
} from './physics'
import type { ThrowableDef } from './operators'

const X_MAX_DEFAULT = 100
const Y_MIN_DEFAULT = -10
const Y_MAX_DEFAULT = 30
/** 坐标轴统一格距（米）：横纵同比例，一格 5m */
const GRID_M = 5

const snapCeil = (v: number) => Math.ceil(v / GRID_M) * GRID_M
const snapFloor = (v: number) => Math.floor(v / GRID_M) * GRID_M

export interface TrajHudInfo {
  actionTitle: string
  alpha: number
  theta: number
  range: number
  flightTime: number
  h0: number
  vMove: number
  apexH: number
  apexT: number
  apexX: number
  blastEndM: number
  airburst: boolean
  bounce: boolean
  cookS: number | null
  /** 爆点杀伤圈是否覆盖起投点 */
  selfHit: boolean
}

function apexOf(cur: BallisticResult, params: ThrowParams) {
  const v0 = params.v0 ?? V0
  const offset = params.offsetDeg ?? THETA_OFFSET_DEG
  const theta = deg2rad(cur.alpha + offset)
  const vy0 = v0 * Math.sin(theta)
  const vx = v0 * Math.cos(theta) + cur.vMove
  const tApex = Math.max(0, vy0 / G)
  return {
    t: tApex,
    x: vx * tApex,
    y: cur.h0 + vy0 * tApex - 0.5 * G * tApex * tApex,
  }
}

function pointAtTime(cur: BallisticResult, params: ThrowParams, t: number) {
  const v0 = params.v0 ?? V0
  const theta = deg2rad(cur.theta)
  const vy0 = v0 * Math.sin(theta)
  const vx = v0 * Math.cos(theta) + cur.vMove
  return {
    x: vx * t,
    y: cur.h0 + vy0 * t - 0.5 * G * t * t,
  }
}

/** 实际起爆点：空爆跟空中位置；否则跟落点/弹地终点 */
function blastOrigin(
  cur: BallisticResult,
  params: ThrowParams,
  hud: TrajHudInfo,
): { x: number; y: number; air: boolean } {
  if (hud.airburst) {
    const pt = pointAtTime(cur, params, LUNA_AIRBURST_S)
    return { x: pt.x, y: pt.y, air: true }
  }
  if (hud.bounce) return { x: hud.blastEndM, y: 0, air: false }
  return { x: cur.range, y: cur.deltaH, air: false }
}

export function buildHudInfo(
  cur: BallisticResult,
  params: ThrowParams,
  th: ThrowableDef,
  probeBounce = false,
): TrajHudInfo {
  const mode = getActionMode(cur.actionId)
  const apex = apexOf(cur, params)
  const airburst = th.fuseS != null && cur.flightTime >= LUNA_AIRBURST_S
  const bounce =
    probeBounce &&
    th.fuseS != null &&
    !airburst &&
    cur.flightTime + LUNA_BOUNCE_S <= th.fuseS + 0.05
  const blastEndM = bounce ? cur.range + LUNA_BOUNCE_M : cur.range
  const cookS = th.fuseS != null ? th.fuseS - cur.flightTime : null
  const blastR = th.blastRadiusM ?? 0
  let blastX = cur.range
  let blastY = cur.deltaH
  if (airburst) {
    const pt = pointAtTime(cur, params, LUNA_AIRBURST_S)
    blastX = pt.x
    blastY = pt.y
  } else if (bounce) {
    blastX = blastEndM
    blastY = 0
  }
  const selfHit =
    blastR > 0 && Math.hypot(blastX, blastY - cur.h0) <= blastR + 1e-6
  return {
    actionTitle: mode.title,
    alpha: cur.alpha,
    theta: cur.theta,
    range: cur.range,
    flightTime: cur.flightTime,
    h0: cur.h0,
    vMove: cur.vMove,
    apexH: apex.y,
    apexT: apex.t,
    apexX: apex.x,
    blastEndM,
    airburst,
    bounce,
    cookS,
    selfHit,
  }
}

export function drawTacticalTrajectory(
  canvas: HTMLCanvasElement,
  cur: BallisticResult,
  params: ThrowParams,
  th: ThrowableDef,
  targetM: number,
  probeBounce = false,
): TrajHudInfo {
  const ctx = canvas.getContext('2d')
  if (!ctx) return buildHudInfo(cur, params, th, probeBounce)

  const dpr = window.devicePixelRatio || 1
  const W = Math.max(1, canvas.clientWidth || 640)
  const H = Math.max(1, canvas.clientHeight || 360)
  canvas.width = Math.floor(W * dpr)
  canvas.height = Math.floor(H * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, W, H)

  const hud = buildHudInfo(cur, params, th, probeBounce)
  const blastR = th.blastRadiusM ?? 0
  const soundR = th.pinSoundRadiusM ?? 0
  const blast = blastOrigin(cur, params, hud)

  const padL = 48
  const padR = 18
  const padT = 28
  const padB = 36
  const plotW = W - padL - padR
  const plotH = H - padT - padB

  // 内容包围盒（再按 5m 取整）
  const needX = Math.min(
    X_MAX_DEFAULT,
    Math.max(
      40,
      targetM,
      hud.blastEndM,
      cur.range,
      hud.apexX,
      blast.x + blastR,
      Math.min(soundR, 40),
    ) + GRID_M,
  )
  const needYMax = Math.min(
    45,
    Math.max(
      Y_MAX_DEFAULT,
      hud.apexH + GRID_M,
      cur.h0 + GRID_M,
      cur.deltaH + GRID_M,
      blast.y + blastR + GRID_M,
    ),
  )
  const needYMin = Math.max(
    -25,
    Math.min(Y_MIN_DEFAULT, cur.deltaH - GRID_M, blast.y - blastR - GRID_M, -GRID_M),
  )

  const needCellsX = Math.max(8, Math.ceil(needX / GRID_M))
  const needCellsY = Math.max(6, Math.ceil((needYMax - needYMin) / GRID_M))

  // 横纵同比例：一格 GRID_M 米 = 相同像素 → 正方格、真圆
  let cellPx = Math.min(plotW / needCellsX, plotH / needCellsY)
  const nX = Math.max(needCellsX, Math.floor(plotW / cellPx))
  const nY = Math.max(needCellsY, Math.floor(plotH / cellPx))
  cellPx = Math.min(plotW / nX, plotH / nY)

  const xMax = nX * GRID_M
  const ySpan = nY * GRID_M
  let yMin = snapFloor(needYMin)
  let yMax = yMin + ySpan
  if (yMax < needYMax) {
    yMax = snapCeil(needYMax)
    yMin = yMax - ySpan
  }

  const usedW = nX * cellPx
  const usedH = nY * cellPx
  const originX = padL + (plotW - usedW) / 2
  const originY = padT + (plotH - usedH) / 2
  const ppm = cellPx / GRID_M // pixels per meter

  const tx = (x: number) => originX + x * ppm
  const ty = (y: number) => originY + (yMax - y) * ppm
  const worldR = (r: number) => r * ppm

  const bg = ctx.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, 'rgba(10, 18, 28, 0.95)')
  bg.addColorStop(1, 'rgba(6, 10, 16, 0.98)')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  const clipPlot = () => {
    ctx.beginPath()
    ctx.rect(originX, originY, usedW, usedH)
    ctx.clip()
  }

  ctx.save()
  clipPlot()

  // 拉环声：以抛出点为圆心（非爆点）
  if (soundR > 0) {
    const sx = tx(0)
    const sy = ty(cur.h0)
    const rr = worldR(soundR)
    ctx.beginPath()
    ctx.arc(sx, sy, rr, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(120, 180, 255, 0.08)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(140, 200, 255, 0.45)'
    ctx.setLineDash([6, 4])
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.setLineDash([])
  }

  // 5m × 5m 正方网格
  ctx.lineWidth = 1
  for (let x = 0; x <= xMax + 0.01; x += GRID_M) {
    const px = tx(x)
    const major = Math.abs(x % (GRID_M * 2)) < 0.01
    ctx.strokeStyle = major ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.06)'
    ctx.beginPath()
    ctx.moveTo(px, originY)
    ctx.lineTo(px, originY + usedH)
    ctx.stroke()
  }
  for (let y = yMin; y <= yMax + 0.01; y += GRID_M) {
    const py = ty(y)
    const isGround = Math.abs(y) < 0.01
    ctx.strokeStyle = isGround ? 'rgba(120, 200, 255, 0.55)' : 'rgba(255,255,255,0.1)'
    ctx.lineWidth = isGround ? 1.5 : 1
    ctx.beginPath()
    ctx.moveTo(originX, py)
    ctx.lineTo(originX + usedW, py)
    ctx.stroke()
  }

  {
    const gy = ty(0)
    ctx.strokeStyle = 'rgba(100, 200, 255, 0.35)'
    ctx.shadowColor = 'rgba(80, 180, 255, 0.6)'
    ctx.shadowBlur = 8
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(originX, gy)
    ctx.lineTo(originX + usedW, gy)
    ctx.stroke()
    ctx.shadowBlur = 0
    ctx.fillStyle = 'rgba(140, 200, 255, 0.75)'
    ctx.font = '600 10px Consolas, monospace'
    ctx.fillText('地面 Y=0', originX + 4, gy - 6)
  }
  ctx.restore() // 结束绘图区裁切（刻度文字画在外侧）

  ctx.font = '10px Consolas, monospace'
  ctx.fillStyle = 'rgba(180, 195, 210, 0.85)'
  ctx.textAlign = 'center'
  for (let x = 0; x <= xMax + 0.01; x += GRID_M) {
    ctx.fillText(`${x}`, tx(x), originY + usedH + 14)
  }
  ctx.textAlign = 'right'
  for (let y = yMin; y <= yMax + 0.01; y += GRID_M) {
    ctx.fillText(`${y}`, originX - 6, ty(y) + 3)
  }
  ctx.textAlign = 'left'
  ctx.fillStyle = 'rgba(140, 160, 180, 0.8)'
  ctx.fillText('X 距离 (m) · 格=5m', originX + usedW - 110, originY + usedH + 28)
  ctx.save()
  ctx.translate(14, originY + usedH / 2)
  ctx.rotate(-Math.PI / 2)
  ctx.fillText('Y 高度 (m)', 0, 0)
  ctx.restore()

  // 图例
  {
    const lx = originX + usedW - 168
    const ly = Math.max(8, originY - 22)
    ctx.font = '600 10px Segoe UI, Microsoft YaHei, sans-serif'
    ctx.fillStyle = 'rgba(160, 210, 255, 0.9)'
    ctx.fillText('┄ 拉环声', lx, ly)
    ctx.fillStyle = 'rgba(255, 200, 80, 0.9)'
    ctx.fillText('○ 杀伤半径', lx + 58, ly)
    if (soundR > 0) {
      ctx.fillStyle = 'rgba(160, 210, 255, 0.55)'
      ctx.font = '10px Consolas, monospace'
      ctx.fillText(`${soundR}m@起投`, lx, ly + 12)
    }
  }

  ctx.save()
  clipPlot()

  {
    const ox = tx(0)
    const oy = ty(cur.h0)
    const r = 36
    const aAlpha = -deg2rad(cur.alpha)
    const aTheta = -deg2rad(cur.theta)
    ctx.beginPath()
    ctx.moveTo(ox, oy)
    ctx.arc(ox, oy, r, 0, aTheta, true)
    ctx.closePath()
    ctx.fillStyle = 'rgba(109, 255, 154, 0.12)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(109, 255, 154, 0.55)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(ox, oy)
    ctx.lineTo(ox + r * Math.cos(aAlpha), oy + r * Math.sin(aAlpha))
    ctx.stroke()
    ctx.strokeStyle = 'rgba(126, 200, 255, 0.7)'
    ctx.beginPath()
    ctx.moveTo(ox, oy)
    ctx.lineTo(ox + r * Math.cos(aTheta), oy + r * Math.sin(aTheta))
    ctx.stroke()
    ctx.fillStyle = 'rgba(200, 230, 210, 0.9)'
    ctx.font = '600 10px Consolas, monospace'
    ctx.fillText(`α ${cur.alpha.toFixed(1)}°`, ox + 8, oy - 28)
    ctx.fillStyle = 'rgba(160, 210, 255, 0.9)'
    ctx.fillText(`θ +${THETA_OFFSET_DEG}°`, ox + 8, oy - 16)
  }

  // 空爆时抛物线画到爆点即止
  const tDrawEnd = hud.airburst
    ? Math.min(LUNA_AIRBURST_S, cur.flightTime)
    : cur.flightTime
  const pts: Array<{ x: number; y: number }> = []
  if (tDrawEnd > 0) {
    const steps = 96
    for (let i = 0; i <= steps; i++) {
      pts.push(pointAtTime(cur, params, (tDrawEnd * i) / steps))
    }
  } else {
    pts.push({ x: 0, y: cur.h0 })
  }

  if (pts.length > 1) {
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.shadowColor = 'rgba(80, 255, 160, 0.55)'
    ctx.shadowBlur = 10
    const endX = pts[pts.length - 1]?.x ?? cur.range
    const grad = ctx.createLinearGradient(tx(0), 0, tx(Math.max(endX, 1)), 0)
    grad.addColorStop(0, 'rgba(80, 220, 255, 0.95)')
    grad.addColorStop(0.55, 'rgba(109, 255, 154, 0.95)')
    grad.addColorStop(1, 'rgba(255, 200, 80, 0.95)')
    ctx.strokeStyle = grad
    ctx.lineWidth = 2.5
    ctx.beginPath()
    pts.forEach((pt, i) => {
      const x = tx(pt.x)
      const y = ty(pt.y)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.stroke()
    ctx.shadowBlur = 0
  }

  if (tDrawEnd > 0.5) {
    for (let t = 1; t < tDrawEnd; t += 1) {
      const pt = pointAtTime(cur, params, t)
      if (pt.x < 0 || pt.x > xMax) continue
      const px = tx(pt.x)
      const py = ty(pt.y)
      ctx.fillStyle = 'rgba(180, 220, 255, 0.85)'
      ctx.beginPath()
      ctx.arc(px, py, 2.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.font = '600 9px Consolas, monospace'
      ctx.fillText(`${t}s`, px + 5, py - 5)
    }
  }

  {
    const ox = tx(0)
    const oy = ty(cur.h0)
    ctx.fillStyle = '#6dff9a'
    ctx.beginPath()
    ctx.arc(ox, oy, 4, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(200, 255, 220, 0.9)'
    ctx.font = '600 10px Consolas, monospace'
    ctx.fillText(`起投 h₀=${cur.h0.toFixed(1)}m`, ox + 8, oy + 14)
  }

  if (hud.apexT > 0.05 && hud.apexT < tDrawEnd) {
    const ax = tx(hud.apexX)
    const ay = ty(hud.apexH)
    ctx.setLineDash([4, 3])
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)'
    ctx.beginPath()
    ctx.moveTo(ax, ay)
    ctx.lineTo(ax, ty(0))
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(ax, ay, 3.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(230, 240, 255, 0.95)'
    ctx.font = '600 11px Consolas, monospace'
    ctx.fillText(`最高 ${hud.apexH.toFixed(1)}m · t=${hud.apexT.toFixed(2)}s`, ax + 8, ay - 8)
  }

  if (hud.airburst || cur.flightTime >= LUNA_AIRBURST_S) {
    const px = tx(blast.x)
    const py = ty(blast.y)
    ctx.fillStyle = 'rgba(255, 70, 70, 0.95)'
    ctx.beginPath()
    ctx.arc(px, py, 5, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255, 120, 120, 0.8)'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.fillStyle = 'rgba(255, 160, 160, 0.95)'
    ctx.font = '700 11px Segoe UI, Microsoft YaHei, sans-serif'
    ctx.fillText(`空爆 ${LUNA_AIRBURST_S}s`, px + 8, py - 6)
  }

  const landX = tx(cur.range)
  const landY = ty(cur.deltaH)
  if (!hud.airburst) {
    ctx.strokeStyle = 'rgba(255, 200, 80, 0.9)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(landX, landY - 10)
    ctx.lineTo(landX, landY)
    ctx.lineTo(landX - 5, landY - 6)
    ctx.moveTo(landX, landY)
    ctx.lineTo(landX + 5, landY - 6)
    ctx.stroke()
    ctx.fillStyle = 'rgba(255, 220, 140, 0.95)'
    ctx.font = '600 11px Consolas, monospace'
    ctx.fillText(`落地 ${cur.range.toFixed(1)}m`, landX + 6, landY - 12)
  }

  if (hud.bounce && blastR > 0) {
    const bx = tx(hud.blastEndM)
    ctx.setLineDash([5, 4])
    ctx.strokeStyle = 'rgba(255, 180, 80, 0.75)'
    ctx.beginPath()
    ctx.moveTo(landX, landY)
    ctx.lineTo(bx, landY)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = 'rgba(255, 190, 100, 0.9)'
    ctx.font = '600 10px Consolas, monospace'
    ctx.fillText(
      `弹地 +${LUNA_BOUNCE_M}m / ${LUNA_BOUNCE_S}s → 爆点 ${hud.blastEndM.toFixed(1)}m`,
      landX + 6,
      landY + 14,
    )
  }

  // 伤害范围：仅画有效爆炸半径（面板 8m）；中心→边缘线性衰减用径向渐变示意，不再另画“核心圈”
  if (blastR > 0) {
    const cx = tx(blast.x)
    const cy = ty(blast.y)
    const rEdge = worldR(blastR)
    const gy = ty(0)

    const fill = ctx.createRadialGradient(cx, cy, 0, cx, cy, rEdge)
    if (hud.selfHit) {
      fill.addColorStop(0, 'rgba(255, 70, 50, 0.45)')
      fill.addColorStop(0.55, 'rgba(255, 90, 60, 0.2)')
      fill.addColorStop(1, 'rgba(255, 120, 80, 0.04)')
    } else {
      fill.addColorStop(0, 'rgba(255, 80, 50, 0.4)')
      fill.addColorStop(0.45, 'rgba(255, 160, 60, 0.18)')
      fill.addColorStop(1, 'rgba(255, 200, 80, 0.04)')
    }
    ctx.beginPath()
    ctx.arc(cx, cy, rEdge, 0, Math.PI * 2)
    ctx.fillStyle = fill
    ctx.fill()
    ctx.strokeStyle = hud.selfHit
      ? 'rgba(255, 90, 70, 0.95)'
      : 'rgba(255, 120, 70, 0.85)'
    ctx.lineWidth = hud.selfHit ? 2.5 : 2
    ctx.stroke()

    // 地面半径刻度：左右竖短线对照 X 轴格距
    if (!blast.air) {
      const xL = tx(blast.x - blastR)
      const xR = tx(blast.x + blastR)
      ctx.strokeStyle = 'rgba(255, 160, 100, 0.9)'
      ctx.lineWidth = 1.5
      for (const x of [xL, xR]) {
        ctx.beginPath()
        ctx.moveTo(x, gy - 6)
        ctx.lineTo(x, gy + 6)
        ctx.stroke()
      }
      ctx.setLineDash([3, 3])
      ctx.strokeStyle = 'rgba(255, 180, 120, 0.5)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(xL, gy)
      ctx.lineTo(xR, gy)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = 'rgba(255, 200, 140, 0.95)'
      ctx.font = '600 10px Consolas, monospace'
      ctx.textAlign = 'center'
      ctx.fillText(`有效半径 ${blastR}m（向外衰减）`, cx, gy + 16)
      ctx.textAlign = 'left'
    } else {
      ctx.setLineDash([3, 3])
      ctx.strokeStyle = 'rgba(255, 180, 120, 0.75)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(cx + rEdge, cy)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = 'rgba(255, 200, 140, 0.95)'
      ctx.font = '600 10px Consolas, monospace'
      ctx.fillText(`R=${blastR}m`, cx + rEdge * 0.35, cy - 5)
    }

    ctx.fillStyle = '#ff6b4a'
    ctx.beginPath()
    ctx.arc(cx, cy, 4, 0, Math.PI * 2)
    ctx.fill()

    const tagY = cy - rEdge - 6
    ctx.font = '600 10px Segoe UI, Microsoft YaHei, sans-serif'
    ctx.fillStyle = 'rgba(255, 180, 120, 0.95)'
    ctx.fillText(
      `杀伤半径 ${blastR}m${blast.air ? ' · 空爆' : ''} · 中心高伤→边缘衰减`,
      cx - 72,
      tagY,
    )
    if (hud.selfHit) {
      ctx.fillStyle = 'rgba(255, 100, 90, 0.95)'
      ctx.font = '700 11px Segoe UI, Microsoft YaHei, sans-serif'
      ctx.fillText('⚠ 自伤范围内', cx - 36, tagY - 14)
    }
  }

  {
    const gx = tx(targetM)
    ctx.setLineDash([4, 4])
    ctx.strokeStyle = 'rgba(120, 180, 255, 0.55)'
    ctx.beginPath()
    ctx.moveTo(gx, originY)
    ctx.lineTo(gx, originY + usedH)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = 'rgba(160, 200, 255, 0.85)'
    ctx.font = '11px Consolas, monospace'
    ctx.fillText(`目标 ${targetM.toFixed(0)}m`, gx + 4, originY + 12)
  }

  ctx.restore()
  return hud
}
