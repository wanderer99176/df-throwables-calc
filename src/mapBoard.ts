/**
 * 俯视图：爆点中心 + 我的位置 + 多层最大射程圈。
 * 标定比例尺后，两点间距同步到上方「目标距离 / 同爆点多方案」。
 */

import { MAP_RING_LAYERS, maxRangeForAction, type MapRingLayer } from './mapRings'

const MAP_ASSET_REV = 2
const MAP_REV1_TO_REV2_SHRINK = 0.9

const LS_SCALE = `df-map-meters-per-px-v${MAP_ASSET_REV}`
const LS_CENTER = `df-map-center-v${MAP_ASSET_REV}`
const LS_SELF = `df-map-self-v${MAP_ASSET_REV}`
const LS_SCALE_LEGACY = 'df-map-meters-per-px'
const LS_CENTER_LEGACY = 'df-map-center'

type PlaceMode = 'blast' | 'self'
type CalibPhase = 'idle' | 'a' | 'b'
type Pt = { x: number; y: number }

export interface MapBoardHandle {
  setDeltaH: (dh: number) => void
  redraw: () => void
  reset: () => void
  destroy: () => void
}

export interface MapBoardOptions {
  /** 爆点↔我所在位置 的水平距离（米）；清除时为 null */
  onThrowDistance?: (distanceM: number | null) => void
}

interface BoardState {
  metersPerPx: number | null
  center: Pt | null
  self: Pt | null
  activeLayers: Set<string>
  deltaH: number
  placeMode: PlaceMode
}

function loadScale(): number | null {
  const raw = localStorage.getItem(LS_SCALE)
  if (raw) {
    const n = Number(raw)
    if (Number.isFinite(n) && n > 0) return n
  }
  const legacy = localStorage.getItem(LS_SCALE_LEGACY)
  if (legacy) {
    const old = Number(legacy)
    if (Number.isFinite(old) && old > 0) {
      const migrated = old / MAP_REV1_TO_REV2_SHRINK
      localStorage.setItem(LS_SCALE, String(migrated))
      localStorage.removeItem(LS_SCALE_LEGACY)
      localStorage.removeItem(LS_CENTER_LEGACY)
      return migrated
    }
  }
  return null
}

function saveScale(v: number | null): void {
  if (v == null) localStorage.removeItem(LS_SCALE)
  else localStorage.setItem(LS_SCALE, String(v))
}

function loadPt(key: string): Pt | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const o = JSON.parse(raw) as Pt
    if (Number.isFinite(o.x) && Number.isFinite(o.y)) return o
  } catch {
    /* ignore */
  }
  return null
}

function savePt(key: string, c: Pt | null): void {
  if (!c) localStorage.removeItem(key)
  else localStorage.setItem(key, JSON.stringify(c))
}

function distM(a: Pt, b: Pt, metersPerPx: number): number {
  return Math.hypot(a.x - b.x, a.y - b.y) * metersPerPx
}

