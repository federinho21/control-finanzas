export interface MonthlyResumen {
  month: string
  ingresos: number
  gastos: number
  retiros: number
  balance: number
  movements: Array<{
    id: string
    description: string
    categoria: string
    deadline: string
    monto: string
    tipo: 'ingreso' | 'gasto' | 'retiro'
    status: string
  }>
}

/**
 * Manages the monthly financial summary state.
 *
 * @returns An object containing the monthly summary state and a method to load it for a given month.
 */
export function useResumen() {
  const resumen = useState<MonthlyResumen | null>('monthly-resumen', () => null)
  const loading = useState<boolean>('monthly-resumen-loading', () => false)

  async function loadResumen(mes: string) {
    loading.value = true
    try {
      resumen.value = await $fetch<MonthlyResumen>(`/api/resumen?mes=${mes}`)
    } finally {
      loading.value = false
    }
  }

  return {
    resumen,
    loading,
    loadResumen
  }
}
