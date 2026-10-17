interface DateParts {
  year: number
  month: number
  day: number
}

export function costaRicaDate(time = Date.now()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Costa_Rica', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(time)
  const field = (type: string) => parts.find(part => part.type === type)!.value
  return `${field('year')}-${field('month')}-${field('day')}`
}

const USER_DATE_REGEX = /^(\d{2})\/(\d{2})\/(\d{4})$/
const DB_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/

function toDateParts(year: number, month: number, day: number): DateParts | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null
  }

  // Validate calendar correctness (including leap years) using UTC components.
  const test = new Date(Date.UTC(year, month - 1, day))
  if (
    test.getUTCFullYear() !== year
    || test.getUTCMonth() + 1 !== month
    || test.getUTCDate() !== day
  ) {
    return null
  }

  return { year, month, day }
}

function parseUserDate(input: string): DateParts | null {
  const match = USER_DATE_REGEX.exec(input.trim())
  if (!match) {
    return null
  }

  const month = Number(match[1])
  const day = Number(match[2])
  const year = Number(match[3])
  return toDateParts(year, month, day)
}

function parseDbDate(input: string): DateParts | null {
  const match = DB_DATE_REGEX.exec(input.trim())
  if (!match) {
    return null
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  return toDateParts(year, month, day)
}

function toDbString(parts: DateParts): string {
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
}

function toUserString(parts: DateParts): string {
  return `${String(parts.month).padStart(2, '0')}/${String(parts.day).padStart(2, '0')}/${String(parts.year).padStart(4, '0')}`
}

// Converts MM/DD/YYYY or YYYY-MM-DD to YYYY-MM-DD with strict validation.
export function normalizeDateToDb(input: string): string {
  const parts = parseUserDate(input) ?? parseDbDate(input)
  if (!parts) {
    throw new Error(`Invalid date: "${input}". Expected MM/DD/YYYY or YYYY-MM-DD.`)
  }

  return toDbString(parts)
}

// Converts MM/DD/YYYY or YYYY-MM-DD to MM/DD/YYYY with strict validation.
export function normalizeDateToUser(input: string): string {
  const parts = parseUserDate(input) ?? parseDbDate(input)
  if (!parts) {
    throw new Error(`Invalid date: "${input}". Expected MM/DD/YYYY or YYYY-MM-DD.`)
  }

  return toUserString(parts)
}

// Converts only MM/DD/YYYY to YYYY-MM-DD, used at user-input boundaries.
export function userDateToDb(input: string): string {
  const parts = parseUserDate(input)
  if (!parts) {
    throw new Error(`Invalid date: "${input}". Expected MM/DD/YYYY.`)
  }

  return toDbString(parts)
}
