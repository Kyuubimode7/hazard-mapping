import { useEffect, useState } from 'react'
import { HAZARD_STATS, statsType, statsTypeLabel, type HazardStatsDef, type Highlight, ZONE_COMPARE_STATS, FLOODING_STATS } from './layers'

type TypeStats = { type: string; count: number; fully_in: number; area_ha: number; total_count: number; total_area_ha: number; pct_area: number }
type Stats = { excluded?: string; count: number; fully_in: number; area_ha: number; total_count: number; total_area_ha: number; by_type: TypeStats[] }

const pct = (a: number, b: number) => (b ? ((100 * a) / b).toFixed(1) : '0')

// Sums rows that statsType joins (e.g. EP into EPU, L_RG into EOS), largest area first.
function mergeTypes(layer: HazardStatsDef['id'], rows: TypeStats[]): TypeStats[] {
  const out = new Map<string, TypeStats>()
  for (const r of rows) {
    const type = statsType(layer, r.type)
    const m = out.get(type)
    if (!m) out.set(type, { ...r, type })
    else {
      m.count += r.count
      m.fully_in += r.fully_in
      m.area_ha += r.area_ha
      m.total_count += r.total_count
      m.total_area_ha += r.total_area_ha
      m.pct_area = +pct(m.area_ha, m.total_area_ha)
    }
  }
  return [...out.values()].sort((a, b) => b.area_ha - a.area_ha)
}

type Props = { selected: Highlight | null; onSelect: (h: Highlight | null) => void }

// Bottom-left stack of cards: MCGM DP designations and reservations seaward of the hazard line.
export default function HazardStats(props: Props) {
  return (
    <div className="hazard-stats-stack">
      {HAZARD_STATS.map((def) => <StatsCard key={def.id} def={def} {...props} />)}
      <FloodingCard />
      <ZoneCompareCard />
    </div>
  )
}

type FloodRow = { type: string; count: number; total_count: number; area_ha: number; total_area_ha: number; population: number }
type FloodStats = Omit<FloodRow, 'type'> & { by_type: FloodRow[]; by_ward: FloodRow[] }

// MCGM flooding spots touching the at-risk area (work/scripts/flooding_hazard_stats.py).
function FloodingCard() {
  const [stats, setStats] = useState<FloodStats | null>(null)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    fetch(FLOODING_STATS)
      .then((r) => (r.ok ? r.json() : null))
      .then(setStats)
      .catch(() => setStats(null))
  }, [])
  if (!stats) return null
  const rows = (title: string, rs: FloodRow[]) => (
    <>
      <tr><th colSpan={4} className="hazard-stats-sub">{title}</th></tr>
      {rs.map((r) => (
        <tr key={title + r.type}>
          <th>{r.type}</th>
          <td>{r.count} / {r.total_count}</td>
          <td>{r.area_ha.toFixed(1)} ha</td>
          <td>{r.population.toLocaleString()}</td>
        </tr>
      ))}
    </>
  )
  return (
    <div className="hazard-stats">
      <button className="hazard-stats-head" onClick={() => setOpen(!open)}>
        Flooding spots in hazard zone {open ? '▾' : '▸'}
      </button>
      <div className="hazard-stats-total">
        <b>{stats.count}</b> of {stats.total_count} spots ({pct(stats.count, stats.total_count)}%)
        <br />
        <b>{stats.area_ha.toFixed(0)} ha</b> of {stats.total_area_ha.toFixed(0)} ha in hazard, ~{stats.population.toLocaleString()} people affected
      </div>
      {open && (
        <>
          <table className="props">
            <thead>
              <tr><th></th><th>Spots</th><th>Area in hazard</th><th>People</th></tr>
            </thead>
            <tbody>
              {rows('By type', stats.by_type)}
              {rows('By ward', stats.by_ward)}
            </tbody>
          </table>
          <div className="hazard-stats-note">A spot counts if it touches the at-risk area. People = MCGM's affected-population figure per spot.</div>
        </>
      )}
    </div>
  )
}

function StatsCard({ def, selected, onSelect }: Props & { def: HazardStatsDef }) {
  const [stats, setStats] = useState<Stats | null>(null)
  const [open, setOpen] = useState(false)
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
            {mergeTypes(def.id, stats.by_type).map((t) => (
              <tr
                key={t.type}
                className={isSel(t.type) ? 'selected' : undefined}
                onClick={() => onSelect(isSel(t.type) ? null : { layer: def.id, type: t.type })}
              >
                <th>{statsTypeLabel(def.id, t.type)}</th>
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

type ZoneRow = { id: string; zone: string; area_2019_ha: number | null; area_2011_ha: number | null; both_ha?: number; only_2019_ha?: number; only_2011_ha?: number }

const fmt = (v: number | null | undefined) => (v == null ? '–' : v.toFixed(0))

// Area of each CRZ zone in the 2011 and 2019 maps and how much of it overlaps (work/scripts/crz_zone_compare.py).
function ZoneCompareCard() {
  const [rows, setRows] = useState<ZoneRow[] | null>(null)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    fetch(ZONE_COMPARE_STATS)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setRows(d?.zones ?? null))
      .catch(() => setRows(null))
  }, [])
  if (!rows) return null
  return (
    <div className="hazard-stats zone-compare">
      <button className="hazard-stats-head" onClick={() => setOpen(!open)}>
        CRZ zones · 2011 vs 2019 {open ? '▾' : '▸'}
      </button>
      {open && (
        <>
          <table className="props">
            <thead>
              <tr><th>Zone</th><th>2011 ha</th><th>2019 ha</th><th>Added</th><th>Removed</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <th>{r.zone}</th>
                  <td>{fmt(r.area_2011_ha)}</td>
                  <td>{fmt(r.area_2019_ha)}</td>
                  <td>{fmt(r.only_2019_ha)}</td>
                  <td>{fmt(r.only_2011_ha)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="hazard-stats-note">
            Added = in 2019 only, removed = in 2011 only. Clipped to the study area. See the "CRZ changes" group for the map.
          </div>
        </>
      )}
    </div>
  )
}
