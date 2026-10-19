/**
 * German income tax on taxable income (zu versteuerndes Einkommen), with Solidaritätszuschlag and optional
 * church tax. Rules are data per year, each checked against the law text.
 */
import { NOT_ADVICE, TaxYearNotCovered, type TaxEstimate, type TaxSource } from './types'

interface Tariff {
  /** Grundfreibetrag */
  allowance: number
  zone2End: number
  a2: number
  zone3End: number
  a3: number
  c3: number
  zone4End: number
  c4: number
  c5: number
  /** Soli Freigrenze for single assessment (doubled for joint) */
  soliFreigrenze: number
  sources: TaxSource[]
}

const SOLI_LAW: TaxSource = { title: '§§ 3, 4 SolZG 1995', url: 'https://www.gesetze-im-internet.de/solzg_1995/__4.html', checked: '2026-10-16' }

export const DE_TARIFF: Record<number, Tariff> = {
  2025: {
    allowance: 12096,
    zone2End: 17443,
    a2: 932.3,
    zone3End: 68480,
    a3: 176.64,
    c3: 1015.13,
    zone4End: 277825,
    c4: 10911.92,
    c5: 19246.67,
    soliFreigrenze: 19950,
    sources: [
      { title: '§ 32a EStG for 2025 (Bundestag Drucksache 637/24)', url: 'https://dserver.bundestag.de/brd/2024/0637-24.pdf', checked: '2026-10-16' },
      { title: 'SolZG Freigrenze 2025 (replaced from 2026 by BGBl. 2024 I Nr. 449)', url: 'https://ihk-muenchen.de/ihk/documents/Recht-Steuern/Steuerrecht/Einkommensteuer/SteFeG.pdf', checked: '2026-10-16' },
      SOLI_LAW,
    ],
  },
  2026: {
    allowance: 12348,
    zone2End: 17799,
    a2: 914.51,
    zone3End: 69878,
    a3: 173.1,
    c3: 1034.87,
    zone4End: 277825,
    c4: 11135.63,
    c5: 19470.38,
    soliFreigrenze: 20350,
    sources: [
      { title: '§ 32a EStG (from 2026)', url: 'https://www.gesetze-im-internet.de/estg/__32a.html', checked: '2026-10-16' },
      { title: '§ 3 SolZG 1995', url: 'https://www.gesetze-im-internet.de/solzg_1995/__3.html', checked: '2026-10-16' },
      SOLI_LAW,
    ],
  },
}

export const DE_YEARS = Object.keys(DE_TARIFF).map(Number)

function tariffFor(year: number): Tariff {
  const t = DE_TARIFF[year]
  if (!t) throw new TaxYearNotCovered('Germany', String(year), DE_YEARS.map(String))
  return t
}

/** § 32a Abs. 1 EStG for one person. Income is rounded down to the euro, and so is the tax. */
export function incomeTaxSingle(taxableIncome: number, year: number): number {
  const t = tariffFor(year)
  const x = Math.floor(Math.max(taxableIncome, 0))
  let tax: number
  if (x <= t.allowance) tax = 0
  else if (x <= t.zone2End) {
    const y = (x - t.allowance) / 10000
    tax = (t.a2 * y + 1400) * y
  } else if (x <= t.zone3End) {
    const z = (x - t.zone2End) / 10000
    tax = (t.a3 * z + 2397) * z + t.c3
  } else if (x <= t.zone4End) tax = 0.42 * x - t.c4
  else tax = 0.45 * x - t.c5
  return Math.floor(tax)
}

/** Income tax, with splitting for joint assessment (twice the tax on half the joint income). */
export function incomeTax(taxableIncome: number, year: number, joint = false): number {
  return joint ? 2 * incomeTaxSingle(taxableIncome / 2, year) : incomeTaxSingle(taxableIncome, year)
}

/** Solidaritätszuschlag: 5.5% of income tax, nothing up to the Freigrenze, phased in at 11.9% of the excess. */
export function soli(incomeTaxAmount: number, year: number, joint = false): number {
  const free = tariffFor(year).soliFreigrenze * (joint ? 2 : 1)
  if (incomeTaxAmount <= free) return 0
  return Math.round(Math.min(0.055 * incomeTaxAmount, 0.119 * (incomeTaxAmount - free)) * 100) / 100
}

export interface DeEstimateInput {
  year: number
  /** zu versteuerndes Einkommen, after allowances and deductions */
  taxableIncome: number
  joint?: boolean
  /** Church tax rate if the user pays it: 0.08 (Bavaria, Baden-Württemberg) or 0.09 (other states) */
  churchRate?: 0.08 | 0.09
}

export function estimateDE(input: DeEstimateInput): TaxEstimate {
  const { year, taxableIncome } = input
  const joint = !!input.joint
  const t = tariffFor(year)
  const est = incomeTax(taxableIncome, year, joint)
  const s = soli(est, year, joint)
  const church = input.churchRate ? Math.round(est * input.churchRate * 100) / 100 : 0
  const total = Math.round((est + s + church) * 100) / 100
  const next = incomeTax(taxableIncome + 100, year, joint)
  return {
    estimate: true,
    country: 'DE',
    year: String(year),
    currency: 'EUR',
    lines: [
      { label: 'Income tax (Einkommensteuer)', amount: est },
      { label: 'Solidarity surcharge (Solidaritätszuschlag)', amount: s },
      ...(input.churchRate ? [{ label: `Church tax (${Math.round(input.churchRate * 100)}%)`, amount: church }] : []),
    ],
    total,
    averageRate: taxableIncome > 0 ? Math.round((total / taxableIncome) * 10000) / 10000 : 0,
    marginalRate: Math.round(((next - est) / 100) * 10000) / 10000,
    assumptions: [
      `Taxable income of ${Math.round(taxableIncome)} EUR, after all allowances and deductions.`,
      joint ? 'Joint assessment with splitting.' : 'Single assessment.',
      `The first ${t.allowance * (joint ? 2 : 1)} EUR is tax-free (Grundfreibetrag).`,
      input.churchRate ? 'Church tax on the full income tax, without allowances for children.' : 'No church tax.',
      NOT_ADVICE,
    ],
    notCovered: [
      'Child allowances and Kindergeld comparison',
      'Capital income (Abgeltungsteuer)',
      'Progressionsvorbehalt (for example parental or unemployment benefit, or foreign income)',
      'Double taxation relief for foreign income',
      'Tax already paid through payroll (Lohnsteuer); compare with your Lohnsteuerbescheinigung',
    ],
    sources: t.sources,
  }
}
