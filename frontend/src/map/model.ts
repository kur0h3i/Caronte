import type {
  CellValue,
  GraphRelation,
  GraphTable,
  Neighbors,
  Row,
  SchemaGraph,
} from '../api/types'

/**
 * Modelo del mapa "Estigia" (sin dibujo ni física: eso es cosa de engine.ts).
 *
 * Hay dos clases de nodos:
 *   - tabla: un "astro" por tabla; su tamaño crece con el nº de filas.
 *   - fila: una estrella pequeña que orbita su tabla; se añaden al "sembrar" filas de una
 *     tabla o al desplegar las relaciones de otra fila.
 * Y cuatro clases de enlaces:
 *   - schema: FK entre tablas (el esqueleto del esquema).
 *   - member: fila -> su tabla (la mantiene cerca de su astro).
 *   - fk:     fila -> fila referenciada (sigue la dirección de la FK).
 *   - m2m:    fila <-> fila a través de una tabla pivote (N:M).
 */

export type NodeKind = 'table' | 'row'
export type LinkKind = 'schema' | 'member' | 'fk' | 'm2m'

export interface NodeData {
  id: string
  kind: NodeKind
  table: string
  rowId?: string | number
  label: string
  /** Etiqueta original, sin el #id que se añade cuando hay duplicadas. */
  baseLabel?: string
  colorIndex: number
  radius: number
  expanded: boolean
  junction: boolean
  /** Nodo junto al que aparece al crearse (efecto de "brotar"). */
  spawnNear?: string
}

export interface LinkData {
  id: string
  kind: LinkKind
  source: string
  target: string
  label: string
}

export const tableNodeId = (table: string) => `t:${table}`
export const rowNodeId = (table: string, id: string | number) => `r:${table}:${id}`

const MAX_LABEL = 40

export function labelText(value: CellValue | undefined, fallback: string): string {
  if (value == null || value === '') return fallback
  const text =
    typeof value === 'object'
      ? 'label' in value && value.label != null
        ? String(value.label)
        : JSON.stringify(value)
      : String(value)
  return text.length > MAX_LABEL ? `${text.slice(0, MAX_LABEL - 1)}…` : text
}

function plainId(value: CellValue | undefined): string | number | undefined {
  if (value == null) return undefined
  if (typeof value === 'object' && !Array.isArray(value) && 'id' in value) {
    return plainId(value.id)
  }
  return typeof value === 'number' || typeof value === 'string' ? value : String(value)
}

/**
 * Es un "store" externo: React lo lee con useSyncExternalStore(model.subscribe, model.getVersion)
 * y cada mutación llama a notify() para que la vista se actualice.
 */
export class MapModel {
  private listeners = new Set<() => void>()
  private version = 0

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getVersion = () => this.version

  private notify() {
    this.version++
    for (const listener of this.listeners) listener()
  }

  nodeList(): NodeData[] {
    return [...this.nodes.values()]
  }

  linkList(): LinkData[] {
    return [...this.links.values()]
  }

  nodes = new Map<string, NodeData>()
  links = new Map<string, LinkData>()
  /** Datos de cada fila (para el panel lateral). */
  rows = new Map<string, Row>()
  /** Vecinos ya consultados de cada fila desplegada. */
  neighbors = new Map<string, Neighbors>()
  tables = new Map<string, GraphTable>()
  /** Cuántas filas se han sembrado por tabla (para pedir las siguientes). */
  seeded = new Map<string, number>()
  private colors = new Map<string, number>()
  /** FKs de una sola columna que salen de cada tabla (para enlazar filas sembradas). */
  private relationsFrom = new Map<string, GraphRelation[]>()
  /** Enlaces entre filas que esperan a que ambos extremos estén en el mapa. */
  private pendingRefs = new Map<string, LinkData>()
  /** tabla + etiqueta -> nodos con esa etiqueta (para detectar duplicadas sin recorrer todo). */
  private labelIndex = new Map<string, Set<string>>()

