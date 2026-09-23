import {
  ACTION_MODES,
  GROUP_LABEL,
  getActionMode,
  type ActionModeId,
} from './actionModes'
import {
  type BallisticResult,
  type ThrowParams,
  LUNA_AIRBURST_S,
  LUNA_BOUNCE_M,
  LUNA_BOUNCE_S,
  findMaxRangeAngle,
  maxAlphaFor,
  rangeAtAngle,
  solveAnglesForRange,
} from './physics'
import { OPERATORS, UNIVERSAL_72, getOperator, type OperatorId } from './operators'
import { optionKey, solveAllActionOptions, type ThrowOption } from './options'
import { drawTacticalTrajectory } from './trajChart'
import { getCompTip } from './compTips'
import { mountMapBoard, type MapBoardHandle } from './mapBoard'
import { MAPS, getMap, loadActiveMapId } from './maps'

const ANGLE_MIN = -30
const ANGLE_MAX = 90

interface AppState {
  operatorId: OperatorId
  throwableId: string
  targetM: number
  deltaH: number
  actionId: ActionModeId
  pitch: number
  /** 次要列（移速/θ）展开 */
  showDetailCols: boolean
  /** 显示非精选动作行 */
  showAllOptions: boolean
  /** 标尺刻度详情（角度/距离/时间标注） */
  showRulerDetail: boolean
  /** 技能效果面板展开 */
  showSkillPanel: boolean
  /** 落地弹地：拉栓即投 +3m/0.3s；默认关=掐雷落地炸 */
  probeBounce: boolean
}

const state: AppState = {
  operatorId: 'luna',
  throwableId: 'frag-5s',
  targetM: 72,
  deltaH: 0,
  actionId: 'stand_still',
  pitch: 27,
  showDetailCols: false,
  showAllOptions: false,
  showRulerDetail: false,
  showSkillPanel: false,
  probeBounce: false,
}

const bootParams = new URLSearchParams(location.search)
/** 仅靠 URL 判定：计算器窗不带 desktop=1，与浏览器版同一套 UI */
const isDesktop = bootParams.get('desktop') === '1'
const bootSlim = bootParams.get('slim') !== '0'
const isAngleMask = bootParams.get('mask') === '1'

let syncLock = false
/** 桌面侧边尺烟玻底色 alpha（仅底，刻度另控） */
let deskUiOpacity = 0.41
/** 桌面「目标标注」：固定红虚线用，不随跟随/绿线改写 */
let deskAimR = 72
let deskAimDh = 0

if (isDesktop) {
  // 桌面默认：窄窗 + 仅标尺
  state.showRulerDetail = true
  document.body.classList.add('desktop', 'ruler-only')
  if (bootSlim) document.body.classList.add('slim')
  deskAimR = state.targetM
  deskAimDh = state.deltaH
}

let applyPitch: (v: number) => void = (v) => {
  state.pitch = clampPitch(v)
}

function params(): ThrowParams {
  return {
    actionId: state.actionId,
    heightMode: 'action',
    deltaH: state.deltaH,
  }
}

function clampPitch(p: number): number {
  return Math.max(ANGLE_MIN, Math.min(maxAlphaFor(params()), p))
}

/** 当前落点是否允许落地弹地（需开开关 + 引信够用 + 非空爆） */
function canApplyProbe(cur: BallisticResult, th = currentThrowable()): boolean {
  return (
    state.probeBounce &&
    th.fuseS != null &&
    cur.flightTime < LUNA_AIRBURST_S &&
    cur.flightTime + LUNA_BOUNCE_S <= th.fuseS + 0.05
  )
}

/** 申报距离：关=落地；开=落地+弹地 */
function declareRangeM(cur: BallisticResult, th = currentThrowable()): number {
  return canApplyProbe(cur, th) ? cur.range + LUNA_BOUNCE_M : cur.range
}

/** 反解用的瞄准落点：开落地弹地时 = 申报 − 3m */
function aimLandForDeclare(declareM: number): number {
  if (!state.probeBounce) return declareM
  const th = currentThrowable()
  if (th.fuseS == null) return declareM
  return Math.max(1, declareM - LUNA_BOUNCE_M)
}

function setProbeBounce(on: boolean): void {
  state.probeBounce = on
  const cb = document.querySelector<HTMLInputElement>('#toggle-probe')
  if (cb) cb.checked = on
}

function currentThrowable() {
  const op = getOperator(state.operatorId)
  return op.throwables.find((t) => t.id === state.throwableId) ?? op.throwables[0]
}

let mapBoard: MapBoardHandle | null = null
/** 地图「我的位置」→ 上方距离；由 wireEvents 注入 */
let applyMapThrowDistance: (distanceM: number | null) => void = () => {}

