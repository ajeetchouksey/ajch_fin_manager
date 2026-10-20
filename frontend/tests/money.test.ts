import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatNumber, moneyLocale, parseNumber } from '../src/lib/ledger/money.ts'

test('German and English typed amounts with thousands separators are read correctly', () => {
  assert.equal(parseNumber('1.234,56'), 1234.56)
  assert.equal(parseNumber('1,234.56'), 1234.56)
  assert.equal(parseNumber('1.234.567,89'), 1234567.89)
  assert.equal(parseNumber('1,234,567.89'), 1234567.89)
})

test('a single separator with one or two digits after it is a decimal', () => {
  assert.equal(parseNumber('12,50'), 12.5)
  assert.equal(parseNumber('12.5'), 12.5)
  assert.equal(parseNumber('0,05'), 0.05)
})

test('a single separator with exactly three digits after it is a thousands separator', () => {
  assert.equal(parseNumber('1,234'), 1234)
  assert.equal(parseNumber('1.234'), 1234)
  assert.equal(parseNumber('12.345'), 12345)
})

test('signs, brackets and currency symbols are handled', () => {
  assert.equal(parseNumber('(12.50)'), -12.5)
  assert.equal(parseNumber('-12,50'), -12.5)
  assert.equal(parseNumber('12,50 €'), 12.5)
  assert.equal(parseNumber('€ 1.234,50'), 1234.5)
  assert.equal(parseNumber('₹1,23,456.78'), 123456.78)
})

test('numbers that are not money return null', () => {
  assert.equal(parseNumber(''), null)
  assert.equal(parseNumber('abc'), null)
  assert.equal(parseNumber(undefined), null)
  assert.equal(parseNumber(42), 42)
})

test('each currency has one display convention, not the browser setting', () => {
  assert.equal(moneyLocale('EUR'), 'de-DE')
  assert.equal(moneyLocale('INR'), 'en-IN')
  assert.equal(moneyLocale('usd'), 'en-US')
  assert.equal(moneyLocale(''), 'de-DE')
})

test('formatting follows the currency convention', () => {
  assert.equal(formatNumber(1234.5, 'EUR'), '1.234,50')
  assert.equal(formatNumber(1234.5, 'USD'), '1,234.50')
  assert.equal(formatNumber(1234.5, 'EUR', 0), '1.235')
})

test('what is displayed can be typed back to the same amount', () => {
  for (const [n, c] of [[1234.56, 'EUR'], [987654.32, 'EUR'], [1234.56, 'USD']] as const) {
    assert.equal(parseNumber(formatNumber(n, c)), n)
  }
})
