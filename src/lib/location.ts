/**
 * One-shot location capture. Resolves null on denial, timeout or an insecure
 * origin — location is a nice-to-have on an attendance record, never a reason
 * someone cannot clock in. Called at the moment of clocking in/out rather than
 * on mount, so the browser prompt arrives with a reason attached.
 */
export interface Coords {
  lat: number
  lng: number
}

export function captureLocation(timeoutMs = 6000): Promise<Coords | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null)
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { timeout: timeoutMs, maximumAge: 60_000, enableHighAccuracy: false },
    )
  })
}