function buildApp(): void {
  const app = document.querySelector<HTMLDivElement>('#app')!
  const desktopBar = isDesktop
    ? `<header class="desktop-bar">
        <div class="desktop-bar-head">
          <span class="drag-title">DF尺子</span>
          <button type="button" class="desk-btn danger" id="btn-close" title="关闭">×</button>
        </div>
        <div class="desktop-actions">
          <button type="button" class="desk-btn" id="btn-follow" title="Ctrl+Shift+F">跟随</button>
          <button type="button" class="desk-btn" id="btn-zero" title="Ctrl+Shift+0">归零</button>
          <button type="button" class="desk-btn" id="btn-clickthrough" title="Ctrl+Shift+X">穿透</button>
          <button type="button" class="desk-btn" id="btn-opacity" title="调节透明度">透明度</button>
          <button type="button" class="desk-btn" id="btn-minimal" title="只留刻度尺">极简</button>
        </div>
      </header>
      <div class="desk-opacity-pop" id="desk-opacity-pop" hidden>
        <div class="desk-opacity-head">
          <span>透明度</span>
          <strong id="desk-opacity-val">0</strong>
        </div>
        <input type="range" id="desk-opacity-range" min="-100" max="100" step="1" value="0" />
        <p class="desk-opacity-hint">烟玻底色：-100 几乎无底 · 0 半透可见背后 · 100 实底</p>
        <button type="button" class="desk-btn desk-opacity-save" id="btn-opacity-save">保存</button>
      </div>
      <button type="button" class="desk-exit-minimal" id="btn-exit-minimal" hidden title="退出极简">退出极简</button>`
    : ''

  app.innerHTML = `
    ${desktopBar}
    <div class="app-shell">
      <header class="top-bar">
        <div class="brand">
          <h1>定点打击计算器</h1>
        </div>
        <div class="mask-fov-bar" id="mask-fov-bar" title="侧边栏与遮罩 FOV 设置">
          <span class="mask-fov-label">侧栏</span>
          <button type="button" class="desk-btn" id="btn-shell-ruler">弹道尺</button>
          <button type="button" class="desk-btn" id="btn-shell-mask">仰角遮罩</button>
          <label>FOV <input type="number" id="mask-hfov" min="60" max="120" step="1" /></label>
          <div class="seg seg-mini" id="mask-aspect-seg">
            <button type="button" data-aspect="1.777778">16:9</button>
            <button type="button" data-aspect="0.5625">9:16</button>
          </div>
        </div>
        <div class="cascade">
          <div class="cascade-row">
            <span class="cascade-label">选择干员</span>
            <div class="seg" id="ops"></div>
          </div>
          <div class="cascade-row">
            <span class="cascade-label">选择道具</span>
            <div class="seg" id="throws"></div>
          </div>
        </div>
        <section class="skill-bar" id="skill-bar"></section>
      </header>

      <div class="main-grid">
        <section class="panel input-panel">
          <h2>控制参数</h2>

          <div class="field">
            <div class="field-head">
              <span>目标距离 R (m)</span>
              <button type="button" class="tip-bang" data-tip="range" title="说明">!</button>
            </div>
            <div class="row">
              <input type="range" id="target-range" min="1" max="95" step="0.5" value="${state.targetM}" />
              <input type="number" id="target" min="1" max="100" step="0.1" value="${state.targetM}" />
            </div>
            <em class="field-note">按水平距离；斜距请先换算 √(斜距²−Δh²)</em>
          </div>

          <div class="field">
            <div class="field-head">
              <span>相对高低差 Δh (m)</span>
              <button type="button" class="tip-bang" data-tip="deltaH" title="说明">!</button>
            </div>
            <div class="row">
              <input type="range" id="dh-range" min="-20" max="20" step="0.5" value="${state.deltaH}" />
              <input type="number" id="dh" min="-30" max="40" step="0.1" value="${state.deltaH}" />
            </div>
            <em class="field-note">正=目标更高；不是「再加 0.3」</em>
          </div>

          <p class="section-label">动作与移动状态</p>
          <div id="action-groups" class="action-groups"></div>

          <div class="field">
            <div class="field-head">
              <span>当前仰角 α (°)</span>
              <button type="button" class="tip-bang" data-tip="offset" title="说明">!</button>
            </div>
            <div class="row">
              <input type="range" id="pitch-range" min="${ANGLE_MIN}" max="${ANGLE_MAX}" step="0.1" value="${state.pitch}" />
              <input type="number" id="pitch" min="${ANGLE_MIN}" max="${ANGLE_MAX}" step="0.1" value="${state.pitch}" />
            </div>
            <em class="field-note">准星视角；点 ! 看补角与出手高度</em>
  </div>

          <div class="live-range">
            <em>当前仰角落点</em>
            <strong id="pitch-range-live">-- m</strong>
  </div>

          <p class="hint" id="model-blurb"></p>
</section>

        <section class="visual-panel">
          <div class="readout">
            <div class="readout-grid five">
              <div><em>动作</em><strong id="action-v">--</strong></div>
              <div><em>仰头角度</em><strong id="alpha-v">--°</strong></div>
              <div><em>水平距离</em><strong id="range-v">--</strong></div>
              <div><em>掐雷时间</em><strong id="cook-v">--</strong></div>
              <div><em>倒计时截止（飞行）</em><strong id="time-v">--</strong></div>
            </div>
          </div>
          <div class="traj-panel">
            <div class="viz-row">
              <div class="traj-stage">
                <canvas id="traj" width="720" height="400"></canvas>
              </div>
              <aside class="pitch-scale">
                <label class="ruler-toggle tiny-check">
                  <input type="checkbox" id="toggle-ruler-detail" />
                  刻度详情
                </label>
                <p class="ruler-legend" id="ruler-legend" hidden>橙虚=封顶 · 蓝虚=最远 · 红实=0° · 红虚=目标仰角 · 淡红底=自伤区 · 点标签可对齐</p>
                <div class="ruler-wrap">
                  <canvas id="ruler" width="200" height="480"></canvas>
                  <div class="pitch-tag" id="pitch-tag">0.0°</div>
                  <button type="button" class="cap-tag" id="cap-tag" hidden title="点击对齐到封顶仰角">封顶</button>
                  <button type="button" class="far-tag" id="far-tag" hidden title="点击对齐到最远点仰角">最远点</button>
                </div>
                ${
                  isDesktop
                    ? `<div class="desktop-dock" id="desktop-dock">
                  <div class="desk-live" id="desk-live">
                    <div class="desk-sec-head">跟随实时</div>
                    <div class="desk-live-grid">
                      <span>α<strong id="desk-live-alpha">--°</strong></span>
                      <span>R<strong id="desk-live-r">--</strong></span>
                      <span>Δh<strong id="desk-live-dh">--</strong></span>
                    </div>
                  </div>
                  <div class="desk-aim" id="desk-aim">
                    <div class="desk-sec-head">目标标注 · 红虚</div>
                    <div class="desk-alpha"><em>标 α</em><strong id="desk-alpha-v">--°</strong></div>
                    <div class="desk-fields">
                      <label class="desk-field">R<input type="number" id="desk-target" min="1" max="100" step="0.5" value="${deskAimR}" title="目标距离(m)，固定红虚线" /></label>
                      <label class="desk-field">Δh<input type="number" id="desk-dh" min="-30" max="40" step="0.5" value="${deskAimDh}" title="相对高度差(m)，固定红虚线" /></label>
                    </div>
                  </div>
                  <div class="desk-actions" id="desk-actions"></div>
                </div>`
                    : ''
                }
              </aside>
            </div>
            <div class="traj-hud-bottom" id="traj-hud-bottom"></div>
          </div>
        </section>
      </div>

      <section class="options-bar">
        <div class="options-head">
          <h2>同爆点多方案 · <span id="opt-dist">72</span> 米</h2>
          <div class="options-toggles">
            <label class="tiny-check">
              <input type="checkbox" id="toggle-all-opts" />
              显示全部动作
            </label>
            <label class="tiny-check">
              <input type="checkbox" id="toggle-detail" />
              次要数据（掐雷时间 / 移速 / 实际抛角θ）
            </label>
          </div>
  </div>
        <p class="options-hint">拖动距离时实时刷新 · 点行即可套用该姿态与动作 · 按倒计时截止时间从大到小</p>
        <div class="options-table-wrap">
          <table class="options-table" id="options-table">
            <thead>
              <tr>
                <th>姿态</th>
                <th>移动/动作状态</th>
                <th>建议仰角 α</th>
                <th>倒计时截止时间（飞行时间）</th>
                <th class="detail-col">掐雷时间</th>
                <th>实战效果 / 终端物理</th>
                <th class="detail-col">移速</th>
                <th class="detail-col">实际抛角 θ</th>
              </tr>
            </thead>
            <tbody id="options-body"></tbody>
          </table>
  </div>
</section>

      <section class="map-bar">
        <div class="map-head">
          <h2>地图射程圈</h2>
          <div class="map-tools">
            <div class="map-switcher" id="map-switcher">
              <button type="button" class="map-switch-btn" id="map-switch-btn" aria-expanded="false">
                <span class="map-switch-icon" aria-hidden="true"></span>
                <span id="map-switch-label">航天基地</span>
                <span class="map-switch-caret">▾</span>
              </button>
              <div class="map-switch-menu" id="map-switch-menu" hidden>
                <div class="map-switch-head">
                  <span class="map-switch-icon" aria-hidden="true"></span>
                  切换地图
                </div>
                <div class="map-switch-list" id="map-switch-list"></div>
              </div>
            </div>
            <button type="button" class="map-btn ghost" id="map-mode-blast">设爆点</button>
            <button type="button" class="map-btn ghost" id="map-mode-self">设我的位置</button>
            <button type="button" class="map-btn ghost" id="map-clear">清除标点</button>
            <button type="button" class="map-btn ghost" id="map-reset">恢复初始</button>
            <button type="button" class="map-btn ghost" id="map-calib-toggle">比例尺设置</button>
          </div>
        </div>
        <p class="map-hint">
          默认<strong>航天基地</strong>；可切换其它地图（比例尺按图分别保存）。
          日常：选方案 →「设爆点」→「设我的位置」；两点间距同步上方距离与多方案表。
        </p>
        <div class="map-profiles" id="map-profiles"></div>
        <div class="map-calib-panel" id="map-calib-panel" hidden>
          <p class="map-calib-title">比例尺标定（少用 · 首次或换图时）</p>
          <div class="map-calib-row">
            <label class="map-scale-field">
              已知距离 (m)
              <input type="number" id="map-scale-m" min="1" max="500" step="0.1" value="50" />
            </label>
            <button type="button" class="map-btn" id="map-calib">在图上点两点</button>
            <button type="button" class="map-btn" id="map-calib-save" disabled>确认并保存</button>
            <input type="text" id="map-calib-name" class="map-calib-name" maxlength="16" placeholder="方案名，如：我的方案" />
          </div>
          <p class="map-calib-note" id="map-calib-note">点「在图上点两点」后依次点线段两端，输入真实米数完成草稿；再「确认并保存」写入方案按钮。</p>
        </div>
        <div class="map-layers" id="map-layers"></div>
        <p class="map-status" id="map-status"></p>
        <div class="map-stage">
          <canvas id="map-canvas" width="1200" height="720"></canvas>
        </div>
      </section>

      <section class="preset-bar">
        <h2>快捷距离</h2>
        <div class="preset-cards" id="universal"></div>
      </section>

      <section class="tactics-bar">
        <h2>战术速查 · <span id="tac-op"></span></h2>
        <div class="tactic-cards" id="tactics"></div>
      </section>
    </div>
    <div class="tip-popover" id="tip-popover" hidden></div>
  `

  renderCascade()
  renderActionModes()
  renderSkillBar()
  renderUniversal()
  renderTactics()
  wireEvents()
  wireDesktop()
  wireMaskFovBar()
  document.body.classList.toggle('show-detail-cols', state.showDetailCols)
  document.body.classList.toggle('ruler-detail', state.showRulerDetail)
  // 启动时对齐当前动作在默认距离上的解
  {
    const sol = solveAnglesForRange(aimLandForDeclare(state.targetM), params())
    const pick = sol.low ?? sol.high
    if (pick) state.pitch = clampPitch(pick.alpha)
  }
  syncInputs()
  const mapRoot = document.querySelector<HTMLElement>('.map-bar')
  if (mapRoot) {
    mapBoard?.destroy()
    mapBoard = mountMapBoard(mapRoot, {
      onThrowDistance: (m) => applyMapThrowDistance(m),
      onMapChange: (id) => syncMapSwitchLabel(id),
    })
    mapBoard.setDeltaH(state.deltaH)
    wireMapSwitcher()
    syncMapSwitchLabel(mapBoard.getMapId())
  }
  render()
}

