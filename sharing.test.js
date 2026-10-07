import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { checklistPath, validUid } from './workspace.js';

const rules = JSON.parse(readFileSync(new URL('./database.rules.json', import.meta.url))).rules;
const snapshot = value => ({
  val: () => value ?? null,
  child: key => snapshot(value?.[key]),
  isString: () => typeof value === 'string'
});
const root = snapshot({ gongsachecklistMembers: { owner: { admin: true } } });
const evaluate = (expression, uid, extra = {}) => runInNewContext(expression, {
  auth: uid ? { uid } : null, root, $uid: 'owner', ...extra
});

test('owner and registered administrator can read and edit the same store', () => {
  for (const operation of ['.read', '.write']) {
    const rule = rules.gongsachecklist.$uid[operation];
    assert.equal(evaluate(rule, 'owner'), true);
    assert.equal(evaluate(rule, 'admin'), true);
    assert.equal(evaluate(rule, 'stranger'), false);
    assert.equal(evaluate(rule, null), false);
  }
  assert.equal(checklistPath('owner'), 'gongsachecklist/owner');
});

test('only the store owner may register another administrator', () => {
  const rule = rules.gongsachecklistMembers.$storeUid.$memberUid['.write'];
  const context = { $storeUid: 'owner', $memberUid: 'newAdmin' };
  assert.equal(evaluate(rule, 'owner', context), true);
  assert.equal(evaluate(rule, 'admin', context), false);
  assert.equal(evaluate(rule, 'stranger', context), false);
  assert.equal(evaluate(rule, null, context), false);
});

test('store preference can only be changed by that account to an allowed store', () => {
  const preference = rules.gongsachecklistProfiles.$uid.storeUid;
  assert.equal(evaluate(preference['.write'], 'admin', { $uid: 'admin' }), true);
  assert.equal(evaluate(preference['.write'], 'stranger', { $uid: 'admin' }), false);
  assert.equal(evaluate(preference['.validate'], 'admin', { newData: snapshot('owner') }), true);
  assert.equal(evaluate(preference['.validate'], 'stranger', { newData: snapshot('owner') }), false);
  assert.equal(evaluate(preference['.validate'], 'admin', { newData: snapshot('admin') }), true);
});

test('store ids cannot change the database path', () => {
  for (const value of ['', '../owner', 'owner/items', 'owner.json', null]) {
    assert.equal(validUid(value), false);
    assert.throws(() => checklistPath(value));
  }
});
