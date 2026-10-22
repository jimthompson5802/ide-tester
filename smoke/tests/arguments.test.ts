import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArguments } from '../src/arguments.js';

test('CLI requires an explicit macOS app and accepts only supported suites', () => {
  assert.deepEqual(parseArguments(['--build', '/Applications/Code.app'], 'darwin'), {
    build: '/Applications/Code.app', suite: 'all',
  });
  for (const suite of ['editing', 'chat', 'all']) {
    assert.equal(parseArguments(['--suite', suite, '--build', '/a.app'], 'darwin').suite, suite);
  }
  for (const args of [[], ['--build'], ['--build', '/a'], ['--build', 'relative.app'],
    ['--build', '/a.app', '--suite', 'other'], ['--build', '/a.app', '--extra'],
    ['--build', '/a.app', '--build', '/b.app'], ['--build', '/a.app', '--suite']]) {
    assert.throws(() => parseArguments(args, 'darwin'));
  }
  assert.throws(() => parseArguments(['--build', '/a.app'], 'linux'), /macOS/);
});
