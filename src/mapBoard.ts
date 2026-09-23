/**
 * 俯视图：爆点 + 我的位置 + 射程圈。
 * 支持多地图切换；比例尺按地图分别保存。
 */

import { MAP_RING_LAYERS, maxRangeForAction, type MapRingLayer } from './mapRings'
import {
  formatPxPerM,
  getActiveProfile,
  listCalibProfiles,
  saveUserProfile,
  setActiveProfile,
  type MapCalibProfile,
} from './mapCalib'
import {
  DEFAULT_MAP_ID,
  getMap,
  loadActiveMapId,
  saveActiveMapId,
} from './maps'

const MARKER_REV = 3

type PlaceMode = 'blast' | 'self'
type CalibPhase = 'idle' | 'a' | 'b'
type Pt = { x: number; y: number }

function markerKeys(mapId: string) {
  return {
    center: `df-map-center-v${MARKER_REV}-${mapId}`,
    self: `df-map-self-v${MARKER_REV}-${mapId}`,
  }
}

export interface MapBoardHandle {
  setDeltaH: (dh: number) => void
  setMap: (mapId: string) => void
  getMapId: () => string
  redraw: () => void
  reset: () => void
  destroy: () => void
}

export interface MapBoardOptions {
  onThrowDistance?: (distanceM: number | null) => void
  onMapChange?: (mapId: string) => void
}

interface BoardState {
  mapId: string
  metersPerPx: number
  activeProfileId: string
  draftMetersPerPx: number | null
  draftRefMeters: number | null
  center: Pt | null
  self: Pt | null
  activeLayers: Set<string>
  deltaH: number
  placeMode: PlaceMode
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
  const profileBox = root.querySelector<HTMLElement>('#map-profiles')
  const calibPanel = root.querySelector<HTMLElement>('#map-calib-panel')
  const calibNote = root.querySelector<HTMLElement>('#map-calib-note')
  const btnCalibToggle = root.querySelector<HTMLButtonElement>('#map-calib-toggle')
  const btnCalib = root.querySelector<HTMLButtonElement>('#map-calib')
  const btnCalibSave = root.querySelector<HTMLButtonElement>('#map-calib-save')
  const calibNameInput = root.querySelector<HTMLInputElement>('#map-calib-name')
  const btnClear = root.querySelector<HTMLButtonElement>('#map-clear')
  const btnReset = root.querySelector<HTMLButtonElement>('#map-reset')
  const btnModeBlast = root.querySelector<HTMLButtonElement>('#map-mode-blast')
  const btnModeSelf = root.querySelector<HTMLButtonElement>('#map-mode-self')
  const scaleInput = root.querySelector<HTMLInputElement>('#map-scale-m')

  if (!canvas || !statusEl || !layerBox) {
    return {
      setDeltaH: () => {},
      setMap: () => {},
      getMapId: () => DEFAULT_MAP_ID,
      redraw: () => {},
      reset: () => {},
      destroy: () => {},
    }
  }

  const bootMapId = loadActiveMapId()
  const bootMap = getMap(bootMapId)
  const img = new Image()
  img.src = bootMap.src

  listCalibProfiles(bootMapId)
  const initial = getActiveProfile(bootMapId)
  setActiveProfile(bootMapId, initial.id)
  const mk0 = markerKeys(bootMapId)

  const state: BoardState = {
    mapId: bootMapId,
    metersPerPx: initial.metersPerPx,
    activeProfileId: initial.id,
    draftMetersPerPx: null,
    draftRefMeters: null,
    center: loadPt(mk0.center),
    self: loadPt(mk0.self),
    activeLayers: new Set(
      MAP_RING_LAYERS.filter((l) => l.defaultOn).map((l) => l.id),
    ),
    deltaH: 0,
    placeMode: 'blast',
  }

  let calib: CalibPhase = 'idle'
  let calibA: Pt | null = null
  let destroyed = false

