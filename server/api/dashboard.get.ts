import { eventHandler } from 'h3'
import { db } from '~~/server/db'

/**
 * Handles GET /api/dashboard and returns aggregated KPI and hierarchy data.
 * @returns Dashboard payload with rocks, sprints, tasks breakdowns, and global totals.
 * @throws Propagates database query errors when source data cannot be loaded.
 */
export default eventHandler(async () => {
  const allRocks = await db.query.rocks.findMany()
  const allTasks = await db.query.tasks.findMany()
  const allSprints = await db.query.sprints.findMany()

  // Build nested dashboard data: rocks -> sprints -> tasks.
  const rocksNested = allRocks.map((rock) => {
    const rockSprints = allSprints.filter(s => s.rockId === rock.id)
    const rockTasks = allTasks.filter(t => t.rockId === rock.id)
    const completedTasks = rockTasks.filter(t => t.status === 'completed').length
    const totalTasks = rockTasks.length
    const completionPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0

    // Attach sprint-level status breakdown and task summaries.
    const sprintsNested = rockSprints.map((sprint) => {
      const sprintTasks = allTasks.filter(t => t.sprintId === sprint.id)

      return {
        id: sprint.id,
        name: sprint.name,
        rockId: sprint.rockId,
        status: sprint.status,
        startDate: sprint.startDate,
        endDate: sprint.endDate,
        statusBreakdown: {
          pending: sprintTasks.filter(t => t.status === 'pending').length,
          in_progress: sprintTasks.filter(t => t.status === 'in_progress').length,
          completed: sprintTasks.filter(t => t.status === 'completed').length
        },
        tasks: sprintTasks.map(t => ({
          id: t.id,
          description: t.description,
          owner: t.owner,
          priority: t.priority,
          status: t.status,
          deadline: t.deadline
        }))
      }
    })

    return {
      id: rock.id,
      name: rock.name,
      status: rock.status,
      deadline: rock.deadline,
      totalTasks,
      completedTasks,
      completionPercent,
      sprints: sprintsNested
    }
  })

  // Unique owners (headcount), excluding placeholder values.
  const owners = new Set(
    allTasks
      .map(t => t.owner?.trim())
      .filter(o => o && o.toLowerCase() !== 'tbd')
  )

  // Global task counts by status.
  const tasksByStatus = {
    pending: allTasks.filter(t => t.status === 'pending').length,
    in_progress: allTasks.filter(t => t.status === 'in_progress').length,
    completed: allTasks.filter(t => t.status === 'completed').length,
    on_hold: allTasks.filter(t => t.status === 'on_hold').length
  }

  // Global task counts by owner, excluding empty/null and placeholder values.
  const tasksByOwner = Object.entries(
    allTasks.reduce<Record<string, number>>((acc, task) => {
      const owner = task.owner?.trim()

      if (!owner || owner.toLowerCase() === 'tbd') {
        return acc
      }

      acc[owner] = (acc[owner] ?? 0) + 1
      return acc
    }, {})
  )
    .map(([owner, count]) => ({ owner, count }))
    .sort((a, b) => b.count - a.count)

  // Global sprint counts by status.
  const sprintsByStatus = {
    planned: allSprints.filter(s => s.status === 'planned').length,
    in_progress: allSprints.filter(s => s.status === 'in_progress').length,
    completed: allSprints.filter(s => s.status === 'completed').length,
    on_hold: allSprints.filter(s => s.status === 'on_hold').length
  }

  return {
    rocks: rocksNested,
    headcount: owners.size,
    tasksByStatus,
    tasksByOwner,
    sprintsByStatus,
    totals: {
      rocks: allRocks.length,
      sprints: allSprints.length,
      tasks: allTasks.length
    }
  }
})