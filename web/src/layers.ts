export type ClassDef = { value: string; label: string; color: string }

export type LayerDef = {
  id: string
  name: string
  url: string
  color: string
  kind: 'line' | 'polygon'
  weight?: number
  dash?: string
  // Fill polygons with diagonal hatching in the class colour instead of a solid fill.
  hatch?: boolean
  // Draw polygons as outlines only (administrative boundaries).
  outline?: boolean
  // Split the layer into sublayers by this attribute. Values not listed fall into "Other".
  classify?: { field: string; classes: ClassDef[] }
  // Short explanation shown under the layer name in the side panel.
  description?: string
  // Custom popup HTML; the default lists every property.
  popup?: (props: Record<string, unknown>) => string
}

export type Section = { title: string; description?: string; layers: LayerDef[] }
export type Group = { id: string; title: string; sections: Section[] }

export const OTHER = '__other'
export const BASEMAP = 'basemap'

// BASE_URL is '/' in dev and '/hazard-mapping/' on GitHub Pages.
const DATA = import.meta.env.BASE_URL + 'data/'
const CZMP = DATA + 'czmp_2019_vectors/czmp_2019_vectors/'
const DP = DATA + 'mcgm_dp2034_vectors/mcgm_dp2034_vectors/'
const JNPA = DATA + 'jnpa_vectors/jnpa_vectors/'
const MIDC = DATA + 'midc_vectors/midc_vectors/'
const CRZ11 = DATA + 'CRZ_Notification_2011/vectors_NCSCM/'
const DERIVED =DATA + 'derived/'
const HZ = DERIVED + 'mcgm_dp_hazard/'
const HZ11_DIR = DERIVED + 'crz2011/'
const CMP = DERIVED + 'crz_compare/'
const CHG = DERIVED + 'crz_changes/'
export const ZONE_COMPARE_STATS = CMP + 'zone_compare_stats.json'

const zoneClasses: ClassDef[] = [
  { value: 'R', label: 'Residential', color: '#f2d43a' },
  { value: 'C', label: 'Commercial', color: '#3f7fd1' },
  { value: 'I', label: 'Industrial', color: '#9b59c4' },
  { value: 'NA', label: 'Natural Areas', color: '#4e9a4e' },
  { value: 'G-Z', label: 'Green Zone', color: '#97cf62' },
  { value: 'NDZ', label: 'No Development Zone', color: '#bfe0a8' },
  { value: 'SDZ', label: 'Special Development Zone', color: '#e39a52' },
  { value: 'NDZ/SDZ (Slum)', label: 'NDZ/SDZ (Slum)', color: '#c8641c' },
]

// Reservation (R…) and designation (E…) codes share the second part: OS, E, H, …
const publicUse: [string, string, string][] = [
  ['OS', 'Open Space', '#43a047'],
  ['E', 'Education', '#e53935'],
  ['R', 'Rehabilitation & Resettlement', '#fb8c00'],
  ['SA', 'Social Amenities', '#ec407a'],
  ['H', 'Health', '#8e24aa'],
  ['MS', 'Municipal Services', '#3949ab'],
  ['PU', 'Public Utilities', '#00897b'],
  ['T', 'Transport', '#757575'],
  ['O', 'Other', '#8d6e63'],
  ['AM', 'Amenities', '#fdd835'],
  ['P', 'Police / Public Safety', '#1e88e5'],
]

// 'ROS' / 'EOS' → 'Open Space'
export function publicUseLabel(code: string): string {
  return publicUse.find(([c]) => code.slice(1) === c)?.[1] ?? code
}

function publicUseClasses(prefix: 'R' | 'E', extra: ClassDef[] = []): ClassDef[] {
  return [
    ...publicUse.map(([code, label, color]) => ({ value: prefix + code, label: `${prefix + code} · ${label}`, color })),
    { value: 'L_RG', label: 'L_RG · Layout Recreation Ground', color: '#81c784' },
    ...extra,
  ]
}

