/**
 * 屏幕光学仰角遮罩：y ∝ tan(α)
 * 准星恒在屏心；抬头 α 时，地平线落到「−α」刻度 → 当前仰角即为 α。
 */

export interface FovMaskConfig {
  /** 水平 FOV（度），游戏设置 */
  hFovDeg: number
  /** 宽/高，例如 16/9；竖屏 9/16 */
  aspect: number
  /** 烟玻底色不透明度 0～1 */
  bgAlpha: number
  /** 刻度不透明度 0～1 */
  markAlpha: number
}

export const DEFAULT_MASK_CONFIG: FovMaskConfig = {
  hFovDeg: 100,
  aspect: 16 / 9,
  bgAlpha: 0.38,
  markAlpha: 1,
}

export function verticalFovDeg(hFovDeg: number, aspect: number): number {
  const h = (hFovDeg * Math.PI) / 180
  const v = 2 * Math.atan(Math.tan(h / 2) / Math.max(1e-6, aspect))
  return (v * 180) / Math.PI
}

export function halfViewPitchDeg(cfg: FovMaskConfig): number {
  return verticalFovDeg(cfg.hFovDeg, cfg.aspect) / 2
}

/** α → 画布 Y（上小下大），光学 tan 投影 */
export function pitchToCanvasY(alphaDeg: number, cfg: FovMaskConfig, height: number): number {
  const half = halfViewPitchDeg(cfg)
  const a = (alphaDeg * Math.PI) / 180
  const h = (half * Math.PI) / 180
  const yNorm = -Math.tan(a) / Math.tan(h)
  return height / 2 + (yNorm * height) / 2
}

export function tickList(cfg: FovMaskConfig, step: number): number[] {
  const half = halfViewPitchDeg(cfg)
  const max = Math.min(40, half - 0.05)
  const out: number[] = []
  for (let a = -Math.floor(max / step) * step; a <= max + 1e-9; a += step) {
    if (Math.abs(a) <= half - 0.01) out.push(Number(a.toFixed(4)))
  }
  return out
}

/** 滑块 0～100 → 窗口整体透明度（Electron setOpacity） */
export function sliderToWindowOpacity(slider: number): number {
  const t = Math.min(100, Math.max(0, slider)) / 100
  return 0.12 + 0.88 * t
}

/** 滑块 → 画布烟玻底 alpha */
export function sliderToBgAlpha(slider: number): number {
  const t = Math.min(100, Math.max(0, slider)) / 100
  return 0.04 + 0.42 * t
}
