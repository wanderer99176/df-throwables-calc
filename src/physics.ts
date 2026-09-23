/** 《三角洲行动》投掷物弹道 — 动作状态驱动 */

export const V0 = 27
export const G = 9.8
export const THETA_OFFSET_DEG = 7.5

export const H0_SWITCH_ALPHA = 45
export const H0_PRONE = 0.3
export const H0_STAND = 1.8

export const LUNA_FUSE_S = 5.0
export const LUNA_AIRBURST_S = 4.7
export const LUNA_BOUNCE_S = 0.3
export const LUNA_BOUNCE_M = 3

import { type ActionModeId, getActionMode } from './actionModes'

export type HeightMode = 'action' | 'author'

export interface ThrowParams {
  actionId: ActionModeId
  heightMode: HeightMode
  /** 落点相对高度：正=目标更高 */
  deltaH?: number
  v0?: number
  offsetDeg?: number
  /** 覆盖动作默认移速/高度（一般不用） */
  vMove?: number
  h0?: number
}

export interface BallisticResult {
  alpha: number
  theta: number
  range: number
  flightTime: number
  h0: number
  vMove: number
  deltaH: number
  actionId: ActionModeId
}

export function deg2rad(d: number): number {
  return (d * Math.PI) / 180
}

export function resolveH0(alphaDeg: number, params: ThrowParams): number {
  if (params.h0 !== undefined) return params.h0
  if (params.heightMode === 'author') {
    return alphaDeg < H0_SWITCH_ALPHA ? H0_PRONE : H0_STAND
  }
  return getActionMode(params.actionId).h0
}

export function resolveVMove(params: ThrowParams): number {
  if (params.vMove !== undefined) return params.vMove
  return getActionMode(params.actionId).vMove
}

export function maxAlphaFor(params: ThrowParams): number {
  if (params.heightMode === 'author') return 79.5
  return getActionMode(params.actionId).maxAlpha
}

export function minAlpha(): number {
  return -30
}

export function rangeAtAngle(alphaDeg: number, params: ThrowParams): BallisticResult {
  const h0 = resolveH0(alphaDeg, params)
  const vMove = resolveVMove(params)
  const deltaH = params.deltaH ?? 0
  const v0 = params.v0 ?? V0
  const offset = params.offsetDeg ?? THETA_OFFSET_DEG
  const thetaDeg = alphaDeg + offset
  const theta = deg2rad(thetaDeg)

  const vy = v0 * Math.sin(theta)
  const vx = v0 * Math.cos(theta) + vMove
  const drop = h0 - deltaH
  const disc = vy * vy + 2 * G * drop

  let flightTime = 0
  let range = 0
  if (disc >= 0 && Math.abs(vx) > 1e-9) {
    flightTime = (vy + Math.sqrt(disc)) / G
    if (flightTime < 0) flightTime = 0
    range = vx * flightTime
  }

  return {
    alpha: alphaDeg,
    theta: thetaDeg,
    range,
    flightTime,
    h0,
    vMove,
    deltaH,
    actionId: params.actionId,
  }
}

export function findMaxRangeAngle(params: ThrowParams): { alpha: number; result: BallisticResult } {
  const lo = minAlpha()
  const hi = Math.min(maxAlphaFor(params), 44.99)
  let a = lo
  let b = Math.max(lo + 1, hi)
  for (let i = 0; i < 60; i++) {
    const m1 = a + (b - a) / 3
    const m2 = b - (b - a) / 3
    if (rangeAtAngle(m1, params).range < rangeAtAngle(m2, params).range) a = m1
    else b = m2
  }
  const alpha = (a + b) / 2
  return { alpha, result: rangeAtAngle(alpha, params) }
}

export interface AngleSolutions {
  low: BallisticResult | null
  high: BallisticResult | null
  maxRange: BallisticResult
  maxRangeAlpha: number
  unreachable: boolean
}