const jnpaLanduse: ClassDef[] = [
  { value: 'RESIDENTIAL', label: 'Residential', color: '#f2d43a' },
  { value: 'COMMERCIAL', label: 'Commercial', color: '#3f7fd1' },
  { value: 'INDUSTRIAL', label: 'Industrial', color: '#9b59c4' },
  { value: 'PORT OPERATIONAL AREA', label: 'Port Operational Area', color: '#5c6bc0' },
  { value: 'TRANSPORTATION AND COMMUNICATIONS', label: 'Transportation & Communications', color: '#757575' },
  { value: 'PUBLIC & SEMI-PUBLIC', label: 'Public & Semi-Public', color: '#e53935' },
  { value: 'UTILITIES & SERVICES', label: 'Utilities & Services', color: '#00897b' },
  { value: 'RECREATIONAL OPEN SPACE', label: 'Recreational Open Space', color: '#43a047' },
  { value: 'OPEN SPACE', label: 'Open Space', color: '#66bb6a' },
  { value: 'MANGROVES', label: 'Mangroves', color: '#1b5e20' },
  { value: 'MANGROVE OPEN SPACE', label: 'Mangrove Open Space', color: '#388e3c' },
  { value: 'MANGROVE WATER BODIES', label: 'Mangrove Water Bodies', color: '#26a69a' },
  { value: 'LAKES AND NATURAL DRAIN', label: 'Lakes & Natural Drains', color: '#4fc3f7' },
  { value: 'WATER BODY', label: 'Water Body', color: '#4fc3f7' },
  { value: 'SEA EXTENT', label: 'Sea Extent', color: '#0277bd' },
  { value: 'GAOTHAN', label: 'Gaothan', color: '#d84315' },
  { value: 'EXTENDED GAOTHAN', label: 'Extended Gaothan', color: '#ff8a65' },
  { value: 'VACANT LAND', label: 'Vacant Land', color: '#d7ccc8' },
  { value: 'DEFENCE AREA', label: 'Defence Area', color: '#3e2723' },
]

// The MCGM DP land-use layers; the hazard split (work/scripts/hazard_dp_split.py) reuses them with other files.
function mcgmLayers(idSuffix: string, base: string, fileSuffix: string): LayerDef[] {
  return [
    {
      id: 'plu' + idSuffix, name: 'PLU Zones', url: base + `00_REVISED_PLU_ZONES${fileSuffix}.geojson`, color: '#999', kind: 'polygon',
      classify: { field: 'ZONE_CODE2', classes: zoneClasses },
    },
    {
      id: 'res' + idSuffix, name: 'Reservations (proposed)', url: base + `46_PLU_RESERVATION${fileSuffix}.geojson`, color: '#999', kind: 'polygon', hatch: true,
      classify: {
        field: 'FINAL_RES_MAINTYPE',
        classes: publicUseClasses('R', [{ value: 'Metro', label: 'Metro', color: '#000000' }]),
      },
    },
    {
      id: 'des' + idSuffix, name: 'Designations (existing)', url: base + `47_PLU_DESIGNATION${fileSuffix}.geojson`, color: '#999', kind: 'polygon',
      classify: { field: 'FINAL_DES_MAINTYPE', classes: publicUseClasses('E') },
    },
  ]
}

// Taluks split by the hazard line (work/scripts/hazard_parcels.py [year]).
function hazardRiskLayer(id: string, dir: string): LayerDef {
  return {
    id, name: 'Land vs hazard line', url: dir + 'taluk_hazard_faces.geojson', color: '#999', kind: 'polygon',
    popup: hazardPopup,
    classify: {
      field: 'at_risk',
      classes: [
        { value: 'true', label: 'At risk (seaward of hazard line)', color: '#d7301f' },
        { value: 'false', label: 'Landward of hazard line', color: '#bdbdbd' },
      ],
    },
  }
}

// What each CRZ zone means (CRZ Notifications 2011 and 2019); shown in the side panel.
const ZONE_INFO = {
  crz1a: 'Ecologically sensitive areas: mangroves, salt marshes, mudflats, sand dunes, turtle nesting and bird habitats. No new construction apart from a few permitted activities.',
  mbuf: '50 m buffer around mangrove patches larger than 1,000 m². Treated as CRZ IA, so no construction.',
  crz1b: 'The intertidal zone between the High Tide Line and the Low Tide Line. Separated from CRZ IA only in the 2019 notification.',
  crz2: 'Developed land within municipal limits that is already substantially built up. Building is allowed on the landward side of existing roads or authorised structures, under local town-planning rules.',
  ndz: 'No Development Zone in rural (CRZ III) areas, measured landward from the HTL: 200 m in 2011; 50 m (CRZ IIIA) or 200 m (CRZ IIIB) in 2019, and narrower along creeks. Only repairs, traditional uses and specified public works are allowed.',
  crz3a: 'CRZ III land 50–500 m from the HTL in densely populated rural areas (2019 only). Development is allowed under local rules beyond the 50 m NDZ.',
  z200500: 'CRZ III land 200–500 m from the HTL beyond the NDZ (2011 only). Limited development such as housing for local communities and tourism facilities is allowed.',
  crz4a: 'Sea water and seabed from the Low Tide Line out to 12 nautical miles. Regulates fishing, dredging and coastal structures.',
  crz4b: 'Water and bed of tidal water bodies (creeks, rivers, estuaries) from the LTL on one bank to the LTL on the other.',
}

