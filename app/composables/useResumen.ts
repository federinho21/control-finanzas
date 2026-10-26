export interface MonthlyResumen {
  excludedMovements?: number
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
  const api = useApi()
  const auth = useAuth()
  const resumen = useState<MonthlyResumen | null>('monthly-resumen', () => null)
  const loading = useState<boolean>('monthly-resumen-loading', () => false)

  async function loadResumen(mes: string) {
    const version = auth.version()
    loading.value = true
    try {
      const result = await api<MonthlyResumen>(`/api/resumen?mes=${encodeURIComponent(mes)}`)
      if (version === auth.version()) resumen.value = result
    } finally {
      if (version === auth.version()) loading.value = false
    }
  }

  return {
    resumen,
    loading,
    loadResumen
  }
}
