/*
 * 校园智服通 CampusMate · ES Module 冒烟自测 verify.mjs
 * -------------------------------------------------------------------------
 * 规范第九节要求提供 verify.mjs，本文件作为兼容入口；
 * 本任务要求的完整断言套件在 verify.cjs，运行：node verify.cjs
 * 运行本文件：node verify.mjs
 */

import assert from 'node:assert/strict';
import E from './assets/js/engine.js';
import DATA from './assets/js/data.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('  PASS  ' + name);
  } catch (err) {
    failed += 1;
    console.log('  FAIL  ' + name);
    console.log('        ' + (err && err.message ? err.message : String(err)));
  }
}

console.log('校园智服通 CampusMate · verify.mjs 冒烟自测');
console.log('说明：完整 47 项断言请运行 node verify.cjs\n');

test('engine 导出必需 API', function () {
  ['tokenize', 'tfidfVector', 'cosine', 'search', 'freeRooms', 'topoSort', 'gpa', 'findConflicts'].forEach(function (name) {
    assert.strictEqual(typeof E[name], 'function', '缺少 ' + name);
  });
});

test('中文分词与同义词扩展可用', function () {
  const index = E.createIndex(DATA.knowledgeBase, { synonyms: DATA.synonyms });
  const tokens = E.tokenize('一卡通丢了怎么办', index.dictionary, DATA.synonyms);
  assert.ok(tokens.indexOf('校园卡') !== -1);
});

test('检索命中 KB-001 且置信度在合法区间', function () {
  const result = E.search('学籍证明怎么办理？', DATA.knowledgeBase, { synonyms: DATA.synonyms });
  assert.strictEqual(result.matched, true);
  assert.strictEqual(result.results[0].id, 'KB-001');
  assert.ok(result.results[0].score >= 0 && result.results[0].score <= 1);
  assert.ok(result.confidence >= 0 && result.confidence <= 100);
});

test('余弦相似度对称', function () {
  const a = E.tfidfVector(['学籍证明', '材料'], new Map([['学籍证明', 2], ['材料', 1]]));
  const b = E.tfidfVector(['材料', '盖章'], new Map([['材料', 1], ['盖章', 2]]));
  assert.ok(Math.abs(E.cosine(a, b) - E.cosine(b, a)) < 1e-12);
});

test('空教室无课数据返回全天空闲', function () {
  const rooms = [{ id: 'R1', name: '测试教室', building: 'A座', capacity: 60, multimedia: true }];
  const list = E.freeRooms({ rooms: rooms, schedule: [], day: 1, week: 8, start: 1, end: 12 });
  assert.strictEqual(list.length, 1);
  assert.strictEqual(list[0].longest, 12);
});

test('拓扑排序能检出环', function () {
  const result = E.topoSort([{ id: 'A', deps: ['B'] }, { id: 'B', deps: ['A'] }]);
  assert.strictEqual(result.hasCycle, true);
});

test('GPA 学分加权正确', function () {
  const result = E.gpa([{ credits: 2, score: 90 }, { credits: 3, score: 80 }]);
  assert.equal(result.gpa4, 3.4);
  assert.equal(result.gpa100, 84);
});

test('冲突检测能报出同节次两地冲突', function () {
  const result = E.findConflicts([
    { name: 'A', day: 3, start: 7, end: 8, location: 'B205' },
    { name: 'B', day: 3, start: 7, end: 8, location: 'C302' }
  ]);
  assert.strictEqual(result.hasConflict, true);
});

console.log('\n结果：' + passed + ' 项通过，' + failed + ' 项失败');
console.log('完整断言：node verify.cjs');
if (failed) process.exitCode = 1;