export function mountMapBoard(
  root: HTMLElement,
  opts: MapBoardOptions = {},
): MapBoardHandle {
  const canvas = root.querySelector<HTMLCanvasElement>('#map-canvas')
  const statusEl = root.querySelector<HTMLElement>('#map-status')
  const layerBox = root.querySelector<HTMLElement>('#map-layers')
  const btnCalib = root.querySelector<HTMLButtonElement>('#map-calib')
  const btnClear = root.querySelector<HTMLButtonElement>('#map-clear')
  const btnReset = root.querySelector<HTMLButtonElement>('#map-reset')
  const btnModeBlast = root.querySelector<HTMLButtonElement>('#map-mode-blast')
  const btnModeSelf = root.querySelector<HTMLButtonElement>('#map-mode-self')
  const scaleInput = root.querySelector<HTMLInputElement>('#map-scale-m')

  if (!canvas || !statusEl || !layerBox) {
    return {
      setDeltaH: () => {},
      redraw: () => {},
      reset: () => {},
      destroy: () => {},
    }
  }

  const img = new Image()
  img.src = '/maps/dam-blueprint.png'

  const state: BoardState = {
    metersPerPx: loadScale(),
    center: loadPt(LS_CENTER),
    self: loadPt(LS_SELF),
    activeLayers: new Set(
      MAP_RING_LAYERS.filter((l) => l.defaultOn).map((l) => l.id),
    ),
    deltaH: 0,
    placeMode: 'blast',
  }

  let calib: CalibPhase = 'idle'
  let calibA: Pt | null = null
  let destroyed = false

  const emitDistance = (): void => {
    if (
      state.center &&
      state.self &&
      state.metersPerPx != null &&
      Number.isFinite(state.metersPerPx)
    ) {
      opts.onThrowDistance?.(distM(state.center, state.self, state.metersPerPx))
    } else {
      opts.onThrowDistance?.(null)
    }
  }

  const syncModeButtons = (): void => {
    btnModeBlast?.classList.toggle('active', state.placeMode === 'blast')
    btnModeSelf?.classList.toggle('active', state.placeMode === 'self')
    if (btnModeSelf) btnModeSelf.disabled = !state.center
  }

  const syncLayerChecks = (): void => {
    for (const layer of MAP_RING_LAYERS) {
      const input = layerBox.querySelector<HTMLInputElement>(
        `input[data-layer="${layer.id}"]`,
      )
      if (input) input.checked = state.activeLayers.has(layer.id)
    }
  }

  layerBox.innerHTML = MAP_RING_LAYERS.map((layer) => {
    const checked = state.activeLayers.has(layer.id) ? 'checked' : ''
    const { rangeM } = maxRangeForAction(layer.actionId, state.deltaH)
    return `<label class="map-layer" style="--ring:${layer.stroke}">
      <input type="checkbox" data-layer="${layer.id}" ${checked} />
      <span class="map-layer-swatch"></span>
      <span>${layer.label} <em>${rangeM.toFixed(0)}m</em></span>
    </label>`
  }).join('')

  const refreshLayerLabels = (): void => {
    for (const layer of MAP_RING_LAYERS) {
      const em = layerBox
        .querySelector(`input[data-layer="${layer.id}"]`)
        ?.parentElement?.querySelector('em')
      if (!em) continue
      const { rangeM } = maxRangeForAction(layer.actionId, state.deltaH)
      em.textContent = `${rangeM.toFixed(0)}m`
    }
  }

  const setStatus = (msg: string): void => {
    statusEl.textContent = msg
  }

  const updateStatus = (): void => {
    if (calib === 'a') {
      setStatus('标定中：点选已知线段的一端')
      return
    }
    if (calib === 'b') {
      setStatus('标定中：再点另一端，然后输入真实米数')
      return
    }
    if (state.metersPerPx == null) {
      setStatus('请先标定比例尺（两点 + 真实米数），圈与「我的位置」距离才会正确')
      return
    }
    if (!state.center) {
      setStatus(
        `比例尺 ${(1 / state.metersPerPx).toFixed(2)} px/m · 当前模式：设爆点（点击地图）`,
      )
      return
    }
    if (state.placeMode === 'blast') {
      setStatus(
        state.self
          ? `当前模式：设爆点 · 点击可改爆点（会清空「我」）· 已有测距可切回「设我的位置」微调`
          : `当前模式：设爆点 · 点击地图设置/修改爆点；测距请手动点「设我的位置」`,
      )
      return
    }
    if (!state.self) {
      setStatus('当前模式：设我的位置 · 请在圈内点击你的站位，将同步上方距离与多方案表')
      return
    }
    const d = distM(state.center, state.self, state.metersPerPx)
    const parts = MAP_RING_LAYERS.filter((l) => state.activeLayers.has(l.id)).map(
      (l) => {
        const { rangeM } = maxRangeForAction(l.actionId, state.deltaH)
        return `${l.label}≤${rangeM.toFixed(0)}m`
      },
    )
    setStatus(
      `爆点↔我 ${d.toFixed(1)}m · 已同步上方计算器 · ${parts.join(' / ')}`,
    )
  }

  const layout = () => {
    const W = Math.max(1, canvas.clientWidth)
    const H = Math.max(1, canvas.clientHeight)
    const iw = img.naturalWidth || 1
    const ih = img.naturalHeight || 1
    const scale = Math.min(W / iw, H / ih)
    const drawW = iw * scale
    const drawH = ih * scale
    return {
      originX: (W - drawW) / 2,
      originY: (H - drawH) / 2,
      scale,
      drawW,
      drawH,
      W,
      H,
    }
  }

  const imgToCanvas = (ix: number, iy: number) => {
    const { originX, originY, scale } = layout()
    return { x: originX + ix * scale, y: originY + iy * scale }
  }

  const canvasToImg = (cx: number, cy: number): Pt | null => {
    const { originX, originY, scale } = layout()
    const x = (cx - originX) / scale
    const y = (cy - originY) / scale
    const iw = img.naturalWidth || 0
    const ih = img.naturalHeight || 0
    if (x < 0 || y < 0 || x > iw || y > ih) return null
    return { x, y }
  }

  const drawRing = (
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    layer: MapRingLayer,
  ): void => {
    if (state.metersPerPx == null) return
    const { rangeM } = maxRangeForAction(layer.actionId, state.deltaH)
    const { scale } = layout()
    const rPx = (rangeM / state.metersPerPx) * scale
    ctx.beginPath()
    ctx.arc(cx, cy, rPx, 0, Math.PI * 2)
    ctx.fillStyle = layer.fill
    ctx.fill()
    ctx.strokeStyle = layer.stroke
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.fillStyle = layer.stroke
    ctx.font = '600 11px Segoe UI, Microsoft YaHei, sans-serif'
    ctx.fillText(`${layer.label} ${rangeM.toFixed(0)}m`, cx - 36, cy - rPx - 6)
  }

  const draw = (): void => {
    if (destroyed) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    const { W, H, originX, originY, drawW, drawH } = layout()
    canvas.width = Math.floor(W * dpr)
    canvas.height = Math.floor(H * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#0a1018'
    ctx.fillRect(0, 0, W, H)

    if (!(img.complete && img.naturalWidth > 0)) {
      ctx.fillStyle = 'rgba(180,200,220,0.5)'
      ctx.font = '14px Segoe UI, Microsoft YaHei, sans-serif'
      ctx.fillText('地图加载中…', 24, 40)
      return
    }
    ctx.drawImage(img, originX, originY, drawW, drawH)

    if (state.center && state.metersPerPx != null) {
      const c = imgToCanvas(state.center.x, state.center.y)
      const layers = MAP_RING_LAYERS.filter((l) => state.activeLayers.has(l.id))
      const sorted = [...layers].sort(
        (a, b) =>
          maxRangeForAction(b.actionId, state.deltaH).rangeM -
          maxRangeForAction(a.actionId, state.deltaH).rangeM,
      )
      for (const layer of sorted) drawRing(ctx, c.x, c.y, layer)

      if (state.self) {
        const s = imgToCanvas(state.self.x, state.self.y)
        ctx.setLineDash([6, 4])
        ctx.strokeStyle = 'rgba(120, 200, 255, 0.75)'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(s.x, s.y)
        ctx.lineTo(c.x, c.y)
        ctx.stroke()
        ctx.setLineDash([])
        const midX = (s.x + c.x) / 2
        const midY = (s.y + c.y) / 2
        const d = distM(state.center, state.self, state.metersPerPx)
        ctx.fillStyle = 'rgba(160, 220, 255, 0.95)'
        ctx.font = '600 12px Consolas, monospace'
        ctx.fillText(`${d.toFixed(1)}m`, midX + 6, midY - 4)
      }

      ctx.fillStyle = '#ff6b4a'
      ctx.beginPath()
      ctx.arc(c.x, c.y, 5, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'
      ctx.lineWidth = 1.5
      ctx.stroke()
      ctx.fillStyle = 'rgba(255,220,180,0.95)'
      ctx.font = '600 12px Segoe UI, Microsoft YaHei, sans-serif'
      ctx.fillText('爆点', c.x + 8, c.y - 8)
    }

    if (state.self) {
      const s = imgToCanvas(state.self.x, state.self.y)
      ctx.fillStyle = '#5ad0ff'
      ctx.beginPath()
      ctx.arc(s.x, s.y, 5, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'
      ctx.lineWidth = 1.5
      ctx.stroke()
      ctx.fillStyle = 'rgba(160, 230, 255, 0.95)'
      ctx.font = '600 12px Segoe UI, Microsoft YaHei, sans-serif'
      ctx.fillText('我', s.x + 8, s.y - 8)
    }

    if (calib === 'b' && calibA) {
      const a = imgToCanvas(calibA.x, calibA.y)
      ctx.fillStyle = '#6dff9a'
      ctx.beginPath()
      ctx.arc(a.x, a.y, 4, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillText('A', a.x + 6, a.y - 6)
    }
  }

  const onLayerChange = (e: Event): void => {
    const t = e.target as HTMLInputElement
    if (!t.matches('input[data-layer]')) return
    const id = t.dataset.layer
    if (!id) return
    if (t.checked) state.activeLayers.add(id)
    else state.activeLayers.delete(id)
    if (state.activeLayers.size === 0) {
      state.activeLayers.add('still')
      const still = layerBox.querySelector<HTMLInputElement>(
        'input[data-layer="still"]',
      )
      if (still) still.checked = true
    }
    updateStatus()
    draw()
  }

  const finishCalib = (b: Pt): void => {
    if (!calibA) return
    const distPx = Math.hypot(b.x - calibA.x, b.y - calibA.y)
    if (distPx < 2) {
      setStatus('两点太近，请重新标定')
      calib = 'idle'
      calibA = null
      if (btnCalib) btnCalib.textContent = '标定比例尺'
      return
    }
    const hint = scaleInput?.value?.trim()
    let meters = hint ? Number(hint) : NaN
    if (!Number.isFinite(meters) || meters <= 0) {
      const typed = window.prompt(
        `线段图上约 ${distPx.toFixed(0)} 像素。请输入这两点的真实距离（米）：`,
        '50',
      )
      meters = typed ? Number(typed) : NaN
    }
    if (!Number.isFinite(meters) || meters <= 0) {
      setStatus('已取消标定')
      calib = 'idle'
      calibA = null
      if (btnCalib) btnCalib.textContent = '标定比例尺'
      draw()
      return
    }
    state.metersPerPx = meters / distPx
    saveScale(state.metersPerPx)
    calib = 'idle'
    calibA = null
    if (btnCalib) btnCalib.textContent = '重新标定'
    if (scaleInput) scaleInput.value = String(meters)
    emitDistance()
    updateStatus()
    draw()
  }

  const onClick = (e: MouseEvent): void => {
    const rect = canvas.getBoundingClientRect()
    const pt = canvasToImg(e.clientX - rect.left, e.clientY - rect.top)
    if (!pt) return

    if (calib === 'a') {
      calibA = pt
      calib = 'b'
      updateStatus()
      draw()
      return
    }
    if (calib === 'b') {
      finishCalib(pt)
      return
    }

    if (state.placeMode === 'self' && state.center) {
      state.self = pt
      savePt(LS_SELF, pt)
      emitDistance()
    } else {
      state.center = pt
      savePt(LS_CENTER, pt)
      // 爆点变了则清空旧「我」避免错距；模式保持「设爆点」，不自动跳转
      state.self = null
      savePt(LS_SELF, null)
      emitDistance()
    }
    updateStatus()
    draw()
  }

  const onCalibClick = (): void => {
    if (calib !== 'idle') {
      calib = 'idle'
      calibA = null
      if (btnCalib)
        btnCalib.textContent = state.metersPerPx ? '重新标定' : '标定比例尺'
      updateStatus()
      draw()
      return
    }
    calib = 'a'
    calibA = null
    if (btnCalib) btnCalib.textContent = '取消标定'
    updateStatus()
    draw()
  }

  const onClear = (): void => {
    state.center = null
    state.self = null
    savePt(LS_CENTER, null)
    savePt(LS_SELF, null)
    state.placeMode = 'blast'
    syncModeButtons()
    emitDistance()
    updateStatus()
    draw()
  }

  const reset = (): void => {
    calib = 'idle'
    calibA = null
    state.center = null
    state.self = null
    state.metersPerPx = null
    state.placeMode = 'blast'
    state.activeLayers = new Set(
      MAP_RING_LAYERS.filter((l) => l.defaultOn).map((l) => l.id),
    )
    savePt(LS_CENTER, null)
    savePt(LS_SELF, null)
    saveScale(null)
    if (scaleInput) scaleInput.value = ''
    if (btnCalib) btnCalib.textContent = '标定比例尺'
    syncLayerChecks()
    syncModeButtons()
    emitDistance()
    updateStatus()
    draw()
  }

  const onResize = (): void => draw()

  layerBox.addEventListener('change', onLayerChange)
  canvas.addEventListener('click', onClick)
  btnCalib?.addEventListener('click', onCalibClick)
  btnClear?.addEventListener('click', onClear)
  btnReset?.addEventListener('click', reset)
  btnModeBlast?.addEventListener('click', () => {
    state.placeMode = 'blast'
    syncModeButtons()
    updateStatus()
  })
  btnModeSelf?.addEventListener('click', () => {
    if (!state.center) return
    state.placeMode = 'self'
    syncModeButtons()
    updateStatus()
  })
  window.addEventListener('resize', onResize)

  const boot = (): void => {
    if (btnCalib)
      btnCalib.textContent = state.metersPerPx ? '重新标定' : '标定比例尺'
    syncModeButtons()
    updateStatus()
    draw()
    // 若已有两点，启动时同步一次距离
    emitDistance()
  }
  img.onload = boot
  if (img.complete) boot()
  else updateStatus()

  return {
    setDeltaH: (dh: number) => {
      state.deltaH = dh
      refreshLayerLabels()
      updateStatus()
      draw()
    },
    redraw: draw,
    reset,
    destroy: () => {
      destroyed = true
      layerBox.removeEventListener('change', onLayerChange)
      canvas.removeEventListener('click', onClick)
      btnCalib?.removeEventListener('click', onCalibClick)
      btnClear?.removeEventListener('click', onClear)
      btnReset?.removeEventListener('click', reset)
      window.removeEventListener('resize', onResize)
    },
  }
}
