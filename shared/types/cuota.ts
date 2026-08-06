export type CuotaFrecuencia = 'mensual' | 'anual'
export type CuotaStatus = 'active' | 'paused'

export interface Cuota {
  id: string
  nombre: string
  frecuencia: CuotaFrecuencia
  monto: string
  categoria: string
  ultimoPago: string | null
  status: CuotaStatus
  createdAt: string
}
