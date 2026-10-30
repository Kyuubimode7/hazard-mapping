import { useEffect, useState } from 'react'
import { GeoJSON, MapContainer, Pane, TileLayer, useMap } from 'react-leaflet'
import type { Feature, FeatureCollection } from 'geojson'
import { geoJSON, type Layer, type PathOptions } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { BASEMAP, classOf, groupOf, GROUPS, HAZARD_STATS, type Highlight, type LayerDef } from './layers'
import type { LoadState } from './App'

const OTHER_COLOR = '#9e9e9e'

// Leaflet's canvas renderer assigns fillColor straight to ctx.fillStyle, so a CanvasPattern works as a fill.
const hatches = new Map<string, CanvasPattern>()
function hatch(color: string): CanvasPattern {
  let p = hatches.get(color)
  if (!p) {
    const c = document.createElement('canvas')
    c.width = c.height = 8
    const ctx = c.getContext('2d')!
    ctx.strokeStyle = color
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(-2, 10); ctx.lineTo(10, -2)
    ctx.moveTo(-2, 2); ctx.lineTo(2, -2)
    ctx.moveTo(6, 10); ctx.lineTo(10, 6)
    ctx.stroke()
    p = ctx.createPattern(c, 'repeat')!
    hatches.set(color, p)
  }
  return p
}

function styleFor(layer: LayerDef) {
  const colors = new Map(layer.classify?.classes.map((c) => [c.value, c.color]))
  return (feature?: Feature): PathOptions => {
    const color = layer.classify ? (colors.get(classOf(layer, feature?.properties ?? null)) ?? OTHER_COLOR) : layer.color
    return layer.kind === 'line'
      ? { color, weight: layer.weight ?? 2, dashArray: layer.dash }
      : layer.outline
        ? { color, weight: layer.weight ?? 1.5, dashArray: layer.dash, fill: false }
        : layer.hatch
        ? { color, weight: 1, fillColor: hatch(color) as unknown as string, fillOpacity: 1 }
        : { color, weight: 0.6, fillColor: color, fillOpacity: 0.55 }
  }
}

function popup(layer: LayerDef) {
  return (feature: Feature, l: Layer) => {
    if (layer.popup) {
      l.bindPopup(layer.popup(feature.properties ?? {}), { maxWidth: 360 })
      return
    }
    const rows = Object.entries(feature.properties ?? {})
      .filter(([k, v]) => v != null && v !== '' && !/^(SHAPE|CREATED|LAST_EDITED)/.test(k))
      .map(([k, v]) => `<tr><th>${k}</th><td>${String(v)}</td></tr>`)
      .join('')
    l.bindPopup(`<b>${layer.name}</b><table class="props">${rows}</table>`, { maxWidth: 360 })
  }
}

// Each group draws into its own pane, so group opacity is a single CSS change instead of restyling every feature.
function PaneOpacity({ pane, opacity }: { pane: string; opacity: number }) {
  const map = useMap()
  useEffect(() => {
    const el = map.getPane(pane)
    if (el) el.style.opacity = String(opacity)
  }, [map, pane, opacity])
  return null
}

// Leaflet only watches the window, so redraw when the side panel is dragged wider or narrower.
function TrackResize() {
  const map = useMap()
  useEffect(() => {
    const ro = new ResizeObserver(() => map.invalidateSize())
    ro.observe(map.getContainer())
    return () => ro.disconnect()
  }, [map])
  return null
}

// Outlines the in-hazard features of one type (picked in a stats card) and zooms to them.
// Green belts are left out, matching the stats.
function HazardHighlight({ highlight }: { highlight: Highlight }) {
  const map = useMap()
  const def = HAZARD_STATS.find((d) => d.id === highlight.layer)!
  const [data, setData] = useState<FeatureCollection | null>(null)
  useEffect(() => {
    setData(null)
    fetch(def.url)
      .then((r) => r.json())
      .then((fc: FeatureCollection) => setData(fc))
      .catch(() => setData(null))
  }, [def.url])
  const subset: FeatureCollection | null = data && {
    type: 'FeatureCollection',
    features: data.features.filter(
      (f) =>
        f.properties?.[def.typeField] === highlight.type &&
        !String(f.properties?.[def.codeField] ?? '').replace(/ /g, '').startsWith(def.greenBelt),
    ),
  }
  useEffect(() => {
    if (subset?.features.length) map.fitBounds(geoJSON(subset).getBounds(), { padding: [40, 40] })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, data, highlight.type])
  if (!subset) return null
  return (
    <GeoJSON
      key={highlight.layer + highlight.type}
      data={subset}
      pane="highlight"
      style={{ color: '#ffff00', weight: 3, fillColor: '#ffff00', fillOpacity: 0.35 }}
      onEachFeature={popup({ id: 'hl', name: def.title, url: '', color: '', kind: 'polygon' })}
    />
  )
}

type Props = {
  layers: LayerDef[]
  loaded: Record<string, LoadState>
  hidden: Record<string, string[]>
  opacity: Record<string, number>
  highlight: Highlight | null
}

export default function MapView({ layers, loaded, hidden, opacity, highlight }: Props) {
  return (
    <MapContainer center={[19.07, 72.88]} zoom={11} preferCanvas className="map">
      <TrackResize />
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        attribution="Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community"
        maxZoom={19}
        opacity={opacity[BASEMAP]}
      />
      {/* First group in the sidenav draws on top. */}
      {GROUPS.map((g, i) => (
        <Pane key={g.id} name={g.id} style={{ zIndex: 450 - i * 10 }}>
          <PaneOpacity pane={g.id} opacity={opacity[g.id]} />
        </Pane>
      ))}
      <Pane name="highlight" style={{ zIndex: 500 }} />
      {highlight && <HazardHighlight highlight={highlight} />}
      {layers.map((layer) => {
        const state = loaded[layer.id]
        if (state?.status !== 'ready') return null
        const off = hidden[layer.id] ?? []
        return (
          <GeoJSON
            // Re-mount when the class filter changes; react-leaflet does not re-run `filter` on prop updates.
            key={`${layer.id}:${off.join('|')}`}
            data={state.data}
            pane={groupOf(layer.id)}
            style={styleFor(layer)}
            filter={(f) => !off.includes(classOf(layer, f.properties))}
            onEachFeature={popup(layer)}
          />
        )
      })}
    </MapContainer>
  )
}

