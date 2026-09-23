/**
 * 屏幕光学仰角遮罩：y ∝ tan(α)
 * 准星恒在屏心；抬头 α 时，地平线落到「−α」刻度 → 当前仰角即为 α。
 */

export interface FovMaskConfig {
  /** 水平 FOV（度），游戏设置 */
  hFovDeg: number
  /** 宽/高，例如 16/9；竖屏 9/16 */
  aspect: number
  /** 刻度最大标注到的仰角（不超过可视半高） */
  labelMaxDeg: number
}

export const DEFAULT_MASK_CONFIG: FovMaskConfig = {
  hFovDeg: 100,
  aspect: 16 / 9,
  labelMaxDeg: 40,
}

export function verticalFovDeg(hFovDeg: number, aspect: number): number {
  const h = (hFovDeg * Math.PI) / 180
  const v = 2 * Math.atan(Math.tan(h / 2) / Math.max(1e-6, aspect))
  return (v * 180) / Math.PI
}

/** 半屏可视仰角（度）≈ ±vFOV/2 */
export function halfViewPitchDeg(cfg: FovMaskConfig): number {
  return verticalFovDeg(cfg.hFovDeg, cfg.aspect) / 2
}

/**
 * 仰角 α（上为正）→ 相对屏心的归一化 Y（上为负，与 CSS/canvas 一致）
 * yNorm ∈ [-1,1] 对应屏顶/屏底
 */
export function pitchToYNorm(alphaDeg: number, cfg: FovMaskConfig): number {
  const half = halfViewPitchDeg(cfg)
  const a = (alphaDeg * Math.PI) / 180
  const h = (half * Math.PI) / 180
  return -Math.tan(a) / Math.tan(h)
}

export function yNormToPitch(yNorm: number, cfg: FovMaskConfig): number {
  const half = halfViewPitchDeg(cfg)
  const h = (half * Math.PI) / 180
  const a = Math.atan(-yNorm * Math.tan(h))
  return (a * 180) / Math.PI
}

/** 等间隔仰角 → 屏上间距：近中心密、靠两端（大仰角）更疏（tan 投影） */
export function majorTicks(cfg: FovMaskConfig, step = 5): number[] {
  const half = halfViewPitchDeg(cfg)
  const max = Math.min(cfg.labelMaxDeg, Math.floor(half * 10) / 10 - 0.05)
  const out: number[] = []
  for (let a = -Math.floor(max / step) * step; a <= max + 1e-9; a += step) {
    if (Math.abs(a) <= half - 0.01) out.push(a)
  }
  return out
}

export function minorTicks(cfg: FovMaskConfig, step = 1): number[] {
  const half = halfViewPitchDeg(cfg)
  const max = Math.min(cfg.labelMaxDeg, half - 0.05)
  const out: number[] = []
  for (let a = -Math.floor(max); a <= max + 1e-9; a += step) {
    if (Math.abs(a) <= half - 0.01) out.push(a)
  }
  return out
}
