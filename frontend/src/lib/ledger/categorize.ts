import type { Direction, Transaction } from './types'

/**
 * Category suggestions for a transaction, on this device. Two sources, in order:
 * 1. What the user chose before for the same payee (learned from the Ledger)
 * 2. Keyword rules for common German, Indian and international payees and booking texts
 */

export const TRANSFER_CATEGORY = 'Transfer'

/** Categories that move money between the user's own accounts; left out of income and spending. */
export const isTransfer = (t: Pick<Transaction, 'category'>) => t.category === TRANSFER_CATEGORY

interface Rule {
  category: string
  /** Direction the rule applies to; omitted = both */
  direction?: Direction
  re: RegExp
}

// Order matters: the first matching rule wins. Patterns match inside words on purpose, so German
// compounds work ("Hausratversicherung" → Insurance); short or ambiguous tokens carry \b on both sides.
// Bank category words (Commerzbank, Sparkasse, DKB …) are included so a "Kategorie" column maps too.
const RULES: Rule[] = [
  { category: TRANSFER_CATEGORY, re: /(umbuchung|uebertrag|übertrag|eigene?s? konto|own account|self transfer|transfer to self|\bsweep\b|tagesgeld|kreditkartenabrechnung|credit card (bill|payment)|kk-abrechnung|\bumbuchungen\b)/i },
  { category: 'Salary', direction: 'in', re: /(gehalt|\blohn|bezüge|bezuege|salary|payroll|\bwages|\bsal\s?cr|neft.*\bsal\b|entgelt|besoldung|einkommen)/i },
  { category: 'Bonus', direction: 'in', re: /(\bbonus|prämie|praemie|incentive|tantieme)/i },
  { category: 'Interest & dividends', direction: 'in', re: /(zinsen|zinsgutschrift|dividende|dividend|interest|\bint\.?\s?cr\b|ausschüttung|ausschuettung|kapitalerträge)/i },
  { category: 'Tax refund', direction: 'in', re: /(finanzamt|steuererstattung|tax refund|itr refund)/i },
  { category: 'Child benefit', direction: 'in', re: /(kindergeld|familienkasse|elterngeld)/i },
  { category: 'Pension', direction: 'in', re: /(\brente\b|\brenten|pension)/i },
  { category: 'Rental income', direction: 'in', re: /(mieteinnahme|miete von|rent received|rental income)/i },
  { category: 'Refund', direction: 'in', re: /(erstattung|refund|reversal|cashback|\bstorno|rückzahlung|rueckzahlung)/i },

  { category: 'Pets', direction: 'out', re: /(fressnapf|zooplus|tierarzt|\bvet\b|pet ?shop|futterhaus|haustier)/i },
  { category: 'Childcare', direction: 'out', re: /(kita-gebühr|kitagebühr|kitagebuehr|babysitter|tagesmutter|daycare|creche|kinderbetreuung)/i },
  { category: 'Housing', direction: 'out', re: /(\bmiete\b|kaltmiete|warmmiete|nebenkosten|hausgeld|\brent\b|maintenance charges|wohnungsbau|vonovia|leg immobilien|\bwohnen\b|hausverwaltung)/i },
  { category: 'Groceries', direction: 'out', re: /(\brewe\b|edeka|\blidl|\baldi\b(?! talk)|\bnetto\b|\bpenny\b|kaufland|\bnorma\b|\btegut|\bglobus\b|\breal\b|\bdenn'?s\b|alnatura|bio company|\bdm[- ]drogerie|\bdm fil|rossmann|mueller drogerie|müller drogerie|bigbasket|blinkit|\bzepto|\bdmart|grofers|supermarkt|grocer|tesco|sainsbury|\basda\b|carrefour|walmart|costco|lebensmittel)/i },
  { category: 'Dining out', direction: 'out', re: /(restaurant|\bcafe|bäckerei|baeckerei|backhaus|starbucks|mcdonald|burger king|\bkfc\b|\bsubway\b|domino|pizza|lieferando|\bwolt\b|uber ?eats|deliveroo|swiggy|zomato|imbiss|bistro|gastronomie)/i },
  { category: 'Transport', direction: 'out', re: /(deutsche bahn|db vertrieb|db fernverkehr|db regio|bahn\.de|\bbvg\b|\bmvg\b|\bhvv\b|\bvbb\b|\brmv\b|\bkvb\b|deutschlandticket|flixbus|\buber\b(?! ?eats)|\bbolt\b|free ?now|\btaxi|\bola\b|rapido|irctc|tankstelle|\baral\b|\bshell\b|\besso\b|total ?energies|parkhaus|\bparken|parking|\bsixt\b|share ?now|miles mobility|\btier\b|\blime\b|\bfuel|petrol|mobilität|mobilitaet|\bverkehr)/i },
  { category: 'Utilities', direction: 'out', re: /(\bstrom|stadtwerke|vattenfall|\be\.on\b|eon energie|\benbw\b|\brwe\b|\bgas\b|wasser|electricity|water bill|bescom|tata power|adani electricity|rundfunk|ard zdf|\bgez\b|energie)/i },
  { category: 'Mobile & internet', direction: 'out', re: /(telekom|vodafone|\bo2\b|telefonica|\b1&1\b|1und1|congstar|aldi talk|fraenk|airtel|\bjio\b|\bbsnl\b|internet|broadband|\bdsl\b|glasfaser|mobilfunk|telefon)/i },
  { category: 'Insurance', direction: 'out', re: /(versicherung|allianz|\bhuk\b|\bhuk-|\bergo\b|\baxa\b|generali|debeka|signal iduna|\bdevk\b|\br\+v\b|\blic\b|insurance|haftpflicht|hausrat)/i },
  { category: 'Health', direction: 'out', re: /(apotheke|pharmacy|zahnarzt|\barzt|arztpraxis|\bpraxis|klinik|krankenhaus|hospital|doctor|physio|optiker|fielmann|apollo|\b1mg\b|pharmeasy|medplus|krankenkasse|\baok\b|techniker krankenkasse|barmer|\bdak\b|gesundheit|drogerie)/i },
  { category: 'Subscriptions', direction: 'out', re: /(netflix|spotify|disney|amazon prime|prime video|apple\.com|itunes|google \*|youtube|audible|\bdazn|\bsky\b|\bwow\b|chatgpt|openai|anthropic|claude\.ai|microsoft|adobe|icloud|dropbox|hotstar|sonyliv|abonnement|\babo\b)/i },
  { category: 'Fitness', direction: 'out', re: /(fitness|\bgym\b|mcfit|\bfitx|clever fit|urban sports|john reed|cult\.?fit|\byoga)/i },
  { category: 'Shopping', direction: 'out', re: /(amazon|\bamzn|zalando|\botto\b|\bebay|\bikea\b|\bh&m\b|\bzara\b|primark|tk maxx|\bsaturn\b|media ?markt|decathlon|about you|flipkart|myntra|\bajio\b|nykaa|meesho|apple store|\bshein\b|\btemu\b|aliexpress|einkauf|shopping|bekleidung)/i },
  { category: 'Travel', direction: 'out', re: /(lufthansa|eurowings|ryanair|easyjet|\bcondor\b|indigo|air india|vistara|booking\.com|airbnb|expedia|\bhotel|makemytrip|goibibo|trivago|hostel|\bflug|flight|reisen|urlaub)/i },
  { category: 'Education', direction: 'out', re: /(schule|\bkita\b|kindergarten|universität|universitaet|university|hochschule|udemy|coursera|tuition|school fee|\bvhs\b|goethe|bildung)/i },
  { category: 'Entertainment', direction: 'out', re: /(\bkino|cinema|cinemaxx|\bpvr\b|\binox\b|bookmyshow|eventim|ticketmaster|\bsteam\b|playstation|\bxbox|nintendo|theater|museum|konzert|freizeit)/i },
  { category: 'Gifts & donations', direction: 'out', re: /(spende|donation|unicef|caritas|diakonie|red cross|rotes kreuz|wikimedia|geschenk|\bgift\b)/i },
  { category: 'Taxes', direction: 'out', re: /(finanzamt|steuer|tax payment|advance tax|\btds\b|gst payment)/i },
  { category: 'Loan & EMI', direction: 'out', re: /(darlehen|ratenkredit|kreditrate|tilgung|\brate\b|\bemi\b|\bloan\b|bajaj finance|baufinanzierung)/i },
  { category: 'Savings & investments', direction: 'out', re: /(sparplan|trade republic|scalable|\bdepot\b|\betf\b|wertpapier|zerodha|groww|upstox|\bsip\b|mutual fund|\bppf\b|\bnps\b|bauspar|vanguard|crypto|bitpanda|coinbase|sparen|geldanlage)/i },
  { category: 'Cash withdrawal', direction: 'out', re: /(geldautomat|bargeld|\batm\b|cash withdrawal|\bgaa\b)/i },
  { category: 'Fees & charges', direction: 'out', re: /(kontoführung|kontofuehrung|entgelt für|entgelte|gebühr|gebuehr|bank charges|annual fee|service charge|overdraft|\bdispo|sollzins)/i },
  { category: 'Personal care', direction: 'out', re: /(friseur|frisör|barber|\bsalon\b|kosmetik|\bnail|\bspa\b|douglas|urban company|körperpflege)/i },
]

/**
 * Short key for "same payee": lower case, without dates, numbers, card masks and booking boilerplate,
 * first three meaningful words. "REWE Markt GmbH Berlin 03.02 Kartenzahlung" → "rewe markt gmbh".
 */
export function payeeKey(description: string): string {
  return description
    .toLowerCase()
    .replace(/\b(lastschrift|kartenzahlung|gutschrift|überweisung|ueberweisung|dauerauftrag|sepa|debit|credit|pos|upi|neft|imps|rtgs|ecom|visa|mastercard|girocard|ec)\b/g, ' ')
    .replace(/[0-9]+/g, ' ')
    .replace(/[^a-zäöüß&+ ]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .slice(0, 3)
    .join(' ')
}

/** Learns payee → category from the user's own Ledger (the latest choice wins). */
export function learnFromLedger(tx: Transaction[]): Map<string, { category: string; direction: Direction }> {
  const learned = new Map<string, { category: string; direction: Direction }>()
  const sorted = [...tx].sort((a, b) => a.date.localeCompare(b.date))
  for (const t of sorted) {
    if (!t.category || /^other( income)?$/i.test(t.category)) continue
    const key = payeeKey(t.description)
    if (key) learned.set(`${t.direction}|${key}`, { category: t.category, direction: t.direction })
  }
  return learned
}

export interface Suggestion {
  category: string
  /** Set when the text itself says which way the money went (e.g. "Gehalt" is money in) */
  direction?: Direction
  source: 'history' | 'rule'
}

/**
 * Suggests a category. `direction` narrows the rules when it is known (bank imports);
 * leave it out for free text typed by the user, so "October salary" can suggest Money in.
 */
export function suggestCategory(
  text: string,
  direction?: Direction,
  learned?: Map<string, { category: string; direction: Direction }>,
): Suggestion | null {
  const s = text.trim()
  if (!s) return null
  if (learned) {
    const key = payeeKey(s)
    const dirs: Direction[] = direction ? [direction] : ['out', 'in']
    for (const d of dirs) {
      const hit = key && learned.get(`${d}|${key}`)
      if (hit) return { category: hit.category, direction: hit.direction, source: 'history' }
    }
  }
  for (const r of RULES) {
    if (direction && r.direction && r.direction !== direction) continue
    if (r.re.test(s)) return { category: r.category, direction: r.direction, source: 'rule' }
  }
  return null
}