  loadSchema(graph: SchemaGraph) {
    this.nodes.clear()
    this.links.clear()
    this.rows.clear()
    this.neighbors.clear()
    this.seeded.clear()
    this.pendingRefs.clear()
    this.labelIndex.clear()
    this.relationsFrom = new Map()
    for (const r of graph.relations) {
      if (r.from_columns.length !== 1) continue
      const list = this.relationsFrom.get(r.from_table) ?? []
      list.push(r)
      this.relationsFrom.set(r.from_table, list)
    }
    this.tables = new Map(graph.tables.map((t) => [t.name, t]))
    this.colors = new Map(
      [...graph.tables].sort((a, b) => a.name.localeCompare(b.name)).map((t, i) => [t.name, i]),
    )
    for (const t of graph.tables) {
      this.nodes.set(tableNodeId(t.name), {
        id: tableNodeId(t.name),
        kind: 'table',
        table: t.name,
        label: t.name,
        colorIndex: this.colorOf(t.name),
        radius: t.junction ? 7 : 10 + 4 * Math.log10((t.approx_rows ?? 0) + 1),
        expanded: false,
        junction: t.junction,
      })
    }
    for (const r of graph.relations) {
      this.addLink('schema', tableNodeId(r.from_table), tableNodeId(r.to_table), r.from_columns[0])
    }
    this.notify()
  }

  colorOf(table: string): number {
    return this.colors.get(table) ?? 0
  }

  get rowCount(): number {
    let n = 0
    for (const node of this.nodes.values()) if (node.kind === 'row') n++
    return n
  }

  addLink(kind: LinkKind, source: string, target: string, label: string) {
    if (source === target) return
    const id = `${kind}:${source}->${target}:${label}`
    if (!this.links.has(id)) this.links.set(id, { id, kind, source, target, label })
  }

  /**
   * Si dos filas de la misma tabla tienen la misma etiqueta (p. ej. varias facturas con la
   * misma dirección), todas muestran además su #id para poder distinguirlas en el mapa.
   */
  private uniqueLabel(table: string, rowId: string | number, base: string, selfId: string) {
    if (base.startsWith('#')) return base
    const key = `${table}\u0000${base}`
    const same = this.labelIndex.get(key) ?? new Set<string>()
    same.add(selfId)
    this.labelIndex.set(key, same)
    if (same.size === 1) return base
    for (const otherId of same) {
      const other = this.nodes.get(otherId)
      if (other && otherId !== selfId) other.label = `${base} #${other.rowId}`
    }
    return `${base} #${rowId}`
  }

  /** Enlace entre dos filas; si aún falta alguna, queda pendiente hasta que aparezca. */
  private addRowLink(kind: LinkKind, source: string, target: string, label: string) {
    if (this.nodes.has(source) && this.nodes.has(target)) this.addLink(kind, source, target, label)
    else
      this.pendingRefs.set(`${kind}:${source}->${target}:${label}`, {
        id: '',
        kind,
        source,
        target,
        label,
      })
  }

  private resolvePending() {
    for (const [key, ref] of this.pendingRefs) {
      if (this.nodes.has(ref.source) && this.nodes.has(ref.target)) {
        this.addLink(ref.kind, ref.source, ref.target, ref.label)
        this.pendingRefs.delete(key)
      }
    }
  }

  /** FKs de una fila sembrada -> enlaces con las filas a las que apunta (si están en el mapa). */
  private linkRowReferences(table: string, nodeId: string, row: Row) {
    for (const rel of this.relationsFrom.get(table) ?? []) {
      const target = plainId(row[rel.from_columns[0]])
      if (target === undefined) continue
      this.addRowLink('fk', nodeId, rowNodeId(rel.to_table, target), rel.from_columns[0])
    }
  }

