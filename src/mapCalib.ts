/**
 * 地图比例尺方案（按地图分别存储）。
 * 日常用已存方案；标定仅首次或换图后需要。
 */

import { getMap, type MapDef } from './maps'

export const MAP_ASSET_REV = 3

export interface MapCalibProfile {
  id: string
  name: string
  metersPerPx: number
  refMeters?: number
  builtin?: boolean
}

const LS_SCALE_LEGACY = 'df-map-meters-per-px'
const LS_SCALE_V2 = 'df-map-meters-per-px-v2'
const LS_PROFILES_V2 = 'df-map-calib-profiles-v2'
const LS_ACTIVE_V2 = 'df-map-calib-active-v2'
const MAP_REV1_TO_REV2_SHRINK = 0.9

function keys(mapId: string) {
  return {
    profiles: `df-map-calib-profiles-v${MAP_ASSET_REV}-${mapId}`,
    active: `df-map-calib-active-v${MAP_ASSET_REV}-${mapId}`,
    scale: `df-map-meters-per-px-v${MAP_ASSET_REV}-${mapId}`,
  }
}

export function builtinProfileFor(map: MapDef): MapCalibProfile {
  return {
    id: 'builtin',
    name: '内置默认',
    metersPerPx: map.builtinMetersPerPx,
    refMeters: 50,
    builtin: true,
  }
}

function migrateLegacyScaleToSpaceBase(): number | null {
  const v2 = localStorage.getItem(LS_SCALE_V2)
  if (v2) {
    const n = Number(v2)
    if (Number.isFinite(n) && n > 0) return n
  }
  const legacy = localStorage.getItem(LS_SCALE_LEGACY)
  if (legacy) {
    const old = Number(legacy)
    if (Number.isFinite(old) && old > 0) return old / MAP_REV1_TO_REV2_SHRINK
  }
  return null
}

function migrateV2ProfilesToSpaceBase(): MapCalibProfile[] {
  try {
    const raw = localStorage.getItem(LS_PROFILES_V2)
    if (!raw) return []
    const arr = JSON.parse(raw) as MapCalibProfile[]
    if (!Array.isArray(arr)) return []
    return arr.filter(
      (p) =>
        p &&
        typeof p.id === 'string' &&
        typeof p.name === 'string' &&
        Number.isFinite(p.metersPerPx) &&
        p.metersPerPx > 0 &&
        !p.builtin,
    )
  } catch {
    return []
  }
}

export function loadUserProfiles(mapId: string): MapCalibProfile[] {
  const k = keys(mapId)
  try {
    const raw = localStorage.getItem(k.profiles)
    if (raw) {
      const arr = JSON.parse(raw) as MapCalibProfile[]
      if (Array.isArray(arr)) {
        return arr.filter(
          (p) =>
            p &&
            typeof p.id === 'string' &&
            typeof p.name === 'string' &&
            Number.isFinite(p.metersPerPx) &&
            p.metersPerPx > 0 &&
            !p.builtin,
        )
      }
    }
  } catch {
    /* ignore */
  }

  // 旧版全局方案 → 仅迁到航天基地
  if (mapId === 'space-base') {
    let users = migrateV2ProfilesToSpaceBase()
    const scale = migrateLegacyScaleToSpaceBase()
    if (users.length === 0 && scale != null) {
      users = [{ id: 'user-migrated', name: '我的方案', metersPerPx: scale }]
    }
    if (users.length > 0) {
      localStorage.setItem(k.profiles, JSON.stringify(users))
      const active = localStorage.getItem(LS_ACTIVE_V2) || users[0].id
      localStorage.setItem(k.active, active)
      localStorage.setItem(k.scale, String(users.find((u) => u.id === active)?.metersPerPx ?? users[0].metersPerPx))
    }
    return users
  }
  return []
}

function saveUserProfiles(mapId: string, list: MapCalibProfile[]): void {
  localStorage.setItem(keys(mapId).profiles, JSON.stringify(list))
}

export function listCalibProfiles(mapId: string): MapCalibProfile[] {
  const map = getMap(mapId)
  return [builtinProfileFor(map), ...loadUserProfiles(mapId)]
}

export function getActiveProfileId(mapId: string): string {
  const id = localStorage.getItem(keys(mapId).active)
  const all = listCalibProfiles(mapId)
  if (id && all.some((p) => p.id === id)) return id
  const user = all.find((p) => !p.builtin)
  return user?.id ?? 'builtin'
}

export function getActiveProfile(mapId: string): MapCalibProfile {
  const id = getActiveProfileId(mapId)
  return listCalibProfiles(mapId).find((p) => p.id === id) ?? builtinProfileFor(getMap(mapId))
}

export function setActiveProfile(mapId: string, id: string): MapCalibProfile | null {
  const p = listCalibProfiles(mapId).find((x) => x.id === id)
  if (!p) return null
  const k = keys(mapId)
  localStorage.setItem(k.active, id)
  localStorage.setItem(k.scale, String(p.metersPerPx))
  return p
}

export function saveUserProfile(
  mapId: string,
  input: {
    name: string
    metersPerPx: number
    refMeters?: number
    replaceId?: string
  },
): MapCalibProfile {
  const users = loadUserProfiles(mapId)
  const name = input.name.trim() || '我的方案'
  let profile: MapCalibProfile

  if (input.replaceId) {
    const idx = users.findIndex((p) => p.id === input.replaceId)
    if (idx >= 0) {
      profile = {
        ...users[idx],
        name,
        metersPerPx: input.metersPerPx,
        refMeters: input.refMeters,
      }
      users[idx] = profile
      saveUserProfiles(mapId, users)
      setActiveProfile(mapId, profile.id)
      return profile
    }
  }

  const same = users.findIndex((p) => p.name === name)
  if (same >= 0) {
    profile = {
      ...users[same],
      metersPerPx: input.metersPerPx,
      refMeters: input.refMeters,
    }
    users[same] = profile
  } else {
    profile = {
      id: `user-${Date.now()}`,
      name,
      metersPerPx: input.metersPerPx,
      refMeters: input.refMeters,
    }
    users.push(profile)
    while (users.length > 4) users.shift()
  }
  saveUserProfiles(mapId, users)
  setActiveProfile(mapId, profile.id)
  return profile
}

export function formatPxPerM(metersPerPx: number): string {
  return `${(1 / metersPerPx).toFixed(2)} px/m`
}
