import type { ProposedPlan } from '~~/shared/types/plan'

interface PlanPreviewInput {
  plan: ProposedPlan
  actionId: string
  tempId?: string | null
}

/**
 * Manages the preview state for proposed plans, including the plan data and related pending actions.
 * 
 * @returns An object containing plan preview states and methods to set or clear the preview data.
 */
export function usePlanPreview() {
  const plan = useState<ProposedPlan | null>('plan-preview-plan', () => null)
  const actionId = useState<string | null>('plan-preview-action-id', () => null)
  const tempId = useState<string | null>('plan-preview-temp-id', () => null)

  const hasPlan = computed(() => Boolean(plan.value && actionId.value))

  // Stores the latest proposed plan and approval action id for preview mode.
  function setPlan(input: PlanPreviewInput) {
    plan.value = input.plan
    actionId.value = input.actionId
    if (input.tempId !== undefined) tempId.value = input.tempId
  }

  // Sets a provisional document id independently of the plan (e.g. when a file is uploaded before plan generation).
  function setTempId(id: string | null) {
    tempId.value = id
  }

  // Clears all preview state after canceling or completing plan approval.
  function clearPlan() {
    plan.value = null
    actionId.value = null
    tempId.value = null
  }

  return {
    plan,
    actionId,
    tempId,
    hasPlan,
    setPlan,
    setTempId,
    clearPlan
  }
}
