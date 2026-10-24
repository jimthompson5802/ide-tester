import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArguments } from '../src/arguments.js';

test('CLI requires an explicit macOS app and accepts only supported suites', () => {
  assert.deepEqual(parseArguments(['--build', '/Applications/Code.app'], 'darwin'), {
    build: '/Applications/Code.app', suite: 'basic', chatBackend: 'mock',
  });
  for (const suite of ['editing', 'git', 'chat', 'basic']) {
    assert.equal(parseArguments(['--suite', suite, '--build', '/a.app'], 'darwin').suite, suite);
  }
  for (const args of [[], ['--build'], ['--build', '/a'], ['--build', 'relative.app'],
    ['--build', '/a.app', '--suite', 'other'], ['--build', '/a.app', '--suite', 'all'], ['--build', '/a.app', '--extra'],
    ['--build', '/a.app', '--build', '/b.app'], ['--build', '/a.app', '--suite']]) {
    assert.throws(() => parseArguments(args, 'darwin'));
  }
  assert.throws(() => parseArguments(['--build', '/a.app'], 'linux'), /macOS/);
});

test('output accepts text or json and rejects invalid or duplicate options', () => {
  for (const output of ['text', 'json']) {
    assert.equal(parseArguments(['--build', '/a.app', '--output', output], 'darwin').output, output);
  }
  for (const tail of [['--output', 'xml'], ['--output'], ['--output', 'text', '--output', 'json']]) {
    assert.throws(() => parseArguments(['--build', '/a.app', ...tail], 'darwin'));
  }
});

test('Git selection is explicit, mock-only and unavailable for foundation qualification',async()=>{
  const {validateBackend}=await import('../src/arguments.js');
  assert.equal(parseArguments(['--build','/a.app','--suite','git'],'darwin').suite,'git');
  assert.throws(()=>parseArguments(['--build','/a.app','--suite','git','--chat-backend','real'],'darwin'),/Git-only|git-only/);
  assert.throws(()=>validateBackend({build:'/a.app',suite:'git'},true),/Foundation/);
});
