/** 同爆点多动作方案：姿态 × 移动/动作，效果列在末 */

import {
  ACTION_MODES,
  type ActionModeId,
  type MotionLabel,
  type StanceLabel,
  getActionMode,
} from './actionModes'
import {
  LUNA_BOUNCE_M,
  type ThrowParams,
  rangeAtAngle,
  solveAnglesForRange,
} from './physics'

export interface ThrowOption {
  actionId: ActionModeId
  stance: StanceLabel
  motion: MotionLabel
  /** 实战效果 / 终端物理（末列） */
  effect: string
  alpha: number
  theta: number
  flightTime: number
  range: number
  vMove: number
  h0: number
  arc: 'low' | 'high'
  recommended?: boolean
  featured?: boolean
}

/** 表内枚举全部 8 种动作（含跳投） */
const ALL_IDS: ActionModeId[] = ACTION_MODES.map((m) => m.id)

function effectFor(
  declareM: number,
  landM: number,
  actionId: ActionModeId,
  arc: 'low' | 'high',
  alpha: number,
  bounceLand: boolean,
): string {
  const near72 = declareM >= 68 && declareM <= 73.5
  const near75 = declareM >= 74 && declareM <= 78
  const near83 = declareM >= 80 && declareM <= 86
  const near90 = declareM >= 86 && declareM <= 95

  if (near72 && actionId === 'prone_still' && Math.abs(alpha - 45) < 0.3) {
    return '头顶空爆：空中直接炸开，难以闪避'
  }
  if (bounceLand && near75) {
    switch (actionId) {
      case 'prone_still':
        return `落地约 ${landM.toFixed(0)}m + 弹地 ${LUNA_BOUNCE_M}m → 申报 ${declareM.toFixed(0)}m`
      case 'stand_still':
        return `落地约 ${landM.toFixed(0)}m 后弹地延伸至 ${declareM.toFixed(0)}m（拉栓即投）`
      case 'jump_still':
        return `跳投落地约 ${landM.toFixed(0)}m，弹地后约 ${declareM.toFixed(0)}m`
      case 'stand_move':
        return `站走落地约 ${landM.toFixed(0)}m，弹地延伸至 ${declareM.toFixed(0)}m`
      default:
        return `落地 ${landM.toFixed(0)}m + 弹地 → ${declareM.toFixed(0)}m`
    }
  }
  if (near72) {
    switch (actionId) {
      case 'stand_still':
        return bounceLand
          ? '实战最推荐；开落地弹地可延伸申报约 +3m'
          : '实战最推荐：出枪快，弧度平顺，约 72m 落地爆开'
      case 'crouch_move':
        return '借蹲走移速，掩体半隐蔽平弧压制'
      case 'stand_move':
        return '超低平弧直灌，预留避险时间极短'
      case 'jump_still':
        return '跳起避开前方低矮掩体/障碍物'
      case 'jump_move':
        return '极速冲跃平拉，飞行时间最短'
      case 'jump_run':
        return '跑跳极限平拉，飞行时间更短'
      case 'prone_move':
        return '趴爬微增初速微调落点'
      case 'prone_still':
        return '趴静低抛'
      case 'crouch_still':
        return '蹲静低抛'
      default:
        break
    }
  }
  if (near75) {
    switch (actionId) {
      case 'jump_still':
        return '跳起抬高抛点，直达落地爆开（不依赖弹地）'
      case 'stand_move':
        return '站走直达约 75m 落地爆开'
      default:
        break
    }
  }
  if (near83) {
    switch (actionId) {
      case 'crouch_move':
        return '蹲走中距拉扯，半隐蔽覆盖'
      case 'stand_move':
        return '站姿冲锋压制'
      case 'jump_move':
        return '前跳叠高度与移速，进一步延程'
      case 'jump_run':
        return '跑跳叠冲刺与高度，极限延程'
      case 'prone_move':
        return '趴爬极限约 79m，略短于 83'
      default:
        break
    }
  }
  if (near90) {
    switch (actionId) {
      case 'stand_move':
        return '站走 +3.8 m/s，极限约 88～90m'
      case 'jump_move':
        return '走跳 +3.8 m/s，可冲破 92～95m'
      case 'jump_run':
        return '跑跳 +5.5 m/s，极限延程更远'
      default:
        break
    }
  }

  const mode = getActionMode(actionId)
  if (arc === 'high') return `${mode.stance}${mode.motion}·高抛`
  return `${mode.stance}${mode.motion}`
}

function pushOption(
  out: ThrowOption[],
  mode: (typeof ACTION_MODES)[0],
  r: { alpha: number; theta: number; flightTime: number; range: number; vMove: number; h0: number },
  declareM: number,
  arc: 'low' | 'high',
  bounceLand: boolean,
): void {
  out.push({
    actionId: mode.id,
    stance: mode.stance,
    motion: mode.motion,
    effect: effectFor(declareM, r.range, mode.id, arc, r.alpha, bounceLand),
    alpha: r.alpha,
    theta: r.theta,
    flightTime: r.flightTime,
    range: r.range,
    vMove: r.vMove,
    h0: r.h0,
    arc,
  })
}

/**
 * 同一申报距离下枚举动作。
 * bounceLand 开启：瞄准落地 = 申报 − 3m（拉栓即投弹地延伸），否则瞄准落地 = 申报（掐雷落地炸）。
 */