function syncMapSwitchLabel(mapId: string): void {
  const label = document.querySelector('#map-switch-label')
  if (label) label.textContent = getMap(mapId).name
  document.querySelectorAll<HTMLButtonElement>('.map-switch-item').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.map === mapId)
  })
}

function wireMapSwitcher(): void {
  const root = document.querySelector('#map-switcher')
  const btn = document.querySelector<HTMLButtonElement>('#map-switch-btn')
  const menu = document.querySelector<HTMLElement>('#map-switch-menu')
  const list = document.querySelector('#map-switch-list')
  if (!root || !btn || !menu || !list) return

  list.innerHTML = MAPS.map(
    (m) =>
      `<button type="button" class="map-switch-item" data-map="${m.id}">${m.name}</button>`,
  ).join('')

  const close = () => {
    menu.hidden = true
    btn.setAttribute('aria-expanded', 'false')
  }
  const open = () => {
    menu.hidden = false
    btn.setAttribute('aria-expanded', 'true')
    syncMapSwitchLabel(mapBoard?.getMapId() ?? loadActiveMapId())
  }

  btn.onclick = (e) => {
    e.stopPropagation()
    if (menu.hidden) open()
    else close()
  }
  list.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest(
      '[data-map]',
    ) as HTMLElement | null
    if (!t?.dataset.map) return
    mapBoard?.setMap(t.dataset.map)
    syncMapSwitchLabel(t.dataset.map)
    close()
  })
  document.addEventListener('click', (e) => {
    if (!root.contains(e.target as Node)) close()
  })
}

function hideTipPopover(): void {
  const pop = document.querySelector<HTMLElement>('#tip-popover')
  if (!pop) return
  pop.hidden = true
  pop.removeAttribute('data-tip')
  pop.innerHTML = ''
}

function showCompTip(id: string, anchor: HTMLElement): void {
  const tip = getCompTip(id)
  const pop = document.querySelector<HTMLElement>('#tip-popover')
  if (!tip || !pop) return

  if (!pop.hidden && pop.getAttribute('data-tip') === id) {
    hideTipPopover()
    return
  }

  pop.hidden = false
  pop.setAttribute('data-tip', id)
  pop.innerHTML = `<div class="tip-popover-inner">
    <button type="button" class="tip-popover-close" aria-label="关闭">×</button>
    <strong>${tip.label}${tip.value ? ` · ${tip.value}` : ''}</strong>
    <p>${tip.detail.replace(/\n\n/g, '</p><p>')}</p>
  </div>`

  const rect = anchor.getBoundingClientRect()
  const pad = 8
  const width = Math.min(320, window.innerWidth - pad * 2)
  let left = rect.left + rect.width / 2 - width / 2
  left = Math.max(pad, Math.min(left, window.innerWidth - width - pad))
  let top = rect.bottom + 8
  // 气泡挂到 body，避免被面板 overflow / 层叠挡住
  pop.style.width = `${width}px`
  pop.style.left = `${left}px`
  pop.style.top = `${top}px`
  if (pop.parentElement !== document.body) {
    document.body.appendChild(pop)
  }

  requestAnimationFrame(() => {
    const h = pop.offsetHeight
    if (top + h > window.innerHeight - pad && rect.top - h - 8 > pad) {
      pop.style.top = `${rect.top - h - 8}px`
    }
  })
}

function renderSkillBar(): void {
  const box = document.querySelector('#skill-bar')
  if (!box) return
  const th = currentThrowable()
  const op = getOperator(state.operatorId)
  const stats = th.skillStats ?? []
  const open = state.showSkillPanel

  if (!stats.length) {
    box.innerHTML = `
      <div class="skill-bar-head">
        <div class="skill-bar-title">
          <strong>${op.name} · ${th.name}</strong>
          <em>暂无详细属性</em>
        </div>
      </div>`
    return
  }

  // 合并同分类 rowspan，表格更直观
  const groups: Array<{ group: string; rows: typeof stats }> = []
  for (const s of stats) {
    const last = groups[groups.length - 1]
    if (last && last.group === s.group) last.rows.push(s)
    else groups.push({ group: s.group, rows: [s] })
  }

  const bodyHtml = groups
    .map(({ group, rows }) =>
      rows
        .map(
          (s, i) => `<tr>
            ${i === 0 ? `<td class="sg" rowspan="${rows.length}">${group}</td>` : ''}
            <td>${s.name}</td>
            <td class="mono sv">${s.value}</td>
            <td class="snote">${s.note ?? '—'}</td>
          </tr>`,
        )
        .join(''),
    )
    .join('')

  box.innerHTML = `
    <div class="skill-bar-head">
      <div class="skill-bar-title">
        <strong>${op.name} · ${th.name}</strong>
        <em>游戏内实际效果</em>
      </div>
      <button type="button" class="skill-toggle" id="toggle-skill-panel" aria-expanded="${open}">
        ${open ? '收起属性表 ▲' : '展开属性表 ▼'}
      </button>
    </div>
    ${
      open
        ? `<div class="skill-table-wrap">
      <table class="skill-table">
        <thead>
          <tr>
            <th>属性分类</th>
            <th>属性名称</th>
            <th>参数 / 设定</th>
            <th>详细说明</th>
          </tr>
        </thead>
        <tbody>${bodyHtml}</tbody>
      </table>
    </div>`
        : `<p class="skill-collapsed-hint">属性表已折叠 · 点击「展开属性表」查看完整数值</p>`
    }
  `
}

function renderCascade(): void {
  const ops = document.querySelector('#ops')
  const box = document.querySelector('#throws')
  if (!ops || !box) return
  const op = getOperator(state.operatorId)
  if (!op.throwables.some((t) => t.id === state.throwableId)) {
    state.throwableId = op.throwables[0].id
  }
  ops.innerHTML = OPERATORS.map(
    (o) =>
      `<button type="button" class="chip${o.id === state.operatorId ? ' active' : ''}" data-op="${o.id}">${o.name}</button>`,
  ).join('')
  // 当前干员的道具/技能扁平列出，特殊技能仅加轻微标记
  box.innerHTML = op.throwables
    .map((t) => {
      const special = t.kind === 'special'
      return `<button type="button" class="chip${special ? ' special' : ''}${t.id === state.throwableId ? ' active' : ''}" data-th="${t.id}">${t.name}</button>`
    })
    .join('')
}

const DESK_ACTION_ROWS: ActionModeId[][] = [
  ['stand_still', 'crouch_still', 'prone_still'],
  ['stand_move', 'crouch_move', 'prone_move'],
  ['jump_still', 'jump_move', 'jump_run'],
]

