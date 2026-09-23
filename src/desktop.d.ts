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
  /** 穿透开启时：true=忽略鼠标（点穿），false=本窗可点 */
  setPassthroughIgnore: (ignore: boolean) => void
  setSlim: (enabled: boolean) => void
  close: () => void
  setFollow: (enabled: boolean) => void
  onClickThrough: (cb: (v: boolean) => void) => void
  onSlim: (cb: (v: boolean) => void) => void
  onMouseDelta: (cb: (v: MouseDeltaInfo) => void) => void
  onFollow: (cb: (v: FollowInfo) => void) => void
  onPitchZero: (cb: () => void) => void
}

declare global {
  interface Window {
    dfDesktop?: DfDesktopApi
    dfApp?: {
      isShell: true
      openRuler: () => void
      openMask: () => void
      getMaskLayout: () => Promise<{ xPercent: number; opacity: number }>
      setMaskLayout: (partial: { xPercent?: number; opacity?: number }) => void
    }
  }
}

export {}
