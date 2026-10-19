/** What removing an account leaves behind, so the confirmation can say it plainly. */
export interface RemovalImpact {
  /** Transactions still show the account's name; they are not changed */
  transactions: number
  /** Balance history rows kept in the Balances tab; they come back with the account if restored */
  balanceRecords: number
}

/** A transaction belongs to an account by its id, or by its name for rows saved before ids existed. */
export function accountRemovalImpact(
  account: { id: string; name: string },
  transactions: Array<{ accountId?: string; account: string }>,
  balances: Array<{ accountId: string }>,
): RemovalImpact {
  return {
    transactions: transactions.filter((t) => (t.accountId ? t.accountId === account.id : t.account === account.name)).length,
    balanceRecords: balances.filter((b) => b.accountId === account.id).length,
  }
}