const DESK_ACTION_SHORT: Record<ActionModeId, string> = {
  stand_still: '站静',
  crouch_still: '蹲静',
  prone_still: '趴静',
  stand_move: '站走',
  crouch_move: '蹲走',
  prone_move: '趴走',
  jump_still: '站跳',
  jump_move: '走跳',
  jump_run: '跑跳',
}

function renderDeskActions(): void {
  const box = document.querySelector('#desk-actions')
  if (!box) return
  box.innerHTML = DESK_ACTION_ROWS.map(
    (row) =>
      `<div class="desk-action-row">${row
        .map((id) => {
          const m = getActionMode(id)
          return `<button type="button" class="desk-chip${id === state.actionId ? ' active' : ''}" data-action="${id}" title="${m.title}">${DESK_ACTION_SHORT[id]}</button>`
        })
        .join('')}</div>`,
  ).join('')
}

function renderActionModes(): void {
  const box = document.querySelector('#action-groups')
  if (box) {
    const groups: Array<'still' | 'move' | 'jump'> = ['still', 'move', 'jump']
    box.innerHTML =
      groups
        .map((g) => {
          const modes = ACTION_MODES.filter((m) => m.group === g)
          const tip =
            g === 'move'
              ? ` <button type="button" class="tip-bang" data-tip="vmov" title="移速说明">!</button>`
              : ''
          return `<div class="action-group">
        <div class="action-group-head">
          <span class="tag">${GROUP_LABEL[g]}</span>${tip}
        </div>
        <div class="seg">
          ${modes
            .map(
              (m) =>
                `<button type="button" class="chip action-chip${m.id === state.actionId ? ' active' : ''}" data-action="${m.id}" title="${m.detail}">${m.title}</button>`,
            )
            .join('')}
        </div>
      </div>`
        })
        .join('') +
      `<label class="tiny-check probe-toggle" title="开启后按「拉栓即投」：落地后反弹 +3m / 0.3s，申报距离=落地+3；关闭则掐雷落地即炸">
      <input type="checkbox" id="toggle-probe" ${state.probeBounce ? 'checked' : ''} />
      落地弹地（+3m / 0.3s）
    </label>`
  }
  renderDeskActions()
}

function renderUniversal(): void {
  const box = document.querySelector('#universal')
  if (!box) return
  box.innerHTML = UNIVERSAL_72.map(
    (p) =>
      `<button type="button" class="preset-card" data-uni="${p.id}">
        <strong>${p.title}</strong>
        <em>${p.note}</em>
      </button>`,
  ).join('')
}

function renderTactics(): void {
  const op = getOperator(state.operatorId)
  const nameEl = document.querySelector('#tac-op')
  const box = document.querySelector('#tactics')
  if (nameEl) nameEl.textContent = op.name
  if (!box) return
  box.innerHTML = op.tactics
    .map(
      (t) =>
        `<article class="tactic-card"><strong>${t.title}</strong><span class="cond">${t.condition}</span><p>${t.detail}</p></article>`,
    )
    .join('')
}

function syncInputs(): void {
  const set = (id: string, v: string | number) => {
    const el = document.querySelector<HTMLInputElement>(id)
    if (el) el.value = String(v)
  }
  const cap = maxAlphaFor(params())
  const pitchEl = document.querySelector<HTMLInputElement>('#pitch')
  const pitchRange = document.querySelector<HTMLInputElement>('#pitch-range')
  if (pitchEl) pitchEl.max = String(cap)
  if (pitchRange) pitchRange.max = String(cap)

  set('#target', state.targetM)
  set('#target-range', state.targetM)
  set('#dh', state.deltaH)
  set('#dh-range', state.deltaH)
  set('#pitch', state.pitch.toFixed(1))
  set('#pitch-range', state.pitch)
  // 桌面目标标注输入不随跟随改写
  document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((b) => {
    b.classList.toggle('active', b.dataset.action === state.actionId)
  })
}

function selectOption(opt: ThrowOption): void {
  state.actionId = opt.actionId
  state.pitch = clampPitch(opt.alpha)
  renderActionModes()
  syncInputs()
  render()
}

function renderOptionsTable(): void {
  const body = document.querySelector('#options-body')
  const distEl = document.querySelector('#opt-dist')
  if (distEl) distEl.textContent = state.targetM.toFixed(1)

  const th = currentThrowable()
  const fuse = th.fuseS
  const cookOf = (flight: number): number | null => {
    if (fuse == null) return null
    return fuse - flight
  }

  // 倒计时截止时间（飞行时间）从大到小 —— 贴近引信从 5s 向 0 读秒的观感
  let opts = solveAllActionOptions(
    state.targetM,
    state.deltaH,
    'action',
    state.probeBounce,
  )
  opts = [...opts].sort((a, b) => b.flightTime - a.flightTime)

  const visible = state.showAllOptions ? opts : opts.filter((o) => o.featured)

  if (!body) return
  if (!opts.length) {
    body.innerHTML = `<tr><td colspan="8" class="empty">当前距离在已有动作下无解（可降距离或改高低差）</td></tr>`
    ;(body as HTMLElement & { __opts?: ThrowOption[] }).__opts = []
    return
  }

  const rows = visible.length ? visible : opts
  body.innerHTML = rows
    .map((o) => {
      const active = o.actionId === state.actionId && Math.abs(o.alpha - state.pitch) < 0.35
      const cook = cookOf(o.flightTime)
      let cookText = '—'
      if (cook != null) {
        cookText = cook < 0 ? '来不及' : `${cook.toFixed(2)}s`
      }
      return `<tr class="opt-row${active ? ' active' : ''}${o.recommended ? ' recommended' : ''}${o.featured ? ' featured' : ''}" data-opt="${optionKey(o)}">
        <td><strong>${o.stance}</strong>${o.recommended ? '<span class="badge">推荐</span>' : ''}</td>
        <td>${o.motion}</td>
        <td class="mono">${o.alpha.toFixed(1)}°</td>
        <td class="mono">${o.flightTime.toFixed(2)}s</td>
        <td class="detail-col mono">${cookText}</td>
        <td class="effect-cell">${o.effect}</td>
        <td class="detail-col mono">${o.vMove > 0 ? `+${o.vMove.toFixed(2)}` : '0'} m/s</td>
        <td class="detail-col mono">${o.theta.toFixed(1)}°</td>
      </tr>`
    })
    .join('')

  ;(body as HTMLElement & { __opts?: ThrowOption[] }).__opts = opts
}

function wireMaskFovBar(): void {
  const LS_HFOV = 'df-mask-hfov'
  const LS_ASPECT = 'df-mask-aspect'
  const bar = document.querySelector('#mask-fov-bar')
  if (!bar) return

  // 浏览器里没有壳 API：隐藏「打开侧栏」按钮，保留 FOV 设置（给遮罩用）
  const shell = window.dfApp
  const btnRuler = document.querySelector<HTMLButtonElement>('#btn-shell-ruler')
  const btnMask = document.querySelector<HTMLButtonElement>('#btn-shell-mask')
  if (!shell) {
    btnRuler?.remove()
    btnMask?.remove()
  } else {
    btnRuler?.addEventListener('click', () => shell.openRuler())
    btnMask?.addEventListener('click', () => shell.openMask())
  }

  const hfovEl = document.querySelector<HTMLInputElement>('#mask-hfov')
  if (!hfovEl) return

  const readHfov = () => {
    const n = Number(localStorage.getItem(LS_HFOV))
    return Number.isFinite(n) && n > 10 ? n : 100
  }
  const readAspect = () => {
    const n = Number(localStorage.getItem(LS_ASPECT))
    return Number.isFinite(n) && n > 0.3 ? n : 16 / 9
  }

  const syncUi = () => {
    hfovEl.value = String(Math.round(readHfov()))
    const asp = readAspect()
    document.querySelectorAll<HTMLButtonElement>('#mask-aspect-seg button').forEach((b) => {
      const v = Number(b.dataset.aspect)
      b.classList.toggle('active', Math.abs(v - asp) < 0.02)
    })
  }

  hfovEl.addEventListener('change', () => {
    const v = Math.min(120, Math.max(60, Math.round(Number(hfovEl.value) || 100)))
    localStorage.setItem(LS_HFOV, String(v))
    hfovEl.value = String(v)
  })
  document.querySelector('#mask-aspect-seg')?.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('button')
    if (!btn?.dataset.aspect) return
    localStorage.setItem(LS_ASPECT, btn.dataset.aspect)
    syncUi()
  })
  syncUi()
}

