'use client'

/**
 * Loader mesin peta (public/peta/peta-engine.js) untuk komponen React.
 * Script dimuat sekali dan diekspos lewat window.PetaEngine.
 */

export interface PetaFeatureInfo {
  label?: string
  key?: string
  k?: string
  p?: Record<string, unknown>
}

export interface PetaInstance {
  resize(): void
  schedule(): void
  fieldsList(): string[]
  getLabelField(): string
  setLabelField(f: string): void
  autoLabelField(): string
  addVectorLayer(id: string, name: string, geojsonObj: unknown): void
  addRasterLayer(id: string, name: string, img: HTMLImageElement, gt: number[], opacity?: number): void
  removeLayer(id: string): void
  setLayerVisible(id: string, v: boolean): void
  setLayerOpacity(id: string, o: number): void
  hasLayers(): boolean
  getView(): {
    cx: number; cy: number; k: number; cos0: number; W: number; H: number; dpr: number
    adaLapisan: boolean
  }
  setTemuan(list: unknown[]): void
  setTemuanVisible(v: boolean): void
  setBlokFill(map: Record<string, string> | null): void
  fit(): void
  zoomIn(): void
  zoomOut(): void
}

export interface PetaEngineAPI {
  create(o: {
    canvas: HTMLCanvasElement
    onTap?: (hit: { kind: 'temuan' | 'feature'; data: unknown }) => void
    msg?: (s: string, err?: boolean) => void
  }): PetaInstance
  extractTemuan(rows: unknown[]): unknown[]
  pdfPrepare(f: File, opt?: { noGeoRef?: string }): Promise<{
    dataUrl: string; gt: number[]; w: number; h: number; note: string; georef: boolean
  }>
  avenzaPdf(imgDataUrl: string, view: {
    cx: number; cy: number; k: number; cos0: number; W: number; H: number; dpr: number
  }, opt?: { title?: string; sub?: string }): Uint8Array
  symSvg(type: string, size?: number): string
  SYM: { key: string; label: string; color: string; shape: string }[]
  SYMBY: Record<string, { key: string; label: string; color: string; shape: string }>
  UNIT: Record<string, string>
  norm(s: string): string
}

declare global {
  interface Window { PetaEngine?: PetaEngineAPI }
}

let pending: Promise<PetaEngineAPI> | null = null

export function loadPetaEngine(): Promise<PetaEngineAPI> {
  if (typeof window === 'undefined') return Promise.reject(new Error('PetaEngine hanya di browser'))
  if (window.PetaEngine) return Promise.resolve(window.PetaEngine)
  if (!pending) {
    pending = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = '/peta/peta-engine.js'
      s.async = true
      s.onload = () => {
        if (window.PetaEngine) resolve(window.PetaEngine)
        else { pending = null; reject(new Error('mesin peta tidak aktif')) }
      }
      s.onerror = () => { pending = null; reject(new Error('gagal memuat berkas mesin peta')) }
      document.head.appendChild(s)
    })
  }
  return pending
}

/** Proxy sinkron — aman dipakai setelah loadPetaEngine() selesai */
export const PetaEngine = new Proxy({} as PetaEngineAPI, {
  get(_t, prop: string | symbol) {
    const eng = typeof window !== 'undefined' ? window.PetaEngine : undefined
    if (!eng) throw new Error('PetaEngine belum dimuat — panggil loadPetaEngine() dulu')
    const v = eng[prop as keyof PetaEngineAPI]
    if (typeof v === 'function') return v.bind(eng)
    return v
  },
})
