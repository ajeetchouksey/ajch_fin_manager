import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Printer } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { ConnectDrive } from '../components/ledger/ConnectDrive'
import { useLedger } from '../context/LedgerContext'
import { cleanInvestorProfile } from '../lib/ledger/investor'
import { buildReview } from '../lib/ledger/review'
import { LEVEL_LABEL, type Level } from '../lib/ledger/risk'
import { formatMoney, todayIso } from '../lib/ledger/types'

const pct = (v: number) => `${Math.round(v * 1000) / 10}%`
const level = (l: Level | null) => (l ? LEVEL_LABEL[l] : 'Not known')

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card flex flex-col gap-3 p-6 print:break-inside-avoid print:border print:shadow-none">
      <h2 className="card-title">{title}</h2>
      {children}
    </section>
  )
}

const Row = ({ label, value }: { label: string; value: string }) => (
  <li className="flex flex-wrap items-baseline justify-between gap-x-3 py-2">
    <span className="text-slate-300">{label}</span>
    <span className="font-medium tabular-nums text-ink">{value}</span>
  </li>
)

/** One page an adviser, or your own AI, can read: your answers, goals, plans, what you hold and what is missing. */
export function ReviewPackPage() {
  const { status, accounts, balances, transactions, goals, plans, holdings, trades, profile } = useLedger()
  const today = todayIso()
  const review = useMemo(
    () =>
      buildReview({
        accounts,
        balances,
        transactions,
        goals,
        plans,
        holdings,
        trades,
        investor: cleanInvestorProfile(profile?.investorProfile),
        householdMembers: profile?.householdMembers,
        today,
      }),
    [accounts, balances, transactions, goals, plans, holdings, trades, profile, today],
  )

  if (status !== 'ready') {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader eyebrow="Invest" title="Adviser pack" />
        <div className="card"><ConnectDrive context="transactions" /></div>
      </div>
    )
  }

  const r = review
  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <PageHeader
        eyebrow={`Invest - ${r.generatedOn}`}
        title="Adviser pack"
        description="Your situation, goals and investments on one page, to take to an adviser or give to your own AI."
      />
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>
          <Printer className="h-4 w-4" aria-hidden /> Print or save as PDF
        </button>
        <Link to="/invest" className="btn btn-secondary">Back to Invest</Link>
      </div>

      {r.gaps.length > 0 && (
        <div role="note" className="card-tint flex flex-col gap-2 p-5 print:break-inside-avoid">
          <h2 className="card-title">What is missing</h2>
          <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-slate-300">{r.gaps.map((g) => <li key={g}>{g}</li>)}</ul>
        </div>
      )}

      <Block title="About you">
        <ul className="m-0 flex list-none flex-col divide-y divide-line p-0">
          <Row label="Age" value={r.about.age !== null ? `About ${r.about.age}` : 'Not given'} />
          <Row label="Work" value={r.about.work ?? 'Not given'} />
          <Row label="Income" value={r.about.income ?? 'Not given'} />
        </ul>
      </Block>

      <Block title="Risk, in three parts">
        <ul className="m-0 flex list-none flex-col divide-y divide-line p-0">
          <Row label="Ability to take losses" value={level(r.risk.ability)} />
          <Row label="Comfort with losses" value={r.risk.total ? `${level(r.risk.willingness)} (${r.risk.answered} of ${r.risk.total} answered)` : level(r.risk.willingness)} />
          <Row label="Return the goals need" value={level(r.risk.need)} />
        </ul>
        {r.risk.abilityFactors.length > 0 && (
          <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-sm text-slate-400">
            {r.risk.abilityFactors.map((f) => <li key={f.id}>{f.label}: {LEVEL_LABEL[f.level].toLowerCase()}. {f.reason}</li>)}
          </ul>
        )}
        {r.risk.together && <p className="text-slate-300">{r.risk.together}</p>}
      </Block>

      <Block title="Goals paid for from investments">
        {r.goals.length === 0 ? (
          <p className="text-slate-400">None yet. A goal needs a target, a date and an investment or retirement account.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-4 p-0">
            {r.goals.map((g) => (
              <li key={g.id} className="flex flex-col gap-1">
                <span className="font-medium text-ink">{g.name}</span>
                <span className="text-sm text-slate-400">
                  {formatMoney(g.target, g.currency)} by {g.targetDate.slice(0, 7)}. {formatMoney(g.current, g.currency)} set aside, {formatMoney(g.monthly, g.currency)} a month
                  {g.source === 'plans' ? ' from planned investments' : ''}.{' '}
                  {g.neededRate === null ? 'Out of reach at any return.' : g.neededRate === 0 ? 'Saving alone is enough.' : `Needs about ${pct(g.neededRate)} a year.`}
                </span>
                <span className="text-sm text-slate-300">
                  {g.cases.map((c) => `${c.label} (${pct(c.rate)}): ${formatMoney(c.value, g.currency)}`).join(' - ')}
                </span>
              </li>
            ))}
          </ul>
        )}
        {r.warnings.length > 0 && <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-slate-300">{r.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
      </Block>

      {r.plans.length > 0 && (
        <Block title="Planned investments">
          <ul className="m-0 flex list-none flex-col divide-y divide-line p-0">
            {r.plans.map((p, i) => (
              <Row key={`${p.name}-${i}`} label={`${p.name}${p.goal ? ` (for ${p.goal})` : ''}${p.state === 'upcoming' ? ', not started' : ''}`} value={`${formatMoney(p.monthly, p.currency)} a month`} />
            ))}
          </ul>
        </Block>
      )}

      {r.accounts.length > 0 && (
        <Block title="Put in and worth">
          <ul className="m-0 flex list-none flex-col divide-y divide-line p-0">
            {r.accounts.map((a) => (
              <Row
                key={a.id}
                label={`${a.name}: put in ${formatMoney(a.putIn, a.currency)}`}
                value={`${formatMoney(a.worth, a.currency)}${a.changeShare !== null ? ` (${a.change >= 0 ? '+' : ''}${pct(a.changeShare)})` : ''}`}
              />
            ))}
          </ul>
        </Block>
      )}

      {r.allocation.length > 0 && (
        <Block title="How it is spread">
          {r.allocation.map((a) => (
            <div key={a.currency} className="flex flex-col gap-1">
              <span className="text-sm text-slate-400">{a.currency}, total {formatMoney(a.total, a.currency)}</span>
              <ul className="m-0 flex list-none flex-col divide-y divide-line p-0">
                {a.lines.filter((l) => l.value > 0 || l.target).map((l) => (
                  <Row key={l.id} label={l.label} value={`${pct(l.share)}${l.target !== undefined ? ` (target ${l.target}%)` : ''}`} />
                ))}
              </ul>
            </div>
          ))}
          {r.drift.length > 0 && <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-slate-300">{r.drift.map((d) => <li key={d}>{d}</li>)}</ul>}
        </Block>
      )}

      {r.holdings.length > 0 && (
        <Block title="Holdings">
          <ul className="m-0 flex list-none flex-col divide-y divide-line p-0">
            {r.holdings.map((h, i) => (
              <li key={`${h.name}-${i}`} className="flex flex-col gap-0.5 py-2">
                <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="font-medium text-ink">{h.name}{h.isin ? ` (${h.isin})` : ''}</span>
                  <span className="tabular-nums text-ink">{h.value !== null ? formatMoney(h.value, h.currency) : 'No price'}</span>
                </span>
                <span className="text-sm text-slate-400">
                  {h.account}. {h.quantity} units{h.averageCost !== null ? `, average cost ${formatMoney(h.averageCost, h.currency)}` : ''}
                  {h.gainShare !== null ? `. ${h.gainShare >= 0 ? '+' : ''}${pct(h.gainShare)} so far` : ''}
                  {h.yearly !== null ? `, about ${h.yearly >= 0 ? '+' : ''}${pct(h.yearly)} a year` : ''}
                  {h.dividends ? `. Dividends after tax ${formatMoney(h.dividends, h.currency)}` : ''}
                  {h.priceDate ? `. Price from ${h.priceDate}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </Block>
      )}

      <Block title="Questions to take to an adviser">
        <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-slate-300">{r.questions.map((q) => <li key={q}>{q}</li>)}</ul>
      </Block>

      <p className="text-sm text-slate-400">{r.notice}</p>
    </div>
  )
}