  /**
   * Filas de una tabla pivote (N:M): no se pintan, pero unen sus dos extremos con un enlace
   * discontinuo si ambos están en el mapa (p. ej. pista <-> playlist).
   */
  linkJunctionRows(table: string, rows: Row[]) {
    const info = this.tables.get(table)
    const rels = (this.relationsFrom.get(table) ?? []).filter((r) =>
      info?.primary_key.includes(r.from_columns[0]),
    )
    if (rels.length < 2) return
    const [a, b] = rels
    for (const row of rows) {
      const idA = plainId(row[a.from_columns[0]])
      const idB = plainId(row[b.from_columns[0]])
      if (idA === undefined || idB === undefined) continue
      this.addRowLink('m2m', rowNodeId(a.to_table, idA), rowNodeId(b.to_table, idB), table)
    }
    this.resolvePending()
    this.notify()
  }

  /** Añade (o actualiza) una fila y la engancha a su tabla. Devuelve el id del nodo. */
  addRow(table: string, rowId: string | number, label: string, spawnNear?: string): string {
    const id = rowNodeId(table, rowId)
    const existing = this.nodes.get(id)
    if (existing) {
      if (existing.label.startsWith('#') && !label.startsWith('#')) {
        existing.baseLabel = label
        existing.label = this.uniqueLabel(table, rowId, label, id)
      }
      return id
    }
    this.nodes.set(id, {
      id,
      kind: 'row',
      table,
      rowId,
      baseLabel: label,
      label: this.uniqueLabel(table, rowId, label, id),
      colorIndex: this.colorOf(table),
      radius: 4.5,
      expanded: false,
      junction: false,
      spawnNear: spawnNear ?? tableNodeId(table),
    })
    this.addLink('member', id, tableNodeId(table), '')
    return id
  }

  /** Filas de muestra de una tabla (las que devolvió /rows). */
  seedRows(table: string, rows: Row[]) {
    const info = this.tables.get(table)
    const pk = info?.primary_key[0]
    if (!info || !pk) return
    for (const row of rows) {
      const rowId = plainId(row[pk])
      if (rowId === undefined) continue
      const id = this.addRow(
        table,
        rowId,
        labelText(info.display_column ? row[info.display_column] : undefined, `#${rowId}`),
      )
      this.rows.set(id, row)
      this.linkRowReferences(table, id, row)
    }
    this.seeded.set(table, (this.seeded.get(table) ?? 0) + rows.length)
    this.resolvePending()
    this.notify()
  }

  /** Incorpora la vecindad de una fila: a qué apunta y quién la referencia. */
  applyNeighbors(data: Neighbors): string {
    const { node } = data
    const center = this.addRow(node.table, node.id, labelText(node.label, `#${node.id}`))
    const centerNode = this.nodes.get(center)!
    centerNode.baseLabel = labelText(node.label, `#${node.id}`)
    centerNode.label = this.uniqueLabel(node.table, node.id, centerNode.baseLabel, center)
    centerNode.expanded = true
    centerNode.radius = 6.5
    this.rows.set(center, data.row)
    this.neighbors.set(center, data)

    for (const out of data.outgoing) {
      const id = this.addRow(out.table, out.id, labelText(out.label, `#${out.id}`), center)
      this.addLink('fk', center, id, out.column)
    }
    for (const group of data.incoming) {
      for (const item of group.items) {
        const id = this.addRow(group.table, item.id, labelText(item.label, `#${item.id}`), center)
        if (group.via) this.addLink('m2m', center, id, group.via)
        else this.addLink('fk', id, center, group.column)
      }
    }
    this.resolvePending()
    this.notify()
    return center
  }

  /** Quita todas las filas y deja solo el esqueleto de tablas. */
  clearRows() {
    for (const [id, node] of this.nodes) if (node.kind === 'row') this.nodes.delete(id)
    for (const [id, link] of this.links) if (link.kind !== 'schema') this.links.delete(id)
    this.rows.clear()
    this.neighbors.clear()
    this.seeded.clear()
    this.pendingRefs.clear()
    this.labelIndex.clear()
    this.notify()
  }
}
