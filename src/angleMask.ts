/**
 * 纯光学仰角遮罩：无按钮、无跟随、不抢鼠标（由 Electron 全程点穿）。
 * 用法：准星对准地平线附近时，看地平线落在哪条刻度 → 当前仰角；
 * 或抬头直到地平线对齐目标 −α 刻度。
 */

import {
  DEFAULT_MASK_CONFIG,
  type FovMaskConfig,
  halfViewPitchDeg,
  majorTicks,
  minorTicks,
  pitchToYNorm,
  verticalFovDeg,
} from './fovOptics'
import './style.css'

const LS_HFOV = 'df-mask-hfov'
const LS_ASPECT = 'df-mask-aspect'

function loadConfig(): FovMaskConfig {
  const hf = Number(localStorage.getItem(LS_HFOV))
  const asp = Number(localStorage.getItem(LS_ASPECT))
  return {
    hFovDeg: Number.isFinite(hf) && hf > 10 && hf < 170 ? hf : DEFAULT_MASK_CONFIG.hFovDeg,
    aspect: Number.isFinite(asp) && asp > 0.3 && asp < 4 ? asp : DEFAULT_MASK_CONFIG.aspect,
    labelMaxDeg: DEFAULT_MASK_CONFIG.labelMaxDeg,
  }
}

function formatAspect(a: number): string {
  if (Math.abs(a - 16 / 9) < 0.02) return '16:9'
  if (Math.abs(a - 9 / 16) < 0.02) return '9:16'
  if (Math.abs(a - 21 / 9) < 0.05) return '21:9'
  return a.toFixed(3)
}

export function mountAngleMask(): void {
  document.body.classList.add('desktop', 'angle-mask')
  document.title = 'DF仰角遮罩'

  const app = document.querySelector<HTMLDivElement>('#app')!
  app.innerHTML = `
    <div class="mask-root">
      <canvas id="mask-canvas"></canvas>
      <div class="mask-meta" id="mask-meta"></div>
    </div>
  `

  const canvas = document.querySelector<HTMLCanvasElement>('#mask-canvas')!
  const meta = document.querySelector<HTMLElement>('#mask-meta')!
  let cfg = loadConfig()

  const paint = () => {
    cfg = loadConfig()
    const wrap = canvas.parentElement!
    const W = Math.max(1, Math.floor(wrap.clientWidth))
    const H = Math.max(1, Math.floor(wrap.clientHeight))
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.floor(W * dpr)
    canvas.height = Math.floor(H * dpr)
    canvas.style.width = `${W}px`
    canvas.style.height = `${H}px`
    const ctx = canvas.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, W, H)

    const half = halfViewPitchDeg(cfg)
    const vFov = verticalFovDeg(cfg.hFovDeg, cfg.aspect)
    meta.textContent = `FOV ${cfg.hFovDeg}° · ${formatAspect(cfg.aspect)} · v≈${vFov.toFixed(0)}° · ±${half.toFixed(0)}°`

    // 烟玻底
    ctx.fillStyle = 'rgba(8, 14, 22, 0.38)'
    ctx.fillRect(0, 0, W, H)

    const cx = 28
    const yOf = (alpha: number) => {
      const yn = pitchToYNorm(alpha, cfg)
      return H / 2 + (yn * H) / 2
    }

    // 轴
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(cx, 8)
    ctx.lineTo(cx, H - 8)
    ctx.stroke()

    // 0° 红线
    const y0 = yOf(0)
    ctx.strokeStyle = 'rgba(255, 80, 80, 0.95)'
    ctx.lineWidth = 2
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.moveTo(8, y0)
    ctx.lineTo(W - 8, y0)
    ctx.stroke()

    ctx.fillStyle = 'rgba(255,120,120,0.95)'
    ctx.font = '600 12px "Segoe UI","Microsoft YaHei UI",sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('0°', cx + 10, y0 - 4)

    // 次刻度
    for (const a of minorTicks(cfg, 1)) {
      if (a % 5 === 0) continue
      const y = yOf(a)
      if (y < 6 || y > H - 6) continue
      ctx.strokeStyle = 'rgba(255,255,255,0.28)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(cx - 4, y)
      ctx.lineTo(cx + 4, y)
      ctx.stroke()
    }

    // 主刻度 + 标注
    ctx.font = '600 13px "Segoe UI","Microsoft YaHei UI",sans-serif'
    for (const a of majorTicks(cfg, 5)) {
      if (a === 0) continue
      const y = yOf(a)
      if (y < 10 || y > H - 10) continue
      const major = Math.abs(a) % 10 === 0
      ctx.strokeStyle = major ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.45)'
      ctx.lineWidth = major ? 1.5 : 1
      ctx.beginPath()
      ctx.moveTo(cx - (major ? 9 : 6), y)
      ctx.lineTo(cx + (major ? 9 : 6), y)
      ctx.stroke()

      ctx.fillStyle = a > 0 ? 'rgba(109,255,154,0.95)' : 'rgba(126,200,255,0.9)'
      ctx.textAlign = 'left'
      const label = `${a > 0 ? '+' : ''}${a}°`
      ctx.fillText(label, cx + 12, y + 4)
    }

    ctx.fillStyle = 'rgba(200,210,220,0.55)'
    ctx.font = '11px "Segoe UI","Microsoft YaHei UI",sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('地平线↓ = 已抬头', 8, H - 14)
  }

  paint()
  window.addEventListener('resize', paint)
  window.setInterval(paint, 1500)
}
