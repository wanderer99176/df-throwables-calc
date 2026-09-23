export interface FollowInfo {
  active: boolean
  ok?: boolean
  mode?: string
  reason?: string
  degPerCount?: number
  invertY?: boolean
}

export interface MouseDeltaInfo {
  dx: number
  dy: number
  dPitch: number
}

export interface DfDesktopApi {
  isDesktop: true
  getState: () => Promise<{
    clickThrough: boolean
    slim: boolean
    isDev: boolean
    followMouse: boolean
    degPerCount: number
    invertY: boolean
    rawSupported: boolean
  }>
  setClickThrough: (enabled: boolean) => void
  toggleSlim: () => void
  close: () => void
  setFollow: (enabled: boolean) => void
  setSens: (payload: { degPerCount?: number; invertY?: boolean }) => void
  calibrate: (payload: {
    mouseCounts: number
    degrees: number
  }) => Promise<{ ok: boolean; degPerCount?: number; reason?: string }>
  onClickThrough: (cb: (v: boolean) => void) => void
  onSlim: (cb: (v: boolean) => void) => void
  onMouseDelta: (cb: (v: MouseDeltaInfo) => void) => void
  onFollow: (cb: (v: FollowInfo) => void) => void
  onPitchZero: (cb: () => void) => void
}

declare global {
  interface Window {
    dfDesktop?: DfDesktopApi
  }
}

export {}