export function solveAllActionOptions(
  targetM: number,
  deltaH = 0,
  heightMode: ThrowParams['heightMode'] = 'action',
  bounceLand = false,
  ballistic: Pick<ThrowParams, 'v0' | 'offsetDeg'> = {},
): ThrowOption[] {
  const out: ThrowOption[] = []
  const tol = 1.5
  const declareM = targetM
  const aimLand = bounceLand ? Math.max(1, declareM - LUNA_BOUNCE_M) : declareM
  const near72 = declareM >= 68 && declareM <= 73.5
  const near75 = declareM >= 74 && declareM <= 78
  const near83 = declareM >= 80 && declareM <= 86
  const near90 = declareM >= 86 && declareM <= 95
  const aimNear72 = aimLand >= 68 && aimLand <= 73.5

  for (const mode of ACTION_MODES) {
    if (!ALL_IDS.includes(mode.id)) continue

    const params: ThrowParams = {
      actionId: mode.id,
      heightMode,
      deltaH,
      ...ballistic,
    }
    const sol = solveAnglesForRange(aimLand, params)
    if (sol.unreachable) {
      if (bounceLand && near75 && mode.id === 'prone_still') {
        const at45 = rangeAtAngle(45, params)
        if (Math.abs(at45.range - aimLand) <= tol + 0.5) {
          pushOption(out, mode, at45, declareM, 'high', bounceLand)
        }
      }
      continue
    }

    if (sol.low && Math.abs(sol.low.range - aimLand) <= tol) {
      pushOption(out, mode, sol.low, declareM, 'low', bounceLand)
    }

    if (mode.id === 'prone_still' && (aimNear72 || (bounceLand && near75))) {
      const at45 = rangeAtAngle(45, params)
      if (Math.abs(at45.range - aimLand) <= tol) {
        const exists = out.some(
          (o) => o.actionId === mode.id && Math.abs(o.alpha - 45) < 0.2,
        )
        if (!exists) pushOption(out, mode, at45, declareM, 'high', bounceLand)
      }
    }

    if (
      near90 &&
      !bounceLand &&
      sol.high &&
      Math.abs(sol.high.range - aimLand) <= tol &&
      (mode.id === 'stand_move' || mode.id === 'jump_move' || mode.id === 'jump_run')
    ) {
      const exists = out.some(
        (o) => o.actionId === mode.id && o.arc === 'high',
      )
      if (!exists) pushOption(out, mode, sol.high, declareM, 'high', bounceLand)
    }

    if (!sol.low && sol.high && Math.abs(sol.high.range - aimLand) <= tol) {
      pushOption(out, mode, sol.high, declareM, 'high', bounceLand)
    }
  }

  const pickFeatured = (o: ThrowOption): boolean => {
    if (bounceLand && near75) {
      if (o.actionId === 'stand_still' && o.arc === 'low') return true
      if (o.actionId === 'prone_still' && Math.abs(o.alpha - 45) < 0.3) return true
      if (o.actionId === 'jump_still' && o.arc === 'low') return true
      if (o.actionId === 'stand_move' && o.arc === 'low') return true
      return false
    }
    if (near72) {
      if (o.actionId === 'stand_still' && o.arc === 'low') return true
      if (o.actionId === 'crouch_move' && o.arc === 'low') return true
      if (o.actionId === 'stand_move' && o.arc === 'low') return true
      if (o.actionId === 'prone_still' && Math.abs(o.alpha - 45) < 0.3) return true
      if (o.actionId === 'jump_still' && o.arc === 'low') return true
      if (o.actionId === 'jump_move' && o.arc === 'low') return true
      if (o.actionId === 'jump_run' && o.arc === 'low') return true
      return false
    }
    if (near75) {
      if (o.actionId === 'jump_still' && o.arc === 'low') return true
      if (o.actionId === 'stand_move' && o.arc === 'low') return true
      return false
    }
    if (near83) {
      return (
        (o.actionId === 'stand_move' ||
          o.actionId === 'crouch_move' ||
          o.actionId === 'jump_move' ||
          o.actionId === 'jump_run') &&
        o.arc === 'low'
      )
    }
    if (near90) {
      return (
        o.actionId === 'stand_move' ||
        o.actionId === 'jump_move' ||
        o.actionId === 'jump_run'
      )
    }
    return false
  }

  for (const o of out) o.featured = pickFeatured(o)

  if (!near72 && !near75 && !near83 && !near90 && out.length) {
    const slowest = [...out].sort((a, b) => b.flightTime - a.flightTime).slice(0, 4)
    for (const o of slowest) o.featured = true
  }

  out.sort((a, b) => b.flightTime - a.flightTime)

  if (out.length) {
    if (bounceLand && near75) {
      const prone = out.find(
        (o) => o.actionId === 'prone_still' && Math.abs(o.alpha - 45) < 0.3,
      )
      const standStill = out.find((o) => o.actionId === 'stand_still' && o.arc === 'low')
      if (standStill) standStill.recommended = true
      else if (prone) prone.recommended = true
      else {
        const featured = out.find((o) => o.featured)
        if (featured) featured.recommended = true
        else out[0].recommended = true
      }
    } else {
      const standStill = out.find((o) => o.actionId === 'stand_still' && o.arc === 'low')
      const standMove = out.find((o) => o.actionId === 'stand_move' && o.arc === 'low')
      const featured = out.find((o) => o.featured)
      if (standStill) standStill.recommended = true
      else if (standMove) standMove.recommended = true
      else if (featured) featured.recommended = true
      else out[0].recommended = true
    }
  }

  return out
}

export function optionKey(o: ThrowOption): string {
  return `${o.actionId}-${o.arc}-${o.alpha.toFixed(1)}`
}
