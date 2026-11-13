import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyze, classify, findAmount, findDates } from './extract';

const kinds = (text: string) => findDates(text).map((d) => `${d.kind}:${d.iso}`);

test('reads common date formats, day first', () => {
  assert.deepEqual(kinds('Date 12/03/2027'), ['other:2027-03-12']);
  assert.deepEqual(kinds('on 2027-03-12.'), ['other:2027-03-12']);
  assert.deepEqual(kinds('12 Mar 2027'), ['other:2027-03-12']);
  assert.deepEqual(kinds('12th March, 2027'), ['other:2027-03-12']);
  assert.deepEqual(kinds('March 12, 2027'), ['other:2027-03-12']);
  assert.deepEqual(kinds('05-01-27'), ['other:2027-01-05']);
});

test('rejects impossible dates and keeps phone numbers out', () => {
  assert.deepEqual(kinds('31/02/2027 and 0300-1234567'), []);
});

test('labels expiry, due and issue dates by the nearest keyword', () => {
  assert.deepEqual(kinds('Date of Issue 01.06.2021  Date of Expiry 01.06.2031'), ['issued:2021-06-01', 'expiry:2031-06-01']);
  assert.deepEqual(kinds('DUE DATE\n15-Nov-26'), ['due:2026-11-15']);
  assert.deepEqual(kinds('Valid till: 30 Sep 2027'), ['expiry:2027-09-30']);
});

test('month-year expiries mean the end of that month', () => {
  assert.deepEqual(kinds('EXP 08/27'), ['expiry:2027-08-31']);
  assert.deepEqual(kinds('Best before Feb 2028'), ['expiry:2028-02-29']);
});

test('skips dates of birth, even on the same line as an expiry', () => {
  assert.deepEqual(kinds('Date of Birth 14/08/1998\nDate of Expiry 14/08/2030'), ['expiry:2030-08-14']);
  assert.deepEqual(kinds('DOB 14/08/1998  Expiry 14/08/2030'), ['expiry:2030-08-14']);
});

test('turns a warranty period into an end date', () => {
  const dates = findDates('Purchase date: 10/01/2026\nModel X200\n1 Year Warranty');
  assert.deepEqual(dates.map((d) => `${d.kind}:${d.iso}`), ['issued:2026-01-10', 'warranty:2027-01-10']);
  const months = findDates('Invoice date 2026-02-28\nWarranty: 6 months');
  assert.equal(months.find((d) => d.kind === 'warranty')?.iso, '2026-08-28');
});

test('finds the final total, not a subtotal', () => {
  assert.deepEqual(findAmount('Subtotal 1,200\nTax 204\nGrand Total Rs. 1,404.50'), { value: 1404.5, currency: 'PKR', raw: 'Rs. 1,404.50' });
  assert.equal(findAmount('AMOUNT PAYABLE\n3,560')?.value, 3560);
  assert.equal(findAmount('Total: $42.10')?.currency, 'USD');
  assert.equal(findAmount('No money here'), null);
});

test('ignores item counts, savings and dates next to total words', () => {
  assert.equal(findAmount('Total Rs 1,860\nTotal Items 3\nTotal Savings 40')?.value, 1860);
  assert.equal(findAmount('Amount due 15-11-2026 Rs 4,200')?.value, 4200);
  assert.equal(findAmount('Sub Total 900\nTotal 1,050')?.value, 1050);
});

test('classifies documents by their vocabulary', () => {
  assert.equal(classify('LESCO electricity bill\nConsumer ID 123\nUnits consumed 240\nMeter reading'), 'bill');
  assert.equal(classify('NADRA Computerized National Identity Card\nHolder name\nDate of Birth'), 'id');
  assert.equal(classify('Rx\nTab. Panadol 500 mg twice daily\nDr. Ahmed Clinic'), 'prescription');
  assert.equal(classify('Hello world'), 'document');
});

test('analyze puts it together with a readable title', () => {
  const a = analyze('IMTIAZ SUPER MARKET\nReceipt #8812\nQty Item\nCash 2000\nChange 140\nTotal Rs 1,860\n12/10/2026\nThank you');
  assert.equal(a.type, 'receipt');
  assert.equal(a.title, 'Imtiaz Super Market');
  assert.equal(a.amount?.value, 1860);
  assert.equal(a.dates[0].iso, '2026-10-12');
});