function wireEvents(): void {
  const root = document.querySelector('#app')
  if (!root) return

  const syncTarget = (v: number) => {
    if (syncLock) return
    syncLock = true
    state.targetM = Math.max(0.1, v)
    const aimLand = aimLandForDeclare(state.targetM)
    const sol = solveAnglesForRange(aimLand, params())
    let pick = sol.low ?? sol.high
    // 直达无解时从多方案精选对齐（如开落地弹地打 75 → 瞄 72）
    if (!pick || sol.unreachable) {
      const opts = solveAllActionOptions(
        state.targetM,
        state.deltaH,
        'action',
        state.probeBounce,
      )
      const best =
        opts.find((o) => o.recommended) ??
        opts.find((o) => o.featured) ??
        opts[0]
      if (best) {
        state.actionId = best.actionId
        state.pitch = clampPitch(best.alpha)
        renderActionModes()
        pick = null
      }
    }
    if (pick) state.pitch = clampPitch(pick.alpha)
    syncInputs()
    syncLock = false
    render()
  }

  applyMapThrowDistance = (distanceM) => {
    if (distanceM == null || !Number.isFinite(distanceM) || distanceM <= 0) return
    syncTarget(Math.round(distanceM * 10) / 10)
  }

  const syncPitch = (v: number) => {
    if (syncLock) return
    syncLock = true
    state.pitch = clampPitch(v)
    const cur = rangeAtAngle(state.pitch, params())
    if (Number.isFinite(cur.range) && cur.range > 0.5) {
      state.targetM = Math.round(declareRangeM(cur) * 10) / 10
    }
    syncInputs()
    render()
    syncLock = false
  }
  applyPitch = syncPitch

  // 气泡在 body 上：关闭键 + 点外部
  document.addEventListener('click', (ev) => {
    const target = ev.target as HTMLElement
    if (target.closest('.tip-popover-close')) {
      hideTipPopover()
      return
    }
    if (target.closest('.tip-bang') || target.closest('#tip-popover')) return
    hideTipPopover()
  })

  root.addEventListener('click', (ev) => {
    const target = ev.target as HTMLElement
    const tipBtn = target.closest('.tip-bang') as HTMLElement | null
    if (tipBtn) {
      ev.preventDefault()
      ev.stopPropagation()
      const id = tipBtn.getAttribute('data-tip')
      if (id) showCompTip(id, tipBtn)
      return
    }

    const t = target.closest(
      'button, .chip, .preset-card, tr.opt-row',
    ) as HTMLElement | null
    if (!t) return

    if (t.id === 'toggle-skill-panel') {
      state.showSkillPanel = !state.showSkillPanel
      renderSkillBar()
      return
    }

    const op = t.getAttribute('data-op') as OperatorId | null
    if (op) {
      state.operatorId = op
      state.throwableId = getOperator(op).throwables[0].id
      state.showSkillPanel = false
      renderCascade()
      renderSkillBar()
      renderTactics()
      syncTarget(state.targetM)
      return
    }
    const th = t.getAttribute('data-th')
    if (th) {
      state.throwableId = th
      state.showSkillPanel = false
      renderCascade()
      renderSkillBar()
      render()
      return
    }
    const action = t.getAttribute('data-action') as ActionModeId | null
    if (action) {
      state.actionId = action
      // 桌面侧边尺：只换姿态，用红虚线标目标仰角，不硬拽当前绿线
      if (!isDesktop) {
        const sol = solveAnglesForRange(aimLandForDeclare(state.targetM), params())
        const pick = sol.low ?? sol.high
        if (pick) state.pitch = clampPitch(pick.alpha)
      }
      renderActionModes()
      syncInputs()
      render()
      return
    }
    const uni = t.getAttribute('data-uni')
    if (uni) {
      const p = UNIVERSAL_72.find((x) => x.id === uni)
      if (p) {
        // 75m 经典路径依赖落地弹地；72m 默认关
        if (p.id === 'p75') setProbeBounce(true)
        else if (p.id === 'p72') setProbeBounce(false)
        syncTarget(p.targetM)
      }
      return
    }
    const optKey = t.getAttribute('data-opt')
    if (optKey) {
      const body = document.querySelector('#options-body') as HTMLElement & {
        __opts?: ThrowOption[]
      }
      const hit = body.__opts?.find((o) => optionKey(o) === optKey)
      if (hit) selectOption(hit)
      return
    }
    if (t.id === 'cap-tag') {
      syncPitch(maxAlphaFor(params()))
      return
    }
    if (t.id === 'far-tag') {
      syncPitch(findMaxRangeAngle({ ...params(), deltaH: 0 }).alpha)
      return
    }
  })

  root.addEventListener('input', (ev) => {
    const el = ev.target as HTMLInputElement
    if (!(el instanceof HTMLInputElement)) return
    // 桌面「目标标注」：只改固定红虚线，不改绿线 / 不改跟随实时读数源
    if (el.id === 'desk-target') {
      deskAimR = Math.max(0.1, parseFloat(el.value) || 0)
      render()
      return
    }
    if (el.id === 'desk-dh') {
      deskAimDh = parseFloat(el.value) || 0
      // 手动改标注高差时，同步物理 Δh，便于绿线落地读数同一地形
      state.deltaH = deskAimDh
      mapBoard?.setDeltaH(state.deltaH)
      render()
      return
    }
    if (el.id === 'target' || el.id === 'target-range') syncTarget(parseFloat(el.value) || 0)
    else if (el.id === 'dh' || el.id === 'dh-range') {
      state.deltaH = parseFloat(el.value) || 0
      mapBoard?.setDeltaH(state.deltaH)
      syncInputs()
      render()
    } else if (el.id === 'pitch' || el.id === 'pitch-range') syncPitch(parseFloat(el.value) || 0)
  })

  root.addEventListener('change', (ev) => {
    const el = ev.target as HTMLInputElement
    if (el.id === 'toggle-detail') {
      state.showDetailCols = el.checked
      document.body.classList.toggle('show-detail-cols', state.showDetailCols)
    } else if (el.id === 'toggle-all-opts') {
      state.showAllOptions = el.checked
      renderOptionsTable()
    } else if (el.id === 'toggle-ruler-detail') {
      state.showRulerDetail = el.checked
      document.body.classList.toggle('ruler-detail', state.showRulerDetail)
      const legend = document.querySelector('#ruler-legend') as HTMLElement | null
      if (legend) legend.hidden = !state.showRulerDetail
      render()
    } else if (el.id === 'toggle-probe') {
      state.probeBounce = el.checked
      // 开关切换：申报距离随模式变（关=落地，开=落地+3）；并反解仰角
      const cur = rangeAtAngle(state.pitch, params())
      if (Number.isFinite(cur.range) && cur.range > 0.5) {
        state.targetM = Math.round(declareRangeM(cur) * 10) / 10
      }
      syncTarget(state.targetM)
    }
  })

  const canvas = document.querySelector<HTMLCanvasElement>('#ruler')
  if (canvas) {
    let dragging = false
    const yOfAngle = (a: number, h: number) =>
      ((ANGLE_MAX - a) / (ANGLE_MAX - ANGLE_MIN)) * h
    const fromEvent = (e: PointerEvent, snapSpecial = false) => {
      const rect = canvas.getBoundingClientRect()
      if (rect.height <= 0) return
      const y = e.clientY - rect.top
      let angle = ANGLE_MAX - (y / rect.height) * (ANGLE_MAX - ANGLE_MIN)
      if (snapSpecial) {
        const cap = maxAlphaFor(params())
        const farA = findMaxRangeAngle({ ...params(), deltaH: 0 }).alpha
        const thresh = 12
        if (Math.abs(y - yOfAngle(cap, rect.height)) <= thresh) angle = cap
        else if (Math.abs(y - yOfAngle(farA, rect.height)) <= thresh) angle = farA
        else if (Math.abs(y - yOfAngle(0, rect.height)) <= thresh) angle = 0
      }
      syncPitch(angle)
    }
    canvas.addEventListener('pointerdown', (e) => {
      dragging = true
      canvas.setPointerCapture(e.pointerId)
      fromEvent(e, true)
    })
    canvas.addEventListener('pointermove', (e) => {
      if (dragging) fromEvent(e)
    })
    canvas.addEventListener('pointerup', () => {
      dragging = false
    })
  }

  // 滚轮改仰角：仅浏览器版，且指针在轨迹图 / 右侧标尺上；桌面侧边尺禁止滚轮（避免缩放/误改刻度）
  window.addEventListener(
    'wheel',
    (e) => {
      if (isDesktop) return
      const t = e.target as HTMLElement
      const onPitchSurface = Boolean(
        t.closest('#traj, #ruler, .pitch-scale, .traj-stage'),
      )
      if (!onPitchSurface) return
      e.preventDefault()
      syncPitch(state.pitch - e.deltaY * 0.02)
    },
    { passive: false },
  )

  // 数字/滑条：未聚焦时滚轮不改数值，改为滚动页面
  root.querySelectorAll<HTMLInputElement>(
    'input[type="number"], input[type="range"]',
  ).forEach((input) => {
    input.addEventListener(
      'wheel',
      (e) => {
        if (document.activeElement === input) return
        e.preventDefault()
        const scroller = document.scrollingElement
        if (scroller) scroller.scrollTop += e.deltaY
      },
      { passive: false },
    )
  })

  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      syncPitch(state.pitch + (e.shiftKey ? 1 : 0.5))
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      syncPitch(state.pitch - (e.shiftKey ? 1 : 0.5))
    }
  })
  window.addEventListener('resize', () => render())
}

