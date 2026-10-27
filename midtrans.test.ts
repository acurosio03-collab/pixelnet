import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { midtransSignature, normalizeMidtransStatus } from '../src/lib/payments/midtrans-core.ts';

test('signature = SHA512(order_id + status_code + gross_amount + server_key)', () => {
  const expected = createHash('sha512').update('PN-ABC1234567' + '200' + '25000.00' + 'SB-Mid-server-x').digest('hex');
  assert.equal(midtransSignature('PN-ABC1234567', '200', '25000.00', 'SB-Mid-server-x'), expected);
  assert.notEqual(midtransSignature('PN-ABC1234567', '200', '25001.00', 'SB-Mid-server-x'), expected);
});

test('only settlement/capture with code 200 (and non-challenge fraud status) count as paid', () => {
  const n = normalizeMidtransStatus;
  assert.equal(n({ transaction_status: 'settlement', status_code: '200' }), 'paid');
  assert.equal(n({ transaction_status: 'capture', status_code: '200', fraud_status: 'accept' }), 'paid');
  assert.equal(n({ transaction_status: 'capture', status_code: '200', fraud_status: 'challenge' }), 'pending');
  assert.equal(n({ transaction_status: 'settlement', status_code: '201' }), 'pending');
  assert.equal(n({ transaction_status: 'pending', status_code: '201' }), 'pending');
  assert.equal(n({ transaction_status: 'expire', status_code: '407' }), 'expired');
  assert.equal(n({ transaction_status: 'deny', status_code: '202' }), 'failed');
  assert.equal(n({ transaction_status: 'cancel', status_code: '200' }), 'failed');
  assert.equal(n({ transaction_status: 'refund', status_code: '200' }), 'refunded');
  assert.equal(n({ transaction_status: 'partial_refund', status_code: '200' }), 'unknown');
  assert.equal(n({}), 'unknown');
});
