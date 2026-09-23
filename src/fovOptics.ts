/**
 * 仰角遮罩刻度：
 * - full（默认）：整段 −30°～80° 均分，对照弹道尺读角
 * - optical：y∝tan(α)，只覆盖当前 FOV 半高（约 ±34°），用地平线读角
 */

export type MaskMode = 'full' | 'optical'

export interface FovMaskConfig {
  hFovDeg: number
  aspect: number
  mode: MaskMode
  /** 全角模式上下限 */
  fullMinDeg: number
  fullMaxDeg: number
}

export const DEFAULT_MASK_CONFIG: FovMaskConfig = {
  hFovDeg: 100,
  aspect: 16 / 9,
  mode: 'full',
  fullMinDeg: -30,
  fullMaxDeg: 80,
}

export function verticalFovDeg(hFovDeg: number, aspect: number): number {
  const h = (hFovDeg * Math.PI) / 180
  const v = 2 * Math.atan(Math.tan(h / 2) / Math.max(1e-6, aspect))
  return (v * 180) / Math.PI
}

export function halfViewPitchDeg(cfg: FovMaskConfig): number {
  return verticalFovDeg(cfg.hFovDeg, cfg.aspect) / 2
}

/** α → 画布 Y（上小下大）；full 线性，optical 为 tan 投影 */
export function pitchToCanvasY(alphaDeg: number, cfg: FovMaskConfig, height: number): number {
  const pad = 10
  const usable = Math.max(1, height - pad * 2)
  if (cfg.mode === 'full') {
    const t = (cfg.fullMaxDeg - alphaDeg) / (cfg.fullMaxDeg - cfg.fullMinDeg)
    return pad + t * usable
  }
  const half = halfViewPitchDeg(cfg)
  const a = (alphaDeg * Math.PI) / 180
  const h = (half * Math.PI) / 180
  const yNorm = -Math.tan(a) / Math.tan(h) // 上为负
  return height / 2 + (yNorm * height) / 2
}

export function tickList(cfg: FovMaskConfig, step: number): number[] {
  if (cfg.mode === 'full') {
    const out: number[] = []
    const start = Math.ceil(cfg.fullMinDeg / step) * step
    for (let a = start; a <= cfg.fullMaxDeg + 1e-9; a += step) out.push(a)
    return out
  }
  const half = halfViewPitchDeg(cfg)
  const max = Math.min(40, half - 0.05)
  const out: number[] = []
  for (let a = -Math.floor(max / step) * step; a <= max + 1e-9; a += step) {
    if (Math.abs(a) <= half - 0.01) out.push(Number(a.toFixed(4)))
  }
  return out
}