function wireDesktop(): void {
  if (!isDesktop) return
  const api = window.dfDesktop
  let followOn = false
  let clickThroughOn = false
  let minimalOn = false

  const OPACITY_KEY = 'df-desk-opacity-slider'
  let savedOpacitySlider = 0

  /**
   * 滑块 -100～100 → 仅底色 alpha（烟玻效果，刻度保持清晰）
   * -100 ≈ 无底（几乎只剩刻度痕迹）· 0 ≈ 参考图半透 · 100 ≈ 实底
   */
  const sliderToBgAlpha = (slider: number): number => {
    const t = (Math.min(100, Math.max(-100, slider)) + 100) / 200
    return 0.02 + 0.78 * t
  }

  /** 刻度/准线不透明度：0 及以上全清晰；往 -100 逐渐淡成痕迹 */
  const sliderToMarkAlpha = (slider: number): number => {
    const s = Math.min(100, Math.max(-100, slider))
    if (s >= 0) return 1
    return 0.12 + 0.88 * ((s + 100) / 100)
  }

  const readSavedSlider = (): number => {
    const raw = Number(localStorage.getItem(OPACITY_KEY))
    if (!Number.isFinite(raw)) return 0
    return Math.min(100, Math.max(-100, raw))
  }

  const applyFadePreview = (slider: number) => {
    const s = Math.min(100, Math.max(-100, Math.round(slider)))
    deskUiOpacity = sliderToBgAlpha(s)
    document.documentElement.style.setProperty('--desk-bg-alpha', String(deskUiOpacity))
    document.documentElement.style.setProperty('--desk-mark-alpha', String(sliderToMarkAlpha(s)))
    const range = document.querySelector<HTMLInputElement>('#desk-opacity-range')
    const val = document.querySelector('#desk-opacity-val')
    if (range && range.value !== String(s)) range.value = String(s)
    if (val) val.textContent = String(s)
    render()
  }

  const commitOpacity = (slider: number) => {
    const s = Math.min(100, Math.max(-100, Math.round(slider)))
    savedOpacitySlider = s
    localStorage.setItem(OPACITY_KEY, String(s))
    applyFadePreview(s)
    document.querySelector('#btn-opacity')?.classList.toggle('active', s !== 0)
  }

  const setOpacityPop = (open: boolean) => {
    const pop = document.querySelector<HTMLElement>('#desk-opacity-pop')
    if (!pop) return
    if (open) {
      applyFadePreview(savedOpacitySlider)
      pop.hidden = false
    } else {
      // 未保存则恢复已保存值
      applyFadePreview(savedOpacitySlider)
      pop.hidden = true
    }
    document
      .querySelector('#btn-opacity')
      ?.classList.toggle('active', open || savedOpacitySlider !== 0)
  }

  const setMinimal = (on: boolean) => {
    if (on) {
      const wrap = document.querySelector<HTMLElement>('.ruler-wrap')
      const h = wrap?.getBoundingClientRect().height
      if (h && h > 40) {
        document.documentElement.style.setProperty('--desk-ruler-h', `${Math.round(h)}px`)
      }
    }
    minimalOn = on
    document.body.classList.toggle('minimal-ruler', on)
    document.querySelector('#btn-minimal')?.classList.toggle('active', on)
    const exit = document.querySelector<HTMLButtonElement>('#btn-exit-minimal')
    if (exit) exit.hidden = !on
    setOpacityPop(false)
    requestAnimationFrame(() => render())
  }

  const syncSlim = (slim: boolean) => {
    document.body.classList.toggle('slim', slim)
  }

  const syncClickThrough = (on: boolean) => {
    clickThroughOn = on
    document.body.classList.toggle('click-through', on)
    document.querySelector('#btn-clickthrough')?.classList.toggle('active', on)
  }

  const HIT =
    '.desktop-bar, .desk-btn, .desk-opacity-pop, .desk-exit-minimal, .pitch-scale, #ruler, #pitch-tag, .cap-tag, .far-tag, .desktop-dock, .desk-chip, .desk-field'

  document.addEventListener(
    'mousemove',
    (e) => {
      if (!clickThroughOn) return
      const overUi = Boolean((e.target as HTMLElement | null)?.closest?.(HIT))
      api?.setPassthroughIgnore?.(!overUi)
    },
    { passive: true },
  )

  document.querySelector('#btn-clickthrough')?.addEventListener('click', () => {
    const next = !clickThroughOn
    api?.setClickThrough(next)
    syncClickThrough(next)
  })
  document.querySelector('#btn-close')?.addEventListener('click', () => api?.close())
  document.querySelector('#btn-follow')?.addEventListener('click', () => api?.setFollow(!followOn))
  document.querySelector('#btn-zero')?.addEventListener('click', () => applyPitch(0))
  document.querySelector('#btn-opacity')?.addEventListener('click', (e) => {
    e.stopPropagation()
    const pop = document.querySelector<HTMLElement>('#desk-opacity-pop')
    setOpacityPop(Boolean(pop?.hidden))
  })
  document.querySelector('#btn-minimal')?.addEventListener('click', () => setMinimal(!minimalOn))
  document.querySelector('#btn-exit-minimal')?.addEventListener('click', () => setMinimal(false))

  document.querySelector('#desk-opacity-range')?.addEventListener('input', (e) => {
    const el = e.target as HTMLInputElement
    applyFadePreview(parseFloat(el.value) || 0)
  })
  document.querySelector('#btn-opacity-save')?.addEventListener('click', (e) => {
    e.stopPropagation()
    const range = document.querySelector<HTMLInputElement>('#desk-opacity-range')
    commitOpacity(parseFloat(range?.value || '0') || 0)
    const pop = document.querySelector<HTMLElement>('#desk-opacity-pop')
    if (pop) pop.hidden = true
    document
      .querySelector('#btn-opacity')
      ?.classList.toggle('active', savedOpacitySlider !== 0)
  })

  document.addEventListener('click', (e) => {
    const t = e.target as HTMLElement
    if (t.closest('#btn-opacity') || t.closest('#desk-opacity-pop')) return
    setOpacityPop(false)
  })

  // 侧边尺：禁止滚轮缩放；数字框 / 透明度滑块聚焦时放行
  document.addEventListener(
    'wheel',
    (e) => {
      const ae = document.activeElement
      const onDeskNum =
        ae instanceof HTMLInputElement &&
        (ae.type === 'number' || ae.id === 'desk-opacity-range') &&
        Boolean(ae.closest('.desktop-dock, .desk-opacity-pop'))
      if (onDeskNum) return
      if ((e.target as HTMLElement | null)?.closest?.('#desk-opacity-range')) return
      e.preventDefault()
    },
    { passive: false, capture: true },
  )
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape') {
        if (minimalOn) {
          setMinimal(false)
          return
        }
        setOpacityPop(false)
      }
      if (!(e.ctrlKey || e.metaKey)) return
      if (e.key === '+' || e.key === '=' || e.key === '-' || e.key === '_' || e.key === '0') {
        e.preventDefault()
      }
    },
    { capture: true },
  )

  api?.onSlim((slim) => syncSlim(!!slim))
  api?.onClickThrough((v) => syncClickThrough(!!v))
  api?.onFollow((info) => {
    followOn = !!info.active
    document.querySelector('#btn-follow')?.classList.toggle('active', followOn)
  })
  api?.onPitchZero(() => applyPitch(0))
  api?.onMouseDelta((ev) => {
    if (followOn) applyPitch(state.pitch + ev.dPitch)
  })

  state.showRulerDetail = true
  document.body.classList.add('ruler-only', 'slim')
  document.body.classList.remove('minimal-ruler')
  document.body.classList.toggle('ruler-detail', true)
  api?.setSlim?.(true)
  savedOpacitySlider = readSavedSlider()
  applyFadePreview(savedOpacitySlider)
  document.querySelector('#btn-opacity')?.classList.toggle('active', savedOpacitySlider !== 0)
  // 默认开启跟随
  api?.setFollow?.(true)

  void api?.getState?.().then((s) => {
    if (!s) return
    syncSlim(true)
    syncClickThrough(!!s.clickThrough)
    followOn = !!s.followMouse
    document.querySelector('#btn-follow')?.classList.toggle('active', followOn)
  })
}

