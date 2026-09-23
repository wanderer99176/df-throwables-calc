/** 地图目录：切换顺序与游戏内「切换地图」一致；默认航天基地 */

export interface MapDef {
  id: string
  name: string
  /** public 下路径 */
  src: string
  /** 该图临时内置默认：米 / 图像素 */
  builtinMetersPerPx: number
}

/** Electron file:// 与 Vite base:'./' 都需要相对路径，不能写绝对 /maps/... */
const mapSrc = (file: string) => `${import.meta.env.BASE_URL}maps/${file}`

/** 如图顺序：零号大坝 → 长弓溪谷 → 航天基地 → 巴克什 → 潮汐监狱 → AZ3 */
export const MAPS: MapDef[] = [
  {
    id: 'zero-dam',
    name: '零号大坝',
    src: mapSrc('zero-dam.png'),
    builtinMetersPerPx: 0.42,
  },
  {
    id: 'longbow-valley',
    name: '长弓溪谷',
    src: mapSrc('longbow-valley.png'),
    builtinMetersPerPx: 0.42,
  },
  {
    id: 'space-base',
    name: '航天基地',
    src: mapSrc('space-base.png'),
    builtinMetersPerPx: 0.42,
  },
  {
    id: 'bakshi',
    name: '巴克什',
    src: mapSrc('bakshi.png'),
    builtinMetersPerPx: 0.42,
  },
  {
    id: 'tidal-prison',
    name: '潮汐监狱',
    src: mapSrc('tidal-prison.png'),
    builtinMetersPerPx: 0.42,
  },
  {
    id: 'az3',
    name: 'AZ3',
    src: mapSrc('az3.png'),
    builtinMetersPerPx: 0.42,
  },
]

export const DEFAULT_MAP_ID = 'space-base'

const LS_MAP = 'df-map-active-id-v1'

export function getMap(id: string): MapDef {
  return MAPS.find((m) => m.id === id) ?? MAPS.find((m) => m.id === DEFAULT_MAP_ID)!
}

export function loadActiveMapId(): string {
  const raw = localStorage.getItem(LS_MAP)
  if (raw && MAPS.some((m) => m.id === raw)) return raw
  return DEFAULT_MAP_ID
}

export function saveActiveMapId(id: string): void {
  if (!MAPS.some((m) => m.id === id)) return
  localStorage.setItem(LS_MAP, id)
}