// One zone's patches that grew (only in 2019) or reduced (only in 2011) (work/scripts/crz_changes.py).
function zoneChangeLayer(id: keyof typeof ZONE_INFO, name: string): LayerDef {
  return {
    id: 'chg-' + id, name, description: ZONE_INFO[id], url: CHG + id + '.geojson', color: '#999', kind: 'polygon',
    classify: {
      field: 'change',
      classes: [
        { value: 'grew', label: 'Grew (2019 only)', color: '#1e64d2' },
        { value: 'reduced', label: 'Reduced (2011 only)', color: '#d7191c' },
      ],
    },
  }
}

export const GROUPS: Group[] = [
  {
    id: 'admin',
    title: 'Boundaries',
    sections: [
      {
        // CZMP 2019 is the only source with Navi Mumbai (NMMC / CIDCO nodes); MCGM wards are in the DP data.
        title: 'Administrative (CZMP 2019)',
        layers: [
          { id: 'muni', name: 'Municipal Corporations / Wards', url: CZMP + '02_Municipal_Corporation_Urban_Boundary.geojson', color: '#ffffff', kind: 'polygon', outline: true, weight: 2.5 },
          { id: 'taluk', name: 'Taluks', url: CZMP + '04_Taluk_Boundary.geojson', color: '#ffeb3b', kind: 'polygon', outline: true, weight: 3, dash: '10 5' },
          { id: 'village', name: 'Villages', url: CZMP + '03_Village_Boundary.geojson', color: '#e0e0e0', kind: 'polygon', outline: true, weight: 1, dash: '3 3' },
        ],
      },
    ],
  },
  {
    id: 'crz',
    title: 'CRZ · CZMP 2019',
    sections: [
      {
        title: 'Reference lines',
        layers: [
          { id: 'htl', weight: 3, name: 'High Tide Line', url: CZMP + '18_High_Tide_Line.geojson', color: '#d32f2f', kind: 'line' },
          { id: 'ltl', weight: 2, name: 'Low Tide Line', url: CZMP + '19_Low_Tide_Line.geojson', color: '#1976d2', kind: 'line' },
          { id: 'hazard', weight: 2.5, dash: '8 4', name: 'Hazard Line', url: CZMP + '20_Hazard_Line.geojson', color: '#f57c00', kind: 'line' },
          { id: 'ndz50', weight: 1.5, dash: '4 3', name: '50m CRZ Line · CRZ IIIA (NDZ)', url: CZMP + '21_50m_CRZ_Line_CRZ_IIIA_NDZ.geojson', color: '#6a1b9a', kind: 'line' },
          { id: 'ndz200', weight: 1.5, dash: '4 3', name: '200m CRZ Line · CRZ IIIB (NDZ)', url: CZMP + '22_200m_CRZ_Line_CRZ_IIIB_NDZ.geojson', color: '#ad1457', kind: 'line' },
          { id: 'crzb', weight: 4, name: 'CRZ Boundary', url: CZMP + '23_CRZ_Boundary.geojson', color: '#212121', kind: 'line' },
        ],
      },
      {
        title: 'Zones',
        layers: [
          { id: 'crz1a', description: ZONE_INFO.crz1a, name: 'CRZ IA', url: CZMP + '25_CRZ_IA.geojson', color: '#2e7d32', kind: 'polygon' },
          { id: 'mbuf', description: ZONE_INFO.mbuf, name: '50m Mangrove Buffer · CRZ IA', url: CZMP + '26_50m_Mangrove_Buffer_Zone_CRZ_IA.geojson', color: '#81c784', kind: 'polygon' },
          { id: 'crz1b', description: ZONE_INFO.crz1b, name: 'CRZ IB', url: CZMP + '27_CRZ_IB.geojson', color: '#a1887f', kind: 'polygon' },
          { id: 'crz2', description: ZONE_INFO.crz2, name: 'CRZ II', url: CZMP + '28_CRZ_II.geojson', color: '#ffb300', kind: 'polygon' },
          { id: 'ndz', description: ZONE_INFO.ndz, name: 'No Development Zone', url: CZMP + '29_No_Development_Zone.geojson', color: '#e57373', kind: 'polygon' },
          { id: 'crz3a', description: ZONE_INFO.crz3a, name: 'CRZ IIIA (50–500m from HTL)', url: CZMP + '30_50m_to_500m_from_HTL_CRZ_IIIA.geojson', color: '#ba68c8', kind: 'polygon' },
          { id: 'crz4b', description: ZONE_INFO.crz4b, name: 'CRZ IVB', url: CZMP + '32_CRZ_IVB.geojson', color: '#4fc3f7', kind: 'polygon' },
          { id: 'crz4a', description: ZONE_INFO.crz4a, name: 'CRZ IVA (up to 12 NM)', url: CZMP + '33_CRZ_IVA_Upto_12_NM.geojson', color: '#0277bd', kind: 'polygon' },
        ],
      },
      { title: 'Hazard analysis', layers: [hazardRiskLayer('hazardrisk', DERIVED)] },
    ],
  },
  {
    // CRZ Notification 2011 maps (NCSCM), for comparison with CZMP 2019. Colours match the 2019 group.
    id: 'crz11',
    title: 'CRZ · 2011 (NCSCM)',
    sections: [
      {
        title: 'Reference lines',
        layers: [
          { id: 'htl11', weight: 3, name: 'High Tide Line', url: CRZ11 + '25_line_HTL.geojson', color: '#d32f2f', kind: 'line' },
          { id: 'ltl11', weight: 2, name: 'Low Tide Line', url: CRZ11 + '26_line_LTL.geojson', color: '#1976d2', kind: 'line' },
          { id: 'hazard11', weight: 2.5, dash: '8 4', name: 'Hazard Line', url: CRZ11 + '27_line_hazard.geojson', color: '#f57c00', kind: 'line' },
          { id: 'l100m11', weight: 1.5, dash: '4 3', name: '100m Line · CRZ III', url: CRZ11 + '28_line_100m_CRZIII.geojson', color: '#6a1b9a', kind: 'line' },
          { id: 'crzb11', weight: 4, name: 'CRZ Boundary', url: CRZ11 + '29_line_CRZ_boundary.geojson', color: '#212121', kind: 'line' },
        ],
      },
      {
        title: 'Zones',
        layers: [
          { id: 'crz1a11', description: ZONE_INFO.crz1a, name: 'CRZ IA', url: CRZ11 + '31_zone_CRZ_IA.geojson', color: '#2e7d32', kind: 'polygon' },
          { id: 'mbuf11', description: ZONE_INFO.mbuf, name: '50m Mangrove Buffer · CRZ IA', url: CRZ11 + '32_zone_CRZ_IA_mangrove_buffer_50m.geojson', color: '#81c784', kind: 'polygon' },
          { id: 'crz211', description: ZONE_INFO.crz2, name: 'CRZ II', url: CRZ11 + '34_zone_CRZ_II.geojson', color: '#ffb300', kind: 'polygon' },
          { id: 'ndz11', description: ZONE_INFO.ndz, name: 'No Development Zone', url: CRZ11 + '35_zone_NDZ.geojson', color: '#e57373', kind: 'polygon' },
          { id: 'z200500m11', description: ZONE_INFO.z200500, name: '200–500m from HTL', url: CRZ11 + '36_zone_200_500m_from_HTL.geojson', color: '#ba68c8', kind: 'polygon' },
          { id: 'crz4b11', description: ZONE_INFO.crz4b, name: 'CRZ IVB', url: CRZ11 + '38_zone_CRZ_IVB.geojson', color: '#4fc3f7', kind: 'polygon' },
          { id: 'crz4a11', description: ZONE_INFO.crz4a, name: 'CRZ IVA', url: CRZ11 + '37_zone_CRZ_IVA.geojson', color: '#0277bd', kind: 'polygon' },
        ],
      },
      { title: 'Hazard analysis', layers: [hazardRiskLayer('hazardrisk11', HZ11_DIR)] },
    ],
  },
  {
    id: 'crzchg',
    title: 'CRZ changes · 2011 → 2019',
    sections: [
      {
        title: 'Zones',
        description:
          'Blue (grew): land or water inside the zone in the 2019 CZMP but not in the 2011 map, i.e. newly brought under that zone. ' +
          'Red (reduced): inside the zone in 2011 but not in 2019, i.e. released from it, often into another zone. ' +
          'Patches under 0.1 ha are dropped; some changes reflect remapping rather than a rule change.',
        layers: [
          zoneChangeLayer('crz1a', 'CRZ IA'),
          zoneChangeLayer('mbuf', '50m Mangrove Buffer · CRZ IA'),
          zoneChangeLayer('crz2', 'CRZ II'),
          zoneChangeLayer('ndz', 'No Development Zone'),
          zoneChangeLayer('crz4b', 'CRZ IVB'),
          zoneChangeLayer('crz4a', 'CRZ IVA'),
        ],
      },
    ],
  },
  {
    id: 'dp',
    title: 'Development Plans',
    sections: [
      { title: 'MCGM DP 2034', layers: mcgmLayers('', DP, '') },
      { title: 'MCGM DP 2034 · in hazard zone', layers: mcgmLayers('-hz', HZ, '_in') },
      { title: 'MCGM DP 2034 · outside hazard zone', layers: mcgmLayers('-safe', HZ, '_out') },
      {
        title: 'Special Planning Areas & TPS',
        layers: [
          {
            id: 'spa', name: 'SPA Landuse Zones', url: DP + '1544_SPA_Landuse_zones.geojson', color: '#999', kind: 'polygon',
            classify: { field: 'ZONE_CODE2', classes: zoneClasses.slice(0, 3) },
          },
          {
            id: 'gorai', name: 'Gorai-Manori SPA Zones', url: DP + '1104_Landuse_zones.geojson', color: '#999', kind: 'polygon',
            classify: {
              field: 'NEW_ZONECODE',
              classes: [
                { value: 'NDZ', label: 'No Development Zone', color: '#bfe0a8' },
                { value: 'GZ', label: 'Green Zone', color: '#97cf62' },
                { value: 'TDZ', label: 'Tourism Development Zone', color: '#4dd0e1' },
                { value: 'D1', label: 'Development Zone 1', color: '#ffb74d' },
                { value: 'D2', label: 'Development Zone 2', color: '#ff8a65' },
                { value: 'FA', label: 'Fishing & Allied Activities', color: '#4fc3f7' },
              ],
            },
          },
          {
            id: 'tps', name: 'TPS Zones (1991)', url: DP + '105_TPS_Zones.geojson', color: '#999', kind: 'polygon',
            classify: {
              field: 'TYPE',
              classes: [
                { value: 'Residential', label: 'Residential', color: '#f2d43a' },
                { value: 'Commercial', label: 'Commercial', color: '#3f7fd1' },
                { value: 'Industrial', label: 'Industrial', color: '#9b59c4' },
              ],
            },
          },
        ],
      },
      {
        title: 'JNPA Land Use Plan 2022',
        layers: [
          {
            id: 'jnpa-plu', name: 'Proposed Land Use', url: JNPA + 'Landuse/02_Proposed_Land_Use.geojson', color: '#999', kind: 'polygon',
            classify: { field: 'PROPOSED_LANDUSE', classes: jnpaLanduse },
          },
          {
            id: 'jnpa-elu', name: 'Existing Land Use', url: JNPA + 'Landuse/01_Existing_Land_Use.geojson', color: '#999', kind: 'polygon',
            classify: { field: 'EXISTING_LANDUSE', classes: jnpaLanduse },
          },
          {
            id: 'jnpa-zones', name: 'PLU Zones', url: JNPA + 'Landuse/04_PLU_Zone_Boundary.geojson', color: '#999', kind: 'polygon',
            classify: {
              field: 'DESCRIPTION',
              classes: [
                { value: 'Predominantly Residential Zone', label: 'Predominantly Residential', color: '#f2d43a' },
                { value: 'Predominantly Commercial Zone', label: 'Predominantly Commercial', color: '#3f7fd1' },
                { value: 'Industrial Zone', label: 'Industrial', color: '#9b59c4' },
                { value: 'Transport and Commercial Zone', label: 'Transport & Commercial', color: '#757575' },
                { value: 'Amenity Zone', label: 'Amenity', color: '#e53935' },
                { value: 'Port Operational', label: 'Port Operational', color: '#5c6bc0' },
                { value: 'Green Zone', label: 'Green Zone', color: '#97cf62' },
                { value: 'Natural Area and Protective Zone', label: 'Natural Area & Protective', color: '#4e9a4e' },
              ],
            },
          },
          { id: 'jnpa-nodes', name: 'JNPA Nodes', url: JNPA + 'Admin/22_Node_Boundary.geojson', color: '#ffffff', kind: 'polygon', outline: true, weight: 2.5 },
          { id: 'jnpa-sectors', name: 'JNPA Sectors', url: JNPA + 'Admin/21_Sector_Boundary.geojson', color: '#e0e0e0', kind: 'polygon', outline: true, weight: 1, dash: '4 3' },
        ],
      },
      {
        title: 'MIDC Industrial Areas',
        layers: [
          {
            id: 'midc-plots', name: 'Plot Land Use', url: MIDC + '05_Plot_Boundary.geojson', color: '#999', kind: 'polygon',
            classify: {
              field: 'MIDC_LAND_USE',
              // Coded values; names from the service's MIDC_LAND_USE domain (_service_layers.json).
              classes: [
                { value: '1', label: 'Industrial', color: '#9b59c4' },
                { value: '2', label: 'Residential', color: '#f2d43a' },
                { value: '3', label: 'Commercial', color: '#3f7fd1' },
                { value: '4', label: 'Amenity Plot', color: '#e53935' },
                { value: '31', label: 'Amenity PAP', color: '#ec407a' },
                { value: '30', label: 'Amenity Area', color: '#f06292' },
                { value: '8', label: 'Open Space', color: '#43a047' },
                { value: '7', label: 'Green Cover', color: '#2e7d32' },
                { value: '32', label: 'Small Plot', color: '#ba68c8' },
                { value: '10', label: 'Encroachment', color: '#212121' },
                { value: '14', label: 'Others', color: '#8d6e63' },
                { value: '18', label: 'Electric Corridor', color: '#fdd835' },
                { value: '19', label: 'Forest Land (Zudpi/Mangrove)', color: '#1b5e20' },
              ],
            },
          },
          { id: 'midc-bnd', name: 'MIDC Boundaries', url: MIDC + '06_MIDC_Boundary.geojson', color: '#ffffff', kind: 'polygon', outline: true, weight: 2.5 },
        ],
      },
    ],
  },
]

