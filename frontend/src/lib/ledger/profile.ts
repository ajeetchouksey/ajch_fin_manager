/**
 * The user's financial profile (countries, accounts, categories, goals, household, investments, tax) kept in
 * the Profile tab of their own Ledger, one row per field, so it stays in their Drive and not on our servers.
 */
/** The user's financial profile. */
export interface UserSchemaDefinition {
  residenceCountries: string[]
  accountTypes: string[]
  expenseCategories: string[]
  declaredGoals?: string[]
  householdMembers?: Array<{ name: string; relationship: string }>
  /** The user's name as banks print it ("ASHA K VERMA"); payments to or from it are transfers */
  ownNames?: string[]
  /** The user's own "text contains → category" rules; they win over learned history */
  categoryRules?: Array<{ match: string; category: string }>
  /** One rate the user typed: 1 base = rate quote. Only used to combine totals in the "Both" view. */
  exchangeRate?: { base: string; quote: string; rate: number }
  investmentPreferences?: {
    hasInvestments: boolean
    types?: string[]
  }
  taxSettings?: {
    country: string
    fillingStatus?: string
  }
}

export const PROFILE_COLUMNS = ['key', 'value', 'updated_at'] as const

/** The profile fields, in the order they are written to the tab. */
export const PROFILE_KEYS = [
  'residenceCountries',
  'accountTypes',
  'expenseCategories',
  'declaredGoals',
  'householdMembers',
  'investmentPreferences',
  'taxSettings',
  'ownNames',
  'categoryRules',
  'exchangeRate',
] as const
export type ProfileKey = (typeof PROFILE_KEYS)[number]

export interface ProfileRow {
  key: ProfileKey
  value: unknown
  updatedAt: string
  /** 1-based sheet row, for updates (not stored) */
  row?: number
}

/** Reads the tab's rows. Unknown keys and unreadable values are skipped, never guessed. */
export function rowToProfileRow(r: unknown[], row: number): ProfileRow | null {
  const key = String(r[0] ?? '').trim() as ProfileKey
  if (!(PROFILE_KEYS as readonly string[]).includes(key)) return null
  try {
    return { key, value: JSON.parse(String(r[1] ?? 'null')), updatedAt: String(r[2] ?? ''), row }
  } catch {
    return null
  }
}

export function profileRowToRow(p: ProfileRow): (string | number)[] {
  return [p.key, JSON.stringify(p.value ?? null), p.updatedAt]
}

/** The profile from its rows, or null when the tab holds none of the required fields. */
export function rowsToProfile(rows: ProfileRow[]): UserSchemaDefinition | null {
  if (!rows.length) return null
  const get = (k: ProfileKey) => rows.find((r) => r.key === k)?.value
  const list = (v: unknown) => (Array.isArray(v) ? (v as unknown[]).map(String) : [])
  const profile: UserSchemaDefinition = {
    residenceCountries: list(get('residenceCountries')),
    accountTypes: list(get('accountTypes')),
    expenseCategories: list(get('expenseCategories')),
  }
  const goals = get('declaredGoals')
  if (Array.isArray(goals)) profile.declaredGoals = goals.map(String)
  const household = get('householdMembers')
  if (Array.isArray(household)) {
    profile.householdMembers = household
      .filter((m): m is { name: unknown; relationship: unknown } => !!m && typeof m === 'object')
      .map((m) => ({ name: String(m.name ?? ''), relationship: String(m.relationship ?? '') }))
  }
  const own = get('ownNames')
  if (Array.isArray(own)) profile.ownNames = own.map(String).map((n) => n.trim()).filter(Boolean)
  const rules = get('categoryRules')
  if (Array.isArray(rules)) {
    profile.categoryRules = rules
      .filter((r): r is { match: unknown; category: unknown } => !!r && typeof r === 'object')
      .map((r) => ({ match: String(r.match ?? '').trim(), category: String(r.category ?? '').trim() }))
      .filter((r) => r.match && r.category)
  }
  const fx = get('exchangeRate') as { base?: unknown; quote?: unknown; rate?: unknown } | null
  if (fx && typeof fx === 'object' && Number(fx.rate) > 0 && Number.isFinite(Number(fx.rate)) && fx.base && fx.quote) {
    profile.exchangeRate = { base: String(fx.base).toUpperCase(), quote: String(fx.quote).toUpperCase(), rate: Number(fx.rate) }
  }
  const inv = get('investmentPreferences')
  if (inv && typeof inv === 'object') profile.investmentPreferences = inv as UserSchemaDefinition['investmentPreferences']
  const tax = get('taxSettings')
  if (tax && typeof tax === 'object') profile.taxSettings = tax as UserSchemaDefinition['taxSettings']
  return profile
}

/**
 * Merges an update into the profile: fields sent replace what is stored (so un-ticking an item sticks);
 * fields not sent are kept.
 */
export function mergeProfile(current: UserSchemaDefinition | null, update: Partial<UserSchemaDefinition>): UserSchemaDefinition {
  const base: UserSchemaDefinition = current ?? { residenceCountries: [], accountTypes: [], expenseCategories: [] }
  const out: UserSchemaDefinition = { ...base }
  for (const k of PROFILE_KEYS) {
    if (k in update) (out as unknown as Record<string, unknown>)[k] = (update as Record<string, unknown>)[k]
  }
  return out
}

/** The rows to write for a profile: every field that has a value. */
export function profileToRows(profile: UserSchemaDefinition, now: string): ProfileRow[] {
  return PROFILE_KEYS.filter((k) => profile[k] !== undefined).map((k) => ({ key: k, value: profile[k], updatedAt: now }))
}

/** Sections the dashboard marks as done, with the same rules the server used. */
export function completedSections(profile: UserSchemaDefinition | null): string[] {
  if (!profile) return []
  const out: string[] = []
  if (profile.residenceCountries?.length) out.push('countries')
  if (profile.accountTypes?.length) out.push('accounts')
  if (profile.expenseCategories?.length) out.push('categories')
  if (profile.declaredGoals?.length) out.push('goals')
  if (profile.householdMembers?.length) out.push('household')
  if (profile.investmentPreferences?.hasInvestments) out.push('investments')
  if (profile.taxSettings) out.push('tax')
  return out
}

/** True when two profiles hold the same values (key order and missing-vs-undefined don't matter). */
export function sameProfile(a: UserSchemaDefinition | null, b: UserSchemaDefinition | null): boolean {
  const norm = (p: UserSchemaDefinition | null) =>
    p ? JSON.stringify(PROFILE_KEYS.map((k) => [k, p[k] === undefined ? null : sortKeys(p[k])])) : 'null'
  return norm(a) === norm(b)
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys)
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.keys(v as Record<string, unknown>)
        .sort()
        .map((k) => [k, sortKeys((v as Record<string, unknown>)[k])]),
    )
  }
  return v
}
