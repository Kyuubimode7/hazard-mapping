import { useMemo, useState } from 'react'
import { BASEMAP, classOf, OTHER, type Group, type LayerDef } from './layers'
import type { LoadState } from './App'

type Props = {
  groups: Group[]
  visible: Record<string, boolean>
  hidden: Record<string, string[]>
  loaded: Record<string, LoadState>
  setLayersVisible: (layers: LayerDef[], on: boolean) => void
  toggleClass: (layerId: string, cls: string) => void
  opacity: Record<string, number>
  setOpacity: (key: string, v: number) => void
}

function OpacitySlider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="opacity">
      <span>{label}</span>
      <input type="range" min={0} max={1} step={0.05} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="badge">{Math.round(value * 100)}%</span>
    </label>
  )
}

export default function Sidenav(props: Props) {
  return (
    <aside className="sidenav">
      <h1>Layers</h1>
      <OpacitySlider label="Satellite basemap" value={props.opacity[BASEMAP]} onChange={(v) => props.setOpacity(BASEMAP, v)} />
      {props.groups.map((g) => (
        <GroupItem key={g.id} group={g} {...props} />
      ))}
    </aside>
  )
}

function GroupItem({ group, ...props }: Props & { group: Group }) {
  const [open, setOpen] = useState(true)
  const layers = group.sections.flatMap((s) => s.layers)
  const onCount = layers.filter((l) => props.visible[l.id]).length
  return (
    <section className="group">
      <div className="row group-row">
        <button className="caret" onClick={() => setOpen(!open)}>{open ? '▾' : '▸'}</button>
        <input
          type="checkbox"
          checked={onCount === layers.length}
          ref={(el) => { if (el) el.indeterminate = onCount > 0 && onCount < layers.length }}
          onChange={(e) => props.setLayersVisible(layers, e.target.checked)}
        />
        <span className="group-title">{group.title}</span>
      </div>
      <div className="group-opacity">
        <OpacitySlider label="Opacity" value={props.opacity[group.id]} onChange={(v) => props.setOpacity(group.id, v)} />
      </div>
      {open &&
        group.sections.map((s) => (
          <div key={s.title} className="section">
            <div className="section-title">{s.title}</div>
            {s.layers.map((l) => <LayerItem key={l.id} layer={l} {...props} />)}
          </div>
        ))}
    </section>
  )
}

function LayerItem({ layer, visible, hidden, loaded, setLayersVisible, toggleClass }: Props & { layer: LayerDef }) {
  const [open, setOpen] = useState(false)
  const state = loaded[layer.id]
  const off = hidden[layer.id] ?? []

  const counts = useMemo(() => {
    if (state?.status !== 'ready') return null
    const c: Record<string, number> = {}
    for (const f of state.data.features) {
      const k = classOf(layer, f.properties)
      c[k] = (c[k] ?? 0) + 1
    }
    return c
  }, [state, layer])

  const classes = layer.classify
    ? [...layer.classify.classes, { value: OTHER, label: 'Other / unclassified', color: '#9e9e9e' }]
        .filter((c) => !counts || counts[c.value])
    : []

  return (
    <div className="layer">
      <div className="row">
        {layer.classify
          ? <button className="caret" onClick={() => setOpen(!open)}>{open ? '▾' : '▸'}</button>
          : <span className="caret" />}
        <input type="checkbox" checked={!!visible[layer.id]} onChange={(e) => setLayersVisible([layer], e.target.checked)} />
        {!layer.classify && <span className={`swatch ${layer.kind}`} style={{ background: layer.color }} />}
        <span className="layer-name">{layer.name}</span>
        {state?.status === 'loading' && <span className="badge">loading…</span>}
        {state?.status === 'error' && <span className="badge err" title={state.message}>failed</span>}
        {state?.status === 'ready' && <span className="badge">{state.data.features.length}</span>}
      </div>
      {open && (
        <ul className="classes">
          {classes.map((c) => (
            <li key={c.value} className="row">
              <input type="checkbox" checked={!off.includes(c.value)} onChange={() => toggleClass(layer.id, c.value)} />
              <span className="swatch polygon" style={{ background: layer.hatch ? `repeating-linear-gradient(-45deg, ${c.color} 0 2px, transparent 2px 5px)` : c.color, outline: layer.hatch ? `1px solid ${c.color}` : undefined }} />
              <span className="layer-name">{c.label}</span>
              {counts && <span className="badge">{counts[c.value]}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