  const effectiveScale = (): number =>
    state.draftMetersPerPx ?? state.metersPerPx

  const emitDistance = (): void => {
    if (state.center && state.self) {
      opts.onThrowDistance?.(distM(state.center, state.self, effectiveScale()))
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

  const renderProfiles = (): void => {
    if (!profileBox) return
    const list = listCalibProfiles(state.mapId)
    profileBox.innerHTML = `<span class="map-profiles-label">比例尺方案</span>${list
      .map((p) => {
        const active = p.id === state.activeProfileId && state.draftMetersPerPx == null
        return `<button type="button" class="map-profile-btn${active ? ' active' : ''}" data-profile="${p.id}" title="${formatPxPerM(p.metersPerPx)}">
          ${p.name}<em>${formatPxPerM(p.metersPerPx)}</em>
        </button>`
      })
      .join('')}`
  }

  const applyProfile = (p: MapCalibProfile): void => {
    setActiveProfile(state.mapId, p.id)
    state.activeProfileId = p.id
    state.metersPerPx = p.metersPerPx
    state.draftMetersPerPx = null
    state.draftRefMeters = null
    if (btnCalibSave) btnCalibSave.disabled = true
    if (calibNote)
      calibNote.textContent =
        '已应用方案。若需重标：点「在图上点两点」→ 确认并保存。'
    renderProfiles()
    emitDistance()
    updateStatus()
    draw()
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
      em.textContent = `${maxRangeForAction(layer.actionId, state.deltaH).rangeM.toFixed(0)}m`
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
      setStatus('标定中：再点另一端')
      return
    }
    const scaleTxt = formatPxPerM(effectiveScale())
    const draft = state.draftMetersPerPx != null ? ' · 草稿未保存' : ''
    const prof =
      listCalibProfiles(state.mapId).find((p) => p.id === state.activeProfileId)
        ?.name ?? '方案'
    const mapName = getMap(state.mapId).name
    if (!state.center) {
      setStatus(
        `【${mapName}】比例尺「${prof}」${scaleTxt}${draft} · 当前：设爆点（点地图）`,
      )
      return
    }
    if (state.placeMode === 'blast') {
      setStatus(
        `【${mapName}】比例尺「${prof}」${scaleTxt}${draft} · 当前：设爆点 · 点击可改爆点`,
      )
      return
    }
    if (!state.self) {
      setStatus(
        `【${mapName}】比例尺「${prof}」${scaleTxt}${draft} · 当前：设我的位置 · 请在圈内点击`,
      )
      return
    }
    const d = distM(state.center, state.self, effectiveScale())
    setStatus(
      `【${mapName}】比例尺「${prof}」${scaleTxt}${draft} · 爆点↔我 ${d.toFixed(1)}m · 已同步上方`,
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
    const { rangeM } = maxRangeForAction(layer.actionId, state.deltaH)
    const { scale } = layout()
    const rPx = (rangeM / effectiveScale()) * scale
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

    if (state.center) {
      const c = imgToCanvas(state.center.x, state.center.y)
      const layers = MAP_RING_LAYERS.filter((l) => state.activeLayers.has(l.id))
      const sorted = [...layers].sort(
        (a, b) =>
          maxRangeForAction(b.actionId, state.deltaH).rangeM -
          maxRangeForAction(a.actionId, state.deltaH).rangeM,
      )
      for (const layer of sorted) drawRing(ctx, c.x, c.y, layer)
    }

    if (state.center && state.self) {
      const c = imgToCanvas(state.center.x, state.center.y)
      const s = imgToCanvas(state.self.x, state.self.y)
      ctx.setLineDash([6, 4])
      ctx.strokeStyle = 'rgba(120, 200, 255, 0.75)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(s.x, s.y)
      ctx.lineTo(c.x, c.y)
      ctx.stroke()
      ctx.setLineDash([])
      const d = distM(state.center, state.self, effectiveScale())
      ctx.fillStyle = 'rgba(160, 220, 255, 0.95)'
      ctx.font = '600 12px Consolas, monospace'
      ctx.fillText(`${d.toFixed(1)}m`, (s.x + c.x) / 2 + 6, (s.y + c.y) / 2 - 4)
    }

    if (state.center) {
      const c = imgToCanvas(state.center.x, state.center.y)
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
      if (btnCalib) btnCalib.textContent = '在图上点两点'
      return
    }
    const hint = scaleInput?.value?.trim()
    let meters = hint ? Number(hint) : NaN
    if (!Number.isFinite(meters) || meters <= 0) {
      const typed = window.prompt(
        `线段图上约 ${distPx.toFixed(0)} 像素。请输入真实距离（米）：`,
        scaleInput?.value || '50',
      )
      meters = typed ? Number(typed) : NaN
    }
    if (!Number.isFinite(meters) || meters <= 0) {
      setStatus('已取消标定')
      calib = 'idle'
      calibA = null
      if (btnCalib) btnCalib.textContent = '在图上点两点'
      draw()
      return
    }
    state.draftMetersPerPx = meters / distPx
    state.draftRefMeters = meters
    calib = 'idle'
    calibA = null
    if (btnCalib) btnCalib.textContent = '在图上点两点'
    if (btnCalibSave) btnCalibSave.disabled = false
    if (scaleInput) scaleInput.value = String(meters)
    if (calibNote)
      calibNote.textContent = `草稿 ${formatPxPerM(state.draftMetersPerPx)}（参考 ${meters}m）。请点「确认并保存」写入方案按钮，下次直接选用。`
    renderProfiles()
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
      savePt(markerKeys(state.mapId).self, pt)
      emitDistance()
    } else {
      state.center = pt
      savePt(markerKeys(state.mapId).center, pt)
      state.self = null
      savePt(markerKeys(state.mapId).self, null)
      emitDistance()
    }
    updateStatus()
    draw()
  }

  const onCalibClick = (): void => {
    if (calib !== 'idle') {
      calib = 'idle'
      calibA = null
      if (btnCalib) btnCalib.textContent = '在图上点两点'
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

  const onCalibSave = (): void => {
    if (state.draftMetersPerPx == null) return
    const name =
      calibNameInput?.value?.trim() ||
      listCalibProfiles(state.mapId).find((p) => !p.builtin)?.name ||
      '我的方案'
    const saved = saveUserProfile(state.mapId, {
      name,
      metersPerPx: state.draftMetersPerPx,
      refMeters: state.draftRefMeters ?? undefined,
    })
    state.draftMetersPerPx = null
    state.draftRefMeters = null
    state.metersPerPx = saved.metersPerPx
    state.activeProfileId = saved.id
    if (btnCalibSave) btnCalibSave.disabled = true
    if (calibNameInput) calibNameInput.value = saved.name
    if (calibNote)
      calibNote.textContent = `已保存「${saved.name}」${formatPxPerM(saved.metersPerPx)}。日常点方案按钮即可，无需再标定。`
    if (calibPanel) calibPanel.hidden = true
    renderProfiles()
    emitDistance()
    updateStatus()
    draw()
  }

  const onCalibToggle = (): void => {
    if (!calibPanel) return
    calibPanel.hidden = !calibPanel.hidden
  }

  const onClear = (): void => {
    state.center = null
    state.self = null
    const mk = markerKeys(state.mapId)
    savePt(mk.center, null)
    savePt(mk.self, null)
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
    state.draftMetersPerPx = null
    state.draftRefMeters = null
    state.placeMode = 'blast'
    state.activeLayers = new Set(
      MAP_RING_LAYERS.filter((l) => l.defaultOn).map((l) => l.id),
    )
    const mk = markerKeys(state.mapId)
    savePt(mk.center, null)
    savePt(mk.self, null)
    const p = getActiveProfile(state.mapId)
    state.metersPerPx = p.metersPerPx
    state.activeProfileId = p.id
    if (btnCalib) btnCalib.textContent = '在图上点两点'
    if (btnCalibSave) btnCalibSave.disabled = true
    syncLayerChecks()
    syncModeButtons()
    renderProfiles()
    emitDistance()
    updateStatus()
    draw()
  }

  const switchMap = (mapId: string): void => {
    if (mapId === state.mapId) return
    const map = getMap(mapId)
    // 先落盘当前图标点（已在每次点击时保存）
    calib = 'idle'
    calibA = null
    state.draftMetersPerPx = null
    state.draftRefMeters = null
    state.mapId = map.id
    saveActiveMapId(map.id)
    const p = getActiveProfile(map.id)
    setActiveProfile(map.id, p.id)
    state.metersPerPx = p.metersPerPx
    state.activeProfileId = p.id
    const mk = markerKeys(map.id)
    state.center = loadPt(mk.center)
    state.self = loadPt(mk.self)
    state.placeMode = 'blast'
    if (btnCalib) btnCalib.textContent = '在图上点两点'
    if (btnCalibSave) btnCalibSave.disabled = true
    const afterLoad = () => {
      syncModeButtons()
      renderProfiles()
      updateStatus()
      draw()
      emitDistance()
      opts.onMapChange?.(map.id)
    }
    img.onload = afterLoad
    img.src = map.src
    if (img.complete) afterLoad()
  }

  const onModeBlast = (): void => {
    state.placeMode = 'blast'
    syncModeButtons()
    updateStatus()
  }
  const onModeSelf = (): void => {
    if (!state.center) return
    state.placeMode = 'self'
    syncModeButtons()
    updateStatus()
  }

  const onProfileClick = (e: Event): void => {
    const t = (e.target as HTMLElement).closest(
      '[data-profile]',
    ) as HTMLElement | null
    if (!t) return
    const id = t.getAttribute('data-profile')
    if (!id) return
    const p = listCalibProfiles(state.mapId).find((x) => x.id === id)
    if (p) applyProfile(p)
  }

  const onResize = (): void => draw()

  layerBox.addEventListener('change', onLayerChange)
  profileBox?.addEventListener('click', onProfileClick)
  canvas.addEventListener('click', onClick)
  btnCalib?.addEventListener('click', onCalibClick)
  btnCalibSave?.addEventListener('click', onCalibSave)
  btnCalibToggle?.addEventListener('click', onCalibToggle)
  btnClear?.addEventListener('click', onClear)
  btnReset?.addEventListener('click', reset)
  btnModeBlast?.addEventListener('click', onModeBlast)
  btnModeSelf?.addEventListener('click', onModeSelf)
  window.addEventListener('resize', onResize)

  const boot = (): void => {
    renderProfiles()
    syncModeButtons()
    updateStatus()
    draw()
    emitDistance()
  }
  img.onload = boot
  if (img.complete) boot()
  else {
    renderProfiles()
    updateStatus()
  }

  return {
    setDeltaH: (dh: number) => {
      state.deltaH = dh
      refreshLayerLabels()
      updateStatus()
      draw()
    },
    setMap: switchMap,
    getMapId: () => state.mapId,
    redraw: draw,
    reset,
    destroy: () => {
      destroyed = true
      layerBox.removeEventListener('change', onLayerChange)
      profileBox?.removeEventListener('click', onProfileClick)
      canvas.removeEventListener('click', onClick)
      btnCalib?.removeEventListener('click', onCalibClick)
      btnCalibSave?.removeEventListener('click', onCalibSave)
      btnCalibToggle?.removeEventListener('click', onCalibToggle)
      btnClear?.removeEventListener('click', onClear)
      btnReset?.removeEventListener('click', reset)
      btnModeBlast?.removeEventListener('click', onModeBlast)
      btnModeSelf?.removeEventListener('click', onModeSelf)
      window.removeEventListener('resize', onResize)
    },
  }
}
