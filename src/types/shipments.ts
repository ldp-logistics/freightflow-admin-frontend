/** Platform / org shipment detail types (snake_case from API). */

export type ShipmentEvent = {
  code?: string | null
  name?: string | null
  actual_time?: string | null
  estimate_time?: string | null
  location?: string | null
  location_code?: string | null
  transport_mode?: string | null
  transport_name?: string | null
  trip_number?: string | null
  has_cargo?: boolean | null
}

export type ShipmentSourceDetails = {
  source_type: string
  source_ref?: string | null
  received_at?: string | null
  extracted?: Record<string, unknown> | null
  raw_payload?: Record<string, unknown> | null
}

export type ShipmentContainer = {
  id: string
  container_number: string
  container_size?: string | null
  container_type?: string | null
  status?: string | null
  current_location_name?: string | null
  origin_name?: string | null
  destination_name?: string | null
  vessel_name?: string | null
  voyage_number?: string | null
  eta?: string | null
  ata?: string | null
  lfd?: string | null
  lrd?: string | null
  rfd?: string | null
  is_rail_shipment: boolean
  is_in_transit: boolean
  is_at_port: boolean
  is_on_rail: boolean
  is_lfd_needed: boolean
  is_lrd_needed: boolean
  is_completed: boolean
  events: ShipmentEvent[]
  tai_shipment_id?: string | null
  source_details?: ShipmentSourceDetails | null
}

export type OrgShipmentDetail = {
  org_shipment_id: string
  shipment_id: string
  mbl: string
  scac?: string | null
  status?: string | null
  container_count: number
  custom_fields: Record<string, unknown>
  office_id?: number | null
  is_archived: boolean
  archive_reason?: string | null
  tracking_updated_at?: string | null
  source_type?: string | null
  source_ref?: string | null
  tai_shipment_id?: string | null
  booking_number?: string | null
  containers: ShipmentContainer[]
  source_details?: ShipmentSourceDetails | null
}

export type PlatformContainerRow = {
  id: string
  container_number: string
  container_size?: string | null
  container_type?: string | null
  status?: string | null
  current_location_name?: string | null
  vessel_name?: string | null
  eta?: string | null
  ata?: string | null
  lfd?: string | null
  lrd?: string | null
  shipment_id: string
  mbl: string
  scac?: string | null
  is_rail_shipment?: boolean
  is_in_transit?: boolean
  is_at_port?: boolean
  is_on_rail?: boolean
  is_lfd_needed?: boolean
  is_lrd_needed?: boolean
  is_completed?: boolean
  tags?: string[]
  tai_shipment_id?: string | null
  org_id: string
  org_name: string
}

export function formatDt(value?: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString()
}

export function formatDate(value?: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString(undefined, { timeZone: 'UTC' })
}

export function eventSortKey(e: ShipmentEvent): number {
  const t = e.actual_time || e.estimate_time
  if (!t) return Number.MAX_SAFE_INTEGER
  const n = Date.parse(t)
  return Number.isNaN(n) ? Number.MAX_SAFE_INTEGER : n
}
