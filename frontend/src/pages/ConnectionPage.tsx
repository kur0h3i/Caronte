import { useParams } from 'react-router'
import { EmptyState } from '../components/feedback'

export function ConnectionPage() {
  const { conn = '' } = useParams()
  return (
    <EmptyState title={conn}>Elige una tabla en la barra lateral para ver su contenido.</EmptyState>
  )
}