function setText(id: string, text: string): void {
  const el = document.querySelector(id)
  if (el) el.textContent = text
}

function render(): void {
  try {
    const p = params()
    const th = currentThrowable()
    const mode = getActionMode(state.actionId)
    const cur = rangeAtAngle(state.pitch, p)
    const aimLand = aimLandForDeclare(state.targetM)
    const sol = solveAnglesForRange(aimLand, p)
    const pick = sol.low ?? sol.high
    const safe = (n: number, d = 1) => (Number.isFinite(n) ? n.toFixed(d) : '--')

    // 桌面固定红虚：来自标注框，与跟随绿线解耦
    const aimMarkP = isDesktop
      ? { ...p, deltaH: deskAimDh }
      : p
    const aimMarkLand = isDesktop ? aimLandForDeclare(deskAimR) : aimLand
    const aimMarkSol = isDesktop
      ? solveAnglesForRange(aimMarkLand, aimMarkP)
      : sol
    const aimMark = aimMarkSol.low ?? aimMarkSol.high

    const alphaShow = pick ? pick.alpha : state.pitch
    setText('#action-v', mode.title)
    setText('#alpha-v', `${safe(alphaShow, 1)}°`)
    setText('#desk-alpha-v', aimMark ? `${safe(aimMark.alpha, 1)}°` : '--°')
    setText('#desk-live-alpha', `${safe(state.pitch, 1)}°`)
    setText(
      '#desk-live-r',
      Number.isFinite(cur.range) && cur.range > 0.5
        ? `${safe(declareRangeM(cur, th), 1)}`
        : '--',
    )
    setText('#desk-live-dh', `${safe(state.deltaH, 1)}`)
    setText('#range-v', `${safe(cur.range, 1)}m`)
    setText('#time-v', `${safe(cur.flightTime, 2)}s`)
    if (canApplyProbe(cur, th)) {
      setText(
        '#pitch-range-live',
        `落地 ${safe(cur.range, 1)}m → 弹地 ${safe(declareRangeM(cur, th), 1)}m`,
      )
    } else {
      setText('#pitch-range-live', `落地 ${safe(cur.range, 1)}m`)
    }

    // 掐雷：引信剩余 = 引信总时长 − 飞行时间（落地/空爆前需提前拉栓的时长）
    if (th.fuseS != null && Number.isFinite(cur.flightTime)) {
      const cook = th.fuseS - cur.flightTime
      if (cook < 0) setText('#cook-v', '来不及')
      else setText('#cook-v', `${cook.toFixed(2)}s`)
    } else {
      setText('#cook-v', '—')
    }

    setText('#model-blurb', th.blurb || mode.detail)

    renderOptionsTable()

    try {
      const canvas = document.querySelector<HTMLCanvasElement>('#traj')
      if (canvas) {
        const hud = drawTacticalTrajectory(
          canvas,
          cur,
          p,
          th,
          state.targetM,
          state.probeBounce,
        )
        const bot = document.querySelector('#traj-hud-bottom')
        if (bot) {
          const vMoveTxt = hud.vMove > 0 ? `+${hud.vMove.toFixed(2)} m/s` : '0'
          bot.innerHTML = `
            <span>【弹道特征】最高高度 <b>${hud.apexH.toFixed(1)}m</b>（t=${hud.apexT.toFixed(2)}s）</span>
            <span>离手初速 <b>27 m/s</b>（${vMoveTxt}）</span>
            <span>起投高度 h₀ <b>${hud.h0.toFixed(1)}m</b></span>
            <span>落地 <b>${hud.range.toFixed(1)}m</b></span>
            <span>爆点 <b>${hud.blastEndM.toFixed(1)}m</b>${hud.bounce ? '（落地弹地）' : '（落地即炸）'}${hud.airburst ? ' · 空爆' : ''}</span>
            ${hud.selfHit ? '<span class="warn">⚠ 杀伤圈覆盖起投点（自伤）</span>' : ''}
            ${!state.probeBounce && th.fuseS != null ? '<span class="muted-hint">落地弹地关闭</span>' : ''}
          `
        }
      }
    } catch (e) {
      console.error(e)
    }
    try {
      drawRuler(cur, isDesktop ? aimMark : pick)
      positionPitchTag(state.pitch)
    } catch (e) {
      console.error(e)
    }
  } catch (e) {
    console.error('render', e)
  }
}

function positionPitchTag(pitch: number): void {
  const canvas = document.querySelector<HTMLCanvasElement>('#ruler')
  const tag = document.querySelector<HTMLDivElement>('#pitch-tag')
  if (!canvas || !tag) return
  const rect = canvas.getBoundingClientRect()
  const t = (ANGLE_MAX - pitch) / (ANGLE_MAX - ANGLE_MIN)
  tag.textContent = `${pitch.toFixed(1)}°`
  tag.style.top = `${t * rect.height}px`
}


