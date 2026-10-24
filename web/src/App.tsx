import { useCallback, useEffect, useState } from 'react'
import type { FeatureCollection } from 'geojson'
import HazardStats from './HazardStats'
import MapView from './MapView'
import Sidenav from './Sidenav'
import { BASEMAP, GROUPS, type Highlight, type LayerDef } from './layers'
import './App.css'

export type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: FeatureCollection }

const ALL_LAYERS: LayerDef[] = GROUPS.flatMap((g) => g.sections.flatMap((s) => s.layers))

// On at start-up: the hazard line, at-risk hazard polygons only (landward class hidden), MCGM reservations and designations.
const DEFAULT_ON = ['hazard', 'hazardrisk', 'res', 'des']
const DEFAULT_HIDDEN: Record<string, string[]> = { hazardrisk: ['false'] }

export default function App() {
  const [visible, setVisible] = useState<Record<string, boolean>>({})
  const [highlight, setHighlight] = useState<Highlight | null>(null)
  const [hidden, setHidden] = useState<Record<string, string[]>>(DEFAULT_HIDDEN)
  const [loaded, setLoaded] = useState<Record<string, LoadState>>({})
  const [opacity, setOpacity] = useState<Record<string, number>>({
    [BASEMAP]: 1,
    ...Object.fromEntries(GROUPS.map((g) => [g.id, 0.8])),
  })

  // Layers are fetched lazily the first time they are switched on; some files are 40+ MB.
  const ensureLoaded = useCallback((layer: LayerDef) => {
    setLoaded((prev) => {
      if (prev[layer.id]) return prev
      fetch(layer.url)
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          return r.json()
        })
        .then((data: FeatureCollection) => setLoaded((p) => ({ ...p, [layer.id]: { status: 'ready', data } })))
        .catch((e: Error) => setLoaded((p) => ({ ...p, [layer.id]: { status: 'error', message: e.message } })))
      return { ...prev, [layer.id]: { status: 'loading' } }
    })
  }, [])

  const setLayersVisible = useCallback(
    (layers: LayerDef[], on: boolean) => {
      if (on) layers.forEach(ensureLoaded)
      setVisible((prev) => ({ ...prev, ...Object.fromEntries(layers.map((l) => [l.id, on])) }))
    },
    [ensureLoaded],
  )

  useEffect(() => {
    setLayersVisible(ALL_LAYERS.filter((l) => DEFAULT_ON.includes(l.id)), true)
  }, [setLayersVisible])

  const toggleClass = useCallback((layerId: string, cls: string) => {
    setHidden((prev) => {
      const cur = prev[layerId] ?? []
      return { ...prev, [layerId]: cur.includes(cls) ? cur.filter((c) => c !== cls) : [...cur, cls] }
    })
  }, [])

  return (
    <div className="app">
      <MapView layers={ALL_LAYERS.filter((l) => visible[l.id])} loaded={loaded} hidden={hidden} opacity={opacity} highlight={highlight} />
      <HazardStats selected={highlight} onSelect={setHighlight} />
      <Sidenav
        opacity={opacity}
        setOpacity={(key, v) => setOpacity((prev) => ({ ...prev, [key]: v }))}
        groups={GROUPS}
        visible={visible}
        hidden={hidden}
        loaded={loaded}
        setLayersVisible={setLayersVisible}
        toggleClass={toggleClass}
      />
    </div>
  )
}
