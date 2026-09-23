import {
  AUTHOR_TABLE,
  findMaxRangeAngle,
  rangeAtAngle,
  resolveH0Author,
  solveAnglesForRange,
  type ThrowParams,
} from './physics'
import { V_MOVE_CROUCH, V_MOVE_PRONE, V_MOVE_STAND } from './actionModes'
import { solveAllActionOptions } from './options'

const authorParams: ThrowParams = {
  actionId: 'stand_still',
  heightMode: 'author',
}

function approx(a: number, b: number, tol: number): boolean {
  return Math.abs(a - b) <= tol
}

let failed = 0
function check(label: string, ok: boolean, detail = ''): void {
  if (!ok) {
    failed++
    console.error('FAIL', label, detail)
  } else {
    console.log('OK  ', label, detail)
  }
}

check('h0 switch', resolveH0Author(44.9) === 0.3 && resolveH0Author(45) === 1.8)
check('移速常量', V_MOVE_PRONE === 1.15 && V_MOVE_CROUCH === 2.3 && V_MOVE_STAND === 3.8)

for (const row of AUTHOR_TABLE) {
  const r = rangeAtAngle(row.alpha, authorParams)
  check(
    `α=${row.alpha}`,
    approx(r.range, row.range, 0.02) && approx(r.flightTime, row.time, 0.01),
    `${r.range.toFixed(3)}m ${r.flightTime.toFixed(4)}s`,
  )
}

const maxP = findMaxRangeAngle(authorParams)
check(
  '最远 ~37.4° / 74.69m',
  approx(maxP.alpha, 37.38, 0.5) && approx(maxP.result.range, 74.69, 0.05),
  `${maxP.alpha.toFixed(2)}° ${maxP.result.range.toFixed(2)}m`,
)

const s72 = (id: Parameters<typeof solveAnglesForRange>[1]['actionId']) =>
  solveAnglesForRange(72, { actionId: id, heightMode: 'action' }).low!

check('72 站静 α≈27°', approx(s72('stand_still').alpha, 27, 1))
check('72 蹲走 α≈22°', approx(s72('crouch_move').alpha, 22.1, 1))
check('72 站走 α≈18.6°', approx(s72('stand_move').alpha, 18.6, 1.2))
check('72 原地跳 α≈24.5°', approx(s72('jump_still').alpha, 24.5, 2))
check('72 前跳 α≈15°', approx(s72('jump_move').alpha, 15, 3), `α=${s72('jump_move').alpha.toFixed(1)}`)

const prone45 = rangeAtAngle(45, { actionId: 'prone_still', heightMode: 'action' })
check('72 趴静满 45° ~72.1m', approx(prone45.range, 72.08, 0.2))

const opts72 = solveAllActionOptions(72)
check(
  '72m 含跳投精选',
  opts72.some((o) => o.actionId === 'jump_still' && o.featured) &&
    opts72.some((o) => o.actionId === 'jump_move' && o.featured),
  opts72
    .filter((o) => o.featured)
    .map((o) => `${o.stance}${o.motion}@${o.alpha.toFixed(0)}`)
    .join(' | '),
)
check('72m 列结构 stance/motion/effect', !!opts72[0]?.stance && !!opts72[0]?.motion && !!opts72[0]?.effect)

const opts75 = solveAllActionOptions(75)
check(
  '75m 默认关落地弹地：无趴静弹地虚报',
  !opts75.some((o) => o.actionId === 'prone_still'),
  opts75.map((o) => o.motion).join(','),
)
check(
  '75m 默认关落地弹地：仍含跳投直达',
  opts75.some((o) => o.actionId === 'jump_still'),
  opts75.map((o) => o.motion).join(','),
)

const opts75bounce = solveAllActionOptions(75, 0, 'action', true)
check(
  '75m 开落地弹地：瞄 ~72 落地',
  opts75bounce.some(
    (o) => o.actionId === 'stand_still' && Math.abs(o.range - 72) < 1.5,
  ),
  opts75bounce
    .filter((o) => o.featured)
    .map((o) => `${o.motion}@${o.range.toFixed(0)}`)
    .join(','),
)
check(
  '75m 开落地弹地：含站静/趴静',
  opts75bounce.some((o) => o.actionId === 'stand_still') &&
    opts75bounce.some((o) => o.actionId === 'prone_still'),
  opts75bounce.map((o) => o.motion).join(','),
)

const opts90 = solveAllActionOptions(90)
check(
  '90m 含站走+前跳',
  opts90.some((o) => o.actionId === 'stand_move') && opts90.some((o) => o.actionId === 'jump_move'),
  opts90.map((o) => `${o.motion}@${o.alpha.toFixed(0)}`).join(','),
)

const proneStill = rangeAtAngle(45, { actionId: 'prone_still', heightMode: 'action' })
const proneMove = rangeAtAngle(45, { actionId: 'prone_move', heightMode: 'action' })
check('趴爬 > 趴静', proneMove.range > proneStill.range + 3)

if (failed) throw new Error(`${failed} checks failed`)
console.log('\nAll checks passed')
