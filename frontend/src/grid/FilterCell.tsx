import { useEffect, useEffectEvent, useState } from 'react'
import type { ColumnInfo, Filter } from '../api/types'
import { filtersToInput, parseFilterInput } from './filterSyntax'

interface Props {
  col: ColumnInfo
  isFk: boolean
  filters: Filter[]
  onChange: (filters: Filter[]) => void
}

export function FilterCell(props: Props) {
  const { col, isFk } = props
  if (!isFk && (col.type === 'bool' || (col.type === 'enum' && col.enum_values?.length))) {
    return <SelectFilter {...props} />
  }
  return <TextFilter {...props} />
}

const PLACEHOLDER: Record<ColumnInfo['type'], string> = {
  text: 'contiene…',
  json: 'contiene…',
  enum: '=valor',
  bool: 'true / false',
  int: '=, >, a..b',
  numeric: '=, >, a..b',
  date: 'aaaa-mm-dd',
  datetime: 'aaaa-mm-dd',
}

const inputClass =
  'h-7 w-full rounded border bg-bg px-1.5 font-mono text-[11px] text-fg outline-none placeholder:text-faint/70'

/**
 * Clave estable de una lista de filtros: `{value: 1}` (llegado por URL) y `{value: "1"}`
 * (tecleado) son el mismo filtro y no deben contar como cambio (reiniciaría la página).
 */
function filtersKey(filters: Filter[]): string {
  return JSON.stringify(
    filters.map((f) => [f.column, f.op, f.value == null ? null : String(f.value)]),
  )
}

function TextFilter({ col, isFk, filters, onChange }: Props) {
  const external = filtersKey(filters)
  const [text, setText] = useState(() => filtersToInput(col, isFk, filters))
  const [prevExternal, setPrevExternal] = useState(external)
  const [ownCommit, setOwnCommit] = useState<string | null>(null)

  // Si los filtros cambian desde fuera (chip eliminada, enlace de FK), sincronizamos el texto.
  // Si el cambio lo provocamos nosotros, no tocamos lo que el usuario está escribiendo.
  if (external !== prevExternal) {
    setPrevExternal(external)
    if (external !== ownCommit) setText(filtersToInput(col, isFk, filters))
  }

  const parsed = parseFilterInput(col, isFk, text)
  const invalid = parsed === 'invalid'

  function commit(value: string) {
    const result = parseFilterInput(col, isFk, value)
    if (result === 'invalid') return
    const key = filtersKey(result)
    if (key === external) return
    setOwnCommit(key)
    onChange(result)
  }

  const commitLater = useEffectEvent(() => commit(text))
  useEffect(() => {
    const timer = setTimeout(commitLater, 600)
    return () => clearTimeout(timer)
  }, [text])

  return (
    <input
      className={`${inputClass} ${
        invalid ? 'border-danger/70' : text ? 'border-accent/60' : 'border-line'
      } focus:border-accent`}
      value={text}
      placeholder={isFk ? 'etiqueta o #id' : PLACEHOLDER[col.type]}
      aria-label={`Filtrar ${col.name}`}
      aria-invalid={invalid}
      title={invalid ? 'Formato no válido para este tipo' : 'null, !null, =, !=, >, <, a..b'}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => commit(text)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit(text)
        if (e.key === 'Escape') {
          setText('')
          commit('')
        }
      }}
    />
  )
}

const NULL = '__null'
const NOT_NULL = '__not_null'

function SelectFilter({ col, filters, onChange }: Props) {
  const current = filters[0]
  const value = !current
    ? ''
    : current.op === 'is_null'
      ? NULL
      : current.op === 'not_null'
        ? NOT_NULL
        : String(current.value)
  const options = col.type === 'bool' ? ['true', 'false'] : (col.enum_values ?? [])

  return (
    <select
      className={`${inputClass} ${value ? 'border-accent/60' : 'border-line'} focus:border-accent`}
      value={value}
      aria-label={`Filtrar ${col.name}`}
      onChange={(e) => {
        const v = e.target.value
        if (!v) onChange([])
        else if (v === NULL) onChange([{ column: col.name, op: 'is_null' }])
        else if (v === NOT_NULL) onChange([{ column: col.name, op: 'not_null' }])
        else onChange([{ column: col.name, op: 'eq', value: v }])
      }}
    >
      <option value="">todos</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
      {col.nullable && <option value={NULL}>null</option>}
      {col.nullable && <option value={NOT_NULL}>!null</option>}
    </select>
  )
}