export function solveAnglesForRange(targetM: number, params: ThrowParams): AngleSolutions {
  const { alpha: maxA, result: maxR } = findMaxRangeAngle(params)
  const hiLimit = maxAlphaFor(params)
  const loLimit = minAlpha()

  let globalMax = maxR
  let globalMaxA = maxA
  for (const a of [45, 50, 60, 70, hiLimit]) {
    if (a > hiLimit + 1e-6) continue
    const r = rangeAtAngle(Math.min(a, hiLimit), params)
    if (r.range > globalMax.range) {
      globalMax = r
      globalMaxA = a
    }
  }

  if (targetM > globalMax.range + 0.15) {
    return {
      low: null,
      high: null,
      maxRange: globalMax,
      maxRangeAlpha: globalMaxA,
      unreachable: true,
    }
  }

  const f = (a: number) => rangeAtAngle(a, params).range - targetM

  const findRoot = (a0: number, a1: number): number | null => {
    let lo = a0
    let hi = a1
    let flo = f(lo)
    let fhi = f(hi)
    if (Math.abs(flo) < 0.08) return lo
    if (Math.abs(fhi) < 0.08) return hi
    if (flo * fhi > 0) {
      const steps = 120
      let found = false
      for (let i = 0; i < steps; i++) {
        const x0 = a0 + ((a1 - a0) * i) / steps
        const x1 = a0 + ((a1 - a0) * (i + 1)) / steps
        const fx0 = f(x0)
        const fx1 = f(x1)
        if (fx0 * fx1 <= 0) {
          lo = x0
          hi = x1
          flo = fx0
          fhi = fx1
          found = true
          break
        }
      }
      if (!found) return null
    }
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2
      const fm = f(mid)
      if (Math.abs(fm) < 1e-4) return mid
      if (flo * fm <= 0) {
        hi = mid
        fhi = fm
      } else {
        lo = mid
        flo = fm
      }
    }
    return (lo + hi) / 2
  }

  const lowA = findRoot(loLimit, maxA)
  let highA =
    findRoot(maxA, Math.min(H0_SWITCH_ALPHA - 1e-4, hiLimit)) ??
    findRoot(H0_SWITCH_ALPHA, hiLimit)

  if (hiLimit <= 45 + 1e-6 && highA !== null && highA > 45) {
    highA = findRoot(maxA, 45)
  }

  return {
    low: lowA !== null ? rangeAtAngle(lowA, params) : null,
    high: highA !== null ? rangeAtAngle(highA, params) : null,
    maxRange: maxR,
    maxRangeAlpha: maxA,
    unreachable: false,
  }
}

export function resolveH0Author(alphaDeg: number): number {
  return alphaDeg < H0_SWITCH_ALPHA ? H0_PRONE : H0_STAND
}

export const AUTHOR_TABLE: Array<{ alpha: number; range: number; time: number }> = [
  { alpha: 20.0, range: 61.506, time: 2.5682 },
  { alpha: 22.5, range: 64.937, time: 2.7771 },
  { alpha: 25.0, range: 67.886, time: 2.9812 },
  { alpha: 27.5, range: 70.327, time: 3.1798 },
  { alpha: 30.0, range: 72.242, time: 3.3726 },
  { alpha: 32.5, range: 73.613, time: 3.5591 },
  { alpha: 35.0, range: 74.431, time: 3.739 },
  { alpha: 37.5, range: 74.687, time: 3.912 },
  { alpha: 40.0, range: 74.379, time: 4.0776 },
  { alpha: 42.5, range: 73.509, time: 4.2355 },
  { alpha: 45.0, range: 73.209, time: 4.454 },
  { alpha: 47.5, range: 71.14, time: 4.5937 },
  { alpha: 50.0, range: 68.546, time: 4.725 },
  { alpha: 52.5, range: 65.445, time: 4.8478 },
  { alpha: 55.0, range: 61.858, time: 4.9616 },
  { alpha: 57.5, range: 57.812, time: 5.0664 },
  { alpha: 60.0, range: 53.335, time: 5.1619 },
  { alpha: 62.5, range: 48.462, time: 5.2479 },
  { alpha: 65.0, range: 43.227, time: 5.3242 },
  { alpha: 67.5, range: 37.67, time: 5.3906 },
  { alpha: 70.0, range: 31.832, time: 5.447 },
  { alpha: 72.5, range: 25.756, time: 5.4934 },
  { alpha: 75.0, range: 19.487, time: 5.5295 },
  { alpha: 77.5, range: 13.073, time: 5.5554 },
  { alpha: 79.5, range: 7.869, time: 5.5686 },
]