function drawRuler(cur: BallisticResult, recommend: BallisticResult | null): void {
  const canvas = document.querySelector<HTMLCanvasElement>('#ruler')
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const dpr = window.devicePixelRatio || 1
  const W = Math.max(1, canvas.clientWidth || 200)
  const H = Math.max(1, canvas.clientHeight || 480)
  canvas.width = Math.floor(W * dpr)
  canvas.height = Math.floor(H * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, W, H)

  // 烟玻底色（可透视背后）；刻度另用 markAlpha，默认全清晰
  const bgA = isDesktop ? deskUiOpacity : 0.72
  const markA = isDesktop
    ? Math.min(
        1,
        Math.max(
          0.08,
          parseFloat(
            getComputedStyle(document.documentElement).getPropertyValue('--desk-mark-alpha'),
          ) || 1,
        ),
      )
    : 1
  if (bgA > 0.001) {
    ctx.fillStyle = `rgba(0, 0, 0, ${bgA})`
    ctx.fillRect(0, 0, W, H)
  }

  const axisX = 26
  const angleToY = (a: number) => ((ANGLE_MAX - a) / (ANGLE_MAX - ANGLE_MIN)) * H
  const p = params()
  const cap = maxAlphaFor(p)
  const detail = state.showRulerDetail
  const th = currentThrowable()
  const blast = th.blastRadiusM
  // 最远点按平地参考（Δh=0），不随目标高度差挪动
  const far = findMaxRangeAngle({ ...p, deltaH: 0 })

  // —— 自伤区底色（落点距离 < 爆炸半径的仰角段）——
  if (blast != null && blast > 0) {
    let runStart: number | null = null
    const flush = (endA: number) => {
      if (runStart == null) return
      const y0 = angleToY(endA)
      const y1 = angleToY(runStart)
      const top = Math.min(y0, y1)
      const bot = Math.max(y0, y1)
      ctx.fillStyle = `rgba(220, 60, 60, ${0.22 * bgA})`
      ctx.fillRect(0, top, W, bot - top)
      runStart = null
    }
    for (let a = ANGLE_MIN; a <= ANGLE_MAX + 0.5; a += 0.5) {
      const aa = Math.min(a, ANGLE_MAX)
      const inDanger =
        aa <= cap + 1e-6 && rangeAtAngle(Math.min(aa, cap), p).range < blast
      if (inDanger) {
        if (runStart == null) runStart = aa
      } else {
        flush(aa)
      }
    }
    flush(ANGLE_MAX)
  }

  ctx.globalAlpha = markA

  ctx.strokeStyle = 'rgba(255,255,255,0.85)'
  ctx.beginPath()
  ctx.moveTo(axisX, 4)
  ctx.lineTo(axisX, H - 4)
  ctx.stroke()

  for (let a = ANGLE_MIN; a <= ANGLE_MAX; a += 1) {
    const y = angleToY(a)
    const major = a % 5 === 0
    ctx.strokeStyle = major ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.3)'
    ctx.beginPath()
    ctx.moveTo(axisX - (major ? 10 : 5), y)
    ctx.lineTo(axisX, y)
    ctx.stroke()

    const nearCap = Math.abs(a - cap) <= 1.2
    const nearFar = Math.abs(a - far.alpha) <= 1.2
    if (detail && major && !nearCap && !nearFar) {
      const clamped = Math.max(ANGLE_MIN, Math.min(a, cap))
      const r = rangeAtAngle(clamped, p)
      const muted = a > cap + 0.01
      ctx.font = '600 11px Consolas, monospace'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = muted ? 'rgba(245,245,245,0.35)' : 'rgba(245,245,245,0.95)'
      ctx.fillText(`${a}°`, axisX + 6, y)
      if (!muted) {
        ctx.fillStyle = 'rgba(210,235,150,0.95)'
        ctx.fillText(`${r.range.toFixed(1)}m`, axisX + 40, y)
        ctx.fillStyle = 'rgba(160,225,235,0.95)'
        ctx.fillText(`${r.flightTime.toFixed(2)}s`, axisX + 92, y)
      }
    }
  }

  // ① 封顶：橙色虚线；左侧正常标注，右侧写「封顶」
  {
    const yCap = angleToY(cap)
    ctx.setLineDash([5, 4])
    ctx.strokeStyle = 'rgba(255, 176, 32, 0.95)'
    ctx.lineWidth = 1.75
    ctx.beginPath()
    ctx.moveTo(2, yCap)
    ctx.lineTo(W - 2, yCap)
    ctx.stroke()
    ctx.setLineDash([])

    ctx.strokeStyle = 'rgba(255, 176, 32, 1)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(axisX - 12, yCap)
    ctx.lineTo(axisX, yCap)
    ctx.stroke()

    if (detail) {
      const r = rangeAtAngle(cap, p)
      ctx.font = '600 11px Consolas, monospace'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = 'rgba(255, 210, 140, 0.98)'
      ctx.fillText(`${cap.toFixed(1)}°`, axisX + 6, yCap)
      ctx.fillStyle = 'rgba(210,235,150,0.95)'
      ctx.fillText(`${r.range.toFixed(1)}m`, axisX + 48, yCap)
      ctx.fillStyle = 'rgba(160,225,235,0.95)'
      ctx.fillText(`${r.flightTime.toFixed(2)}s`, axisX + 100, yCap)
    }
  }

  // ② 最远点：蓝色虚线
  {
    const yFar = angleToY(far.alpha)
    ctx.setLineDash([5, 4])
    ctx.strokeStyle = 'rgba(100, 180, 255, 0.95)'
    ctx.lineWidth = 1.75
    ctx.beginPath()
    ctx.moveTo(2, yFar)
    ctx.lineTo(W - 2, yFar)
    ctx.stroke()
    ctx.setLineDash([])

    if (detail) {
      ctx.font = '600 11px Consolas, monospace'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = 'rgba(160, 210, 255, 0.98)'
      ctx.fillText(`${far.alpha.toFixed(1)}°`, axisX + 6, yFar)
      ctx.fillStyle = 'rgba(210,235,150,0.95)'
      ctx.fillText(`${far.result.range.toFixed(1)}m`, axisX + 48, yFar)
      ctx.fillStyle = 'rgba(160,225,235,0.95)'
      ctx.fillText(`${far.result.flightTime.toFixed(2)}s`, axisX + 100, yFar)
    }
  }

  // ③ 0°：红色实线
  ctx.setLineDash([])
  ctx.strokeStyle = 'rgba(255,60,60,0.9)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(4, angleToY(0))
  ctx.lineTo(W - 4, angleToY(0))
  ctx.stroke()

  // ④ 目标仰角：红色虚线（由 R / Δh / 姿态反解，与当前绿线、最远点无关）
  if (recommend && Number.isFinite(recommend.alpha)) {
    const yAim = angleToY(recommend.alpha)
    ctx.setLineDash([5, 4])
    ctx.strokeStyle = 'rgba(255, 72, 72, 0.95)'
    ctx.lineWidth = 1.85
    ctx.beginPath()
    ctx.moveTo(2, yAim)
    ctx.lineTo(W - 2, yAim)
    ctx.stroke()
    ctx.setLineDash([])

    if (detail) {
      ctx.font = '600 11px Consolas, monospace'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = 'rgba(255, 150, 150, 0.98)'
      ctx.fillText(`${recommend.alpha.toFixed(1)}°`, axisX + 6, yAim)
      ctx.fillStyle = 'rgba(255, 180, 180, 0.9)'
      ctx.fillText('目标', axisX + 48, yAim)
    }
  }

  // 绿线：当前仰角（跟随/拖动）
  const yp = angleToY(state.pitch)
  ctx.strokeStyle = 'rgba(70,255,120,0.95)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(2, yp)
  ctx.lineTo(W - 2, yp)
  ctx.stroke()
  ctx.fillStyle = 'rgba(200,210,220,0.55)'
  ctx.font = '700 17px Segoe UI, sans-serif'
  if (canApplyProbe(cur)) {
    const blastM = declareRangeM(cur)
    ctx.fillText(`${cur.range.toFixed(1)}→${blastM.toFixed(1)}`, axisX + 6, yp - 8)
  } else {
    ctx.fillText(cur.range.toFixed(1), axisX + 6, yp - 8)
  }

  ctx.globalAlpha = 1
  positionCapTag(cap)
  positionFarTag(far.alpha)
}

function positionSideTag(
  id: string,
  angleDeg: number,
  text: string,
): void {
  const canvas = document.querySelector<HTMLCanvasElement>('#ruler')
  const tag = document.querySelector<HTMLElement>(id)
  if (!canvas || !tag) return
  const rect = canvas.getBoundingClientRect()
  if (rect.height <= 0) {
    tag.hidden = true
    return
  }
  const t = (ANGLE_MAX - angleDeg) / (ANGLE_MAX - ANGLE_MIN)
  tag.hidden = false
  tag.textContent = text
  tag.style.top = `${t * rect.height}px`
}

function positionCapTag(capDeg: number): void {
  positionSideTag('#cap-tag', capDeg, '封顶')
}

function positionFarTag(farDeg: number): void {
  positionSideTag('#far-tag', farDeg, '最远点')
}

if (isAngleMask) {
  void import('./angleMask').then((m) => m.mountAngleMask())
} else {
  buildApp()
}
