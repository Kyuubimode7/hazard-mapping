import { useEffect, useState } from 'react'
import { HAZARD_STATS, publicUseLabel, type HazardStatsDef, type Highlight } from './layers'

type TypeStats = { type: string; count: number; fully_in: number; area_ha: number; total_count: number; total_area_ha: number; pct_area: number }
type Stats = { excluded?: string; count: number; fully_in: number; area_ha: number; total_count: number; total_area_ha: number; by_type: TypeStats[] }

const pct = (a: number, b: number) => (b ? ((100 * a) / b).toFixed(1) : '0')

type Props = { selected: Highlight | null; onSelect: (h: Highlight | null) => void }

// Bottom-left stack of cards: MCGM DP designations and reservations seaward of the hazard line.
export default function HazardStats(props: Props) {
  return (
    <div className="hazard-stats-stack">
      {HAZARD_STATS.map((def) => <StatsCard key={def.id} def={def} {...props} />)}
    </div>
  )
}

function StatsCard({ def, selected, onSelect }: Props & { def: HazardStatsDef }) {
  const [stats, setStats] = useState<Stats | null>(null)
  const [open, setOpen] = useState(true)
  useEffect(() => {
    fetch(def.stats)
      .then((r) => (r.ok ? r.json() : null))
      .then(setStats)
      .catch(() => setStats(null))
  }, [def.stats])
  const isSel = (type: string) => selected?.layer === def.id && selected.type === type
  if (!stats) return null
  return (
    <div className="hazard-stats">
      <button className="hazard-stats-head" onClick={() => setOpen(!open)}>
        {def.title} {open ? '▾' : '▸'}
      </button>
      <div className="hazard-stats-total">
        <b>{stats.count}</b> of {stats.total_count} {def.noun} ({pct(stats.count, stats.total_count)}%), {stats.fully_in} entirely
        <br />
        <b>{stats.area_ha.toFixed(0)} ha</b> of {stats.total_area_ha.toFixed(0)} ha ({pct(stats.area_ha, stats.total_area_ha)}% of total area)
        {stats.excluded && <div className="hazard-stats-note">Excludes {stats.excluded}. Click a type to highlight it.</div>}
      </div>
      {open && (
        <table className="props">
          <thead>
            <tr><th>Type</th><th>Parcels</th><th>Area in hazard</th><th>% of type</th></tr>
          </thead>
          <tbody>
            {stats.by_type.map((t) => (
              <tr
                key={t.type}
                className={isSel(t.type) ? 'selected' : undefined}
                onClick={() => onSelect(isSel(t.type) ? null : { layer: def.id, type: t.type })}
              >
                <th>{t.type} · {publicUseLabel(t.type)}</th>
                <td>{t.count} / {t.total_count}</td>
                <td>{t.area_ha.toFixed(1)} ha</td>
                <td>{t.pct_area}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