function hazardPopup(p: Record<string, unknown>): string {
  const head = `<b>${p.taluk} · ${p.at_risk ? 'at risk (seaward of hazard line)' : 'landward of hazard line'}</b><br>${p.area_ha} ha`
  if (!p.at_risk) return head
  if (!p.res_count) return `${head}<br>No MCGM reservations in this area.`
  const rows = String(p.res_breakdown)
    .split('; ')
    .map((r) => {
      const [type, ha] = r.split(' ')
      return `<tr><th>${type}</th><td>${ha} ha</td></tr>`
    })
    .join('')
  return `${head}<br><b>${p.res_pct}%</b> covered by reservations (${p.res_count} parcels, ${p.res_area_ha} ha)<table class="props">${rows}</table>`
}

// Layers summarised in the hazard stats cards (work/scripts/hazard_dp_split.py). Green belts are excluded.
// The 2011 hazard line matches 2019 within Mumbai, so the MCGM figures are the same and only 2019 is shown.
export type HazardStatsDef = { id: 'res' | 'des'; title: string; noun: string; stats: string; url: string; typeField: string; codeField: string; greenBelt: string }
function hazardStats(dir: string): HazardStatsDef[] {
  return [
    {
      id: 'des', title: 'Designations in hazard zone', noun: 'designations', stats: dir + 'mcgm_designations_hazard_stats.json',
      url: dir + 'mcgm_dp_hazard/47_PLU_DESIGNATION_in.geojson', typeField: 'FINAL_DES_MAINTYPE', codeField: 'FINAL_DES_CODE', greenBelt: 'EOS2.7',
    },
    {
      id: 'res', title: 'Reservations in hazard zone', noun: 'reservations', stats: dir + 'mcgm_reservations_hazard_stats.json',
      url: dir + 'mcgm_dp_hazard/46_PLU_RESERVATION_in.geojson', typeField: 'FINAL_RES_MAINTYPE', codeField: 'FINAL_RES_CODE', greenBelt: 'ROS2.7',
    },
  ]
}
export const HAZARD_STATS: HazardStatsDef[] = hazardStats(DERIVED)
export type Highlight = { layer: HazardStatsDef['id']; type: string }

export function classOf(layer: LayerDef, props: Record<string, unknown> | null): string {
  if (!layer.classify) return OTHER
  const v = props?.[layer.classify.field]
  const s = v == null ? '' : String(v).trim()
  return layer.classify.classes.some((c) => c.value === s) ? s : OTHER
}

export function groupOf(layerId: string): string {
  return GROUPS.find((g) => g.sections.some((s) => s.layers.some((l) => l.id === layerId)))!.id
}
