/*
 * 校园智服通 CampusMate · 独立自测脚本 verify.cjs
 * -------------------------------------------------------------------------
 * 运行：node verify.cjs
 * 内容：
 *   1. 核心算法断言（检索、余弦、空教室、拓扑排序、GPA、冲突检测）
 *   2. 本地数据完整性检查
 *   3. index.html 本地资源引用无死链
 *   4. 全库外链、控制台错误输出、未完成标记与占位内容扫描
 *   5. 逐项输出结果，任一失败则进程退出码为 1
 * 本文件不参与页面运行，不会被 index.html 引用。
 */

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = __dirname;
const E = require('./assets/js/engine.js');
const DATA = require('./assets/js/data.js');

// 用拼接方式构造敏感词，避免自测脚本自身被全库关键词扫描误伤
const FORBIDDEN_CONSOLE = 'console' + '.error';
const FORBIDDEN_UNFINISHED = 'TO' + 'DO';
const FORBIDDEN_LOREM = 'Lorem' + ' ipsum';
const FORBIDDEN_PLACEHOLDER = 'x' + 'x' + 'x';

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('  PASS  ' + name);
  } catch (err) {
    failed += 1;
    failures.push({ name: name, message: err && err.message ? err.message : String(err) });
    console.log('  FAIL  ' + name);
    console.log('        ' + (err && err.message ? err.message : String(err)));
  }
}

function approx(actual, expected, epsilon) {
  const e = epsilon == null ? 1e-9 : epsilon;
  assert.ok(Math.abs(Number(actual) - Number(expected)) <= e, '期望 ' + expected + '，实际 ' + actual);
}

function read(relative) {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

function exists(relative) {
  return fs.existsSync(path.join(ROOT, relative));
}

function walk(dir, out) {
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) return out;
  fs.readdirSync(full, { withFileTypes: true }).forEach(function (entry) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(rel, out);
    else out.push(rel);
  });
  return out;
}

console.log('\n校园智服通 CampusMate · 自测 verify.cjs');
console.log('='.repeat(64));
console.log('\n[1] 算法：中文分词与同义词');
test('分词能切出完整业务词「学籍证明」', function () {
  const dict = E.createIndex(DATA.knowledgeBase, { synonyms: DATA.synonyms }).dictionary;
  const tokens = E.tokenize('学籍证明怎么办理？', dict, DATA.synonyms);
  assert.ok(tokens.indexOf('学籍证明') !== -1, '未切出学籍证明：' + tokens.join('/'));
});
test('同义词扩展：一卡通 → 校园卡', function () {
  const dict = E.createIndex(DATA.knowledgeBase, { synonyms: DATA.synonyms }).dictionary;
  const tokens = E.tokenize('一卡通丢了怎么办', dict, DATA.synonyms);
  assert.ok(tokens.indexOf('校园卡') !== -1, '未扩展校园卡：' + tokens.join('/'));
});
test('空输入、纯标点、空词典输入不抛异常', function () {
  assert.deepStrictEqual(E.tokenize('', new Set(['学籍'])), []);
  const punct = E.tokenize('，。！？', new Set(['学籍']));
  assert.ok(Array.isArray(punct));
  const fallback = E.tokenize('宿舍报修', new Set());
  assert.ok(fallback.length > 0, '空词典时应回退内置词典');
});
test('停用词被过滤，查询向量不包含「怎么」', function () {
  const dict = E.createIndex(DATA.knowledgeBase, { synonyms: DATA.synonyms }).dictionary;
  const tokens = E.tokenize('请问宿舍报修怎么办理？', dict, DATA.synonyms);
  assert.ok(tokens.indexOf('怎么') === -1, '仍包含怎么：' + tokens.join('/'));
  assert.ok(tokens.indexOf('宿舍报修') !== -1, '未保留宿舍报修：' + tokens.join('/'));
});

console.log('\n[2] 算法：TF-IDF 与余弦相似度');
test('tfidfVector 对重复词做次线性加权且权重为正', function () {
  const idf = new Map([['报修', 1.5], ['宿舍', 2]]);
  const vec = E.tfidfVector(['报修', '报修', '宿舍'], idf);
  const single = E.tfidfVector(['报修'], idf);
  assert.ok(vec.get('报修') > 0 && vec.get('宿舍') > 0);
  assert.ok(vec.get('报修') < single.get('报修') * 2, '重复词应使用次线性 TF');
  assert.strictEqual(vec.size, 2);
});
test('tfidfVector 空输入返回空向量', function () {
  assert.strictEqual(E.tfidfVector([], new Map()).size, 0);
  assert.strictEqual(E.tfidfVector(null, new Map()).size, 0);
});
test('余弦相似度对称且自身为 1', function () {
  const a = E.normalizeVector(E.tfidfVector(['学籍证明', '盖章', '材料'], new Map([['学籍证明', 2], ['盖章', 1.5], ['材料', 1]])));
  const b = E.normalizeVector(E.tfidfVector(['学籍证明', '辅导员'], new Map([['学籍证明', 2], ['辅导员', 1.2]])));
  approx(E.cosine(a, b), E.cosine(b, a), 1e-12);
  approx(E.cosine(a, a), 1, 1e-9);
});
test('零向量与正交向量余弦为 0', function () {
  assert.strictEqual(E.cosine(new Map(), { x: 1 }), 0);
  assert.strictEqual(E.cosine({ 学籍: 1 }, { 报修: 1 }), 0);
});
test('余弦结果始终落在 [0,1]', function () {
  const idf = new Map([['a', 3], ['b', 0.5], ['c', 2]]);
  const a = E.tfidfVector(['a', 'a', 'b'], idf);
  const b = E.tfidfVector(['a', 'c', 'c', 'c'], idf);
  const value = E.cosine(a, b);
  assert.ok(value >= 0 && value <= 1, '越界：' + value);
});

console.log('\n[3] 检索：命中、排序、置信度与边界');
test('「学籍证明怎么办理」Top-1 命中 KB-001 且分数在 [0,1]', function () {
  const r = E.search('学籍证明怎么办理？', DATA.knowledgeBase, { synonyms: DATA.synonyms, topK: 3 });
  assert.strictEqual(r.matched, true);
  assert.strictEqual(r.results[0].id, 'KB-001');
  assert.ok(r.results[0].score >= 0 && r.results[0].score <= 1);
  assert.ok(r.confidence >= 0 && r.confidence <= 100);
  assert.ok(r.results.length <= 3);
});
test('「校园卡丢了怎么挂失」Top-1 命中 KB-066', function () {
  const r = E.search('校园卡丢了怎么挂失？', DATA.knowledgeBase, { synonyms: DATA.synonyms });
  assert.strictEqual(r.results[0].id, 'KB-066');
});
test('「一卡通丢了」通过同义词扩展仍命中 KB-066', function () {
  const r = E.search('一卡通丢了怎么办', DATA.knowledgeBase, { synonyms: DATA.synonyms });
  assert.strictEqual(r.results[0].id, 'KB-066');
  assert.ok(r.expanded.indexOf('校园卡') !== -1, '扩展词应包含校园卡');
});
test('「宿舍空调不制冷」命中 KB-026', function () {
  const r = E.search('宿舍空调不制冷', DATA.knowledgeBase, { synonyms: DATA.synonyms, topK: 3 });
  assert.strictEqual(r.results[0].id, 'KB-026');
});
test('「毕业离校要办哪些手续」命中 KB-071', function () {
  const r = E.search('毕业离校要办哪些手续？', DATA.knowledgeBase, { synonyms: DATA.synonyms });
  assert.strictEqual(r.results[0].id, 'KB-071');
});
test('无关问题标记为未匹配，不硬答', function () {
  const r = E.search('量子纠缠火锅怎么点单', DATA.knowledgeBase, { synonyms: DATA.synonyms });
  assert.strictEqual(r.matched, false);
  assert.ok(r.topScore < 0.25, '无关问题分数异常：' + r.topScore);
});
test('空查询返回空结果且不抛异常', function () {
  const r = E.search('', DATA.knowledgeBase, { synonyms: DATA.synonyms });
  assert.strictEqual(r.results.length, 0);
  assert.strictEqual(r.matched, false);
});
test('Top-K 数量上限与降序排序正确', function () {
  const r = E.search('校园卡', DATA.knowledgeBase, { synonyms: DATA.synonyms, topK: 4 });
  assert.strictEqual(r.results.length, 4);
  for (let i = 1; i < r.results.length; i += 1) {
    assert.ok(r.results[i - 1].score >= r.results[i].score, '结果未按分数降序');
  }
});

console.log('\n[4] 空教室：区间覆盖、连堂、周次与边界');
const TEST_ROOMS = [
  { id: 'R1', name: 'R1 教室', building: 'A座', capacity: 60, multimedia: true },
  { id: 'R2', name: 'R2 教室', building: 'B座', capacity: 120, multimedia: false }
];
test('无课表时全部教室全天空闲', function () {
  const list = E.freeRooms({ rooms: TEST_ROOMS, schedule: [], day: 1, week: 8, start: 1, end: 12 });
  assert.strictEqual(list.length, 2);
  assert.strictEqual(list[0].bestBlock.start, 1);
  assert.strictEqual(list[0].bestBlock.end, 12);
  assert.strictEqual(list[0].longest, 12);
});
test('全天占满时返回空数组', function () {
  const schedule = [
    { roomId: 'R1', day: 1, start: 1, end: 12, weekStart: 1, weekEnd: 16 },
    { roomId: 'R2', day: 1, start: 1, end: 12, weekStart: 1, weekEnd: 16 }
  ];
  const list = E.freeRooms({ rooms: TEST_ROOMS, schedule: schedule, day: 1, week: 8, start: 3, end: 4 });
  assert.deepStrictEqual(list, []);
});
test('请求区间必须被连续空闲块完整覆盖', function () {
  const only = [TEST_ROOMS[0]];
  const schedule = [{ roomId: 'R1', day: 1, start: 3, end: 4, weekStart: 1, weekEnd: 16 }];
  const covered = E.freeRooms({ rooms: only, schedule: schedule, day: 1, week: 8, start: 1, end: 2 });
  assert.strictEqual(covered.length, 1);
  const blocked = E.freeRooms({ rooms: only, schedule: schedule, day: 1, week: 8, start: 2, end: 3 });
  assert.strictEqual(blocked.length, 0);
});
test('连堂匹配：连续 2 节可选、连续 3 节被过滤', function () {
  const only = [TEST_ROOMS[0]];
  const schedule = [
    { roomId: 'R1', day: 1, start: 3, end: 4, weekStart: 1, weekEnd: 16 },
    { roomId: 'R1', day: 1, start: 7, end: 8, weekStart: 1, weekEnd: 16 }
  ];
  const two = E.freeRooms({ rooms: only, schedule: schedule, day: 1, week: 8, start: 1, end: 2, consecutive: 2 });
  assert.strictEqual(two.length, 1);
  const three = E.freeRooms({ rooms: only, schedule: schedule, day: 1, week: 8, start: 1, end: 2, consecutive: 3 });
  assert.strictEqual(three.length, 0);
});
test('教学周过滤：第 5 周占用、第 9 周空闲', function () {
  const schedule = [{ roomId: 'R1', day: 1, start: 3, end: 4, weekStart: 1, weekEnd: 8 }];
  const week5 = E.freeRooms({ rooms: TEST_ROOMS, schedule: schedule, day: 1, week: 5, start: 3, end: 4 });
  assert.strictEqual(week5.length, 1);
  assert.strictEqual(week5[0].id, 'R2');
  const week9 = E.freeRooms({ rooms: TEST_ROOMS, schedule: schedule, day: 1, week: 9, start: 3, end: 4 });
  assert.strictEqual(week9.length, 2);
});
test('教学楼、容量、多媒体筛选生效，并按可用时长降序', function () {
  const schedule = [
    { roomId: 'R1', day: 1, start: 1, end: 2, weekStart: 1, weekEnd: 16 },
    { roomId: 'R1', day: 1, start: 5, end: 6, weekStart: 1, weekEnd: 16 }
  ];
  const b = E.freeRooms({ rooms: TEST_ROOMS, schedule: schedule, day: 1, week: 8, start: 3, end: 4, building: 'B座' });
  assert.strictEqual(b.length, 1);
  assert.strictEqual(b[0].id, 'R2');
  const big = E.freeRooms({ rooms: TEST_ROOMS, schedule: schedule, day: 1, week: 8, start: 3, end: 4, minCapacity: 100 });
  assert.strictEqual(big.length, 1);
  assert.strictEqual(big[0].id, 'R2');
  const media = E.freeRooms({ rooms: TEST_ROOMS, schedule: schedule, day: 1, week: 8, start: 3, end: 4, multimedia: true });
  assert.strictEqual(media.length, 1);
  assert.strictEqual(media[0].id, 'R1');
  const list = E.freeRooms({ rooms: TEST_ROOMS, schedule: schedule, day: 1, week: 8, start: 3, end: 4 });
  for (let i = 1; i < list.length; i += 1) {
    assert.ok(list[i - 1].longest >= list[i].longest, '未按时长降序');
  }
});
test('非法节次区间与星期不抛异常', function () {
  assert.deepStrictEqual(E.freeRooms({ rooms: TEST_ROOMS, day: 0, start: 1, end: 2 }), []);
  assert.deepStrictEqual(E.freeRooms({ rooms: TEST_ROOMS, day: 1, start: 5, end: 2 }), []);
  assert.ok(Array.isArray(E.freeRooms({ rooms: TEST_ROOMS, day: 1, start: 13, end: 14 })));
  assert.ok(Array.isArray(E.freeRooms({ rooms: TEST_ROOMS, day: 1, start: 1, end: 12, week: 0 })));
});
test('「全占用」下即使部分教室不同也返回空', function () {
  const schedule = [
    { roomId: 'R1', day: 2, start: 3, end: 4, weekStart: 1, weekEnd: 16 },
    { roomId: 'R2', day: 2, start: 3, end: 4, weekStart: 1, weekEnd: 16 }
  ];
  assert.deepStrictEqual(E.freeRooms({ rooms: TEST_ROOMS, schedule: schedule, day: 2, week: 8, start: 3, end: 4 }), []);
});

console.log('\n[5] 拓扑排序：依赖顺序、并行分层与环检测');
test('正常流程满足依赖顺序并输出并行层', function () {
  const nodes = [
    { id: 'A', title: 'A', deps: [] },
    { id: 'B', title: 'B', deps: ['A'] },
    { id: 'C', title: 'C', deps: ['A'] },
    { id: 'D', title: 'D', deps: ['B', 'C'] }
  ];
  const r = E.topoSort(nodes);
  assert.strictEqual(r.hasCycle, false);
  assert.deepStrictEqual(r.levels[0], ['A']);
  assert.deepStrictEqual(r.levels[1], ['B', 'C']);
  assert.deepStrictEqual(r.levels[2], ['D']);
  assert.ok(r.order.indexOf('A') < r.order.indexOf('B'));
  assert.ok(r.order.indexOf('B') < r.order.indexOf('D'));
  assert.strictEqual(r.parallelLevels.length, 1);
});
test('能检出三节点循环依赖且不会死循环', function () {
  const nodes = [
    { id: 'A', deps: ['C'] },
    { id: 'B', deps: ['A'] },
    { id: 'C', deps: ['B'] }
  ];
  const r = E.topoSort(nodes);
  assert.strictEqual(r.hasCycle, true);
  assert.ok(r.cycle.length >= 3, '环路径不完整：' + r.cycle.join('→'));
  assert.ok(r.order.length < 3);
});
test('自依赖与未知依赖处理健壮', function () {
  const self = E.topoSort([{ id: 'A', deps: ['A'] }]);
  assert.strictEqual(self.hasCycle, true);
  const unknown = E.topoSort([{ id: 'A', deps: ['不存在'] }]);
  assert.strictEqual(unknown.hasCycle, false);
  assert.ok(unknown.warnings.length >= 1);
  assert.deepStrictEqual(E.topoSort([]).order, []);
});

console.log('\n[6] GPA：学分加权与非法输入');
test('4.0 制与百分制加权结果正确', function () {
  const r = E.gpa([
    { name: '课程A', credits: 2, score: 90 },
    { name: '课程B', credits: 3, score: 80 }
  ]);
  approx(r.gpa4, 3.4, 1e-9);
  approx(r.gpa100, 84, 1e-9);
  approx(r.totalCredits, 5, 1e-9);
  assert.strictEqual(r.validCount, 2);
});
test('零学分与非法成绩不计入，空列表返回 0', function () {
  const r = E.gpa([
    { name: '有效', credits: 3, score: 75 },
    { name: '零学分', credits: 0, score: 95 },
    { name: '越界', credits: 2, score: 101 },
    { name: '缺成绩', credits: 2 }
  ]);
  assert.strictEqual(r.validCount, 1);
  assert.strictEqual(r.invalidCount, 3);
  approx(r.gpa4, 2.7, 1e-9);
  const empty = E.gpa([]);
  assert.strictEqual(empty.gpa4, 0);
  assert.strictEqual(empty.gpa100, 0);
});
test('绩点映射边界正确', function () {
  assert.strictEqual(E.scoreToPoint(100), 4.0);
  assert.strictEqual(E.scoreToPoint(90), 4.0);
  assert.strictEqual(E.scoreToPoint(89), 3.7);
  assert.strictEqual(E.scoreToPoint(60), 1.0);
  assert.strictEqual(E.scoreToPoint(59), 0);
});

console.log('\n[7] 冲突检测：同天节次 + 教学周');
test('能报出同一天同一节次、两处地点的冲突', function () {
  const r = E.findConflicts([
    { id: 'C1', name: '人工智能导论', day: 3, start: 7, end: 8, location: 'B205', weekStart: 1, weekEnd: 8 },
    { id: 'C2', name: '创新创业基础', day: 3, start: 7, end: 8, location: 'C302', weekStart: 1, weekEnd: 8 }
  ]);
  assert.strictEqual(r.hasConflict, true);
  assert.strictEqual(r.count, 1);
  assert.strictEqual(r.conflicts[0].periods.start, 7);
  assert.deepStrictEqual(r.conflicts[0].locations.sort(), ['B205', 'C302']);
});
test('同天不重叠节次不报冲突', function () {
  const r = E.findConflicts([
    { name: 'A', day: 1, start: 3, end: 4, location: 'A101' },
    { name: 'B', day: 1, start: 5, end: 6, location: 'B201' }
  ]);
  assert.strictEqual(r.hasConflict, false);
});
test('跨教学周不报冲突', function () {
  const r = E.findConflicts([
    { name: 'A', day: 2, start: 3, end: 4, weekStart: 1, weekEnd: 8 },
    { name: 'B', day: 2, start: 3, end: 4, weekStart: 9, weekEnd: 16 }
  ]);
  assert.strictEqual(r.hasConflict, false);
});
test('边界重叠（3—4 与 4—5 节）能报出第 4 节冲突', function () {
  const r = E.findConflicts([
    { name: 'A', day: 4, start: 3, end: 4, location: 'A101' },
    { name: 'B', day: 4, start: 4, end: 5, location: 'B202' }
  ]);
  assert.strictEqual(r.hasConflict, true);
  assert.strictEqual(r.conflicts[0].periods.start, 4);
  assert.strictEqual(r.conflicts[0].periods.end, 4);
});

console.log('\n[8] 学习助手：空闲时段');
test('findFreeSlots 能识别连续空闲与课程占用', function () {
  const courses = [
    { name: 'A', day: 1, start: 1, end: 2, weekStart: 1, weekEnd: 16 },
    { name: 'B', day: 1, start: 5, end: 6, weekStart: 1, weekEnd: 16 }
  ];
  const slots = E.findFreeSlots(courses, { week: 8, start: 1, end: 8, days: [1], minLength: 2 });
  assert.deepStrictEqual(slots, [
    { day: 1, start: 3, end: 4, length: 2 },
    { day: 1, start: 7, end: 8, length: 2 }
  ]);
});
test('recommendSlots 按偏好打分并返回有界数量', function () {
  const courses = [{ name: 'A', day: 1, start: 3, end: 4, weekStart: 1, weekEnd: 16 }];
  const slots = E.recommendSlots(courses, { week: 8, dayStart: 1, dayEnd: 12, minLength: 2, preference: 'morning', limit: 3 });
  assert.ok(slots.length <= 3);
  assert.ok(slots.length > 0);
  assert.ok(slots[0].score >= 24);
});

console.log('\n[9] 本地数据完整性');
test('知识库 ≥ 60 条、9 个分类、ID 唯一且字段齐全', function () {
  const kb = DATA.knowledgeBase;
  assert.ok(kb.length >= 60, '知识条目不足：' + kb.length);
  const ids = new Set();
  const categories = new Set();
  kb.forEach(function (item) {
    assert.ok(item.id && !ids.has(item.id), 'ID 重复或缺失：' + item.id);
    ids.add(item.id);
    ['title', 'category', 'answer', 'question'].forEach(function (key) {
      assert.ok(item[key] && String(item[key]).trim(), item.id + ' 缺字段 ' + key);
    });
    assert.ok(Array.isArray(item.keywords) && item.keywords.length >= 2, item.id + ' 关键词不足');
    categories.add(item.category);
  });
  assert.ok(categories.size >= 6, '分类过少');
});
test('教室 ≥ 30 间，覆盖 5 个工作日 × 12 节', function () {
  assert.ok(DATA.rooms.length >= 30, '教室不足');
  assert.strictEqual(DATA.timetableMeta.days, 5);
  assert.strictEqual(DATA.timetableMeta.periods, 12);
  const days = new Set(DATA.timetable.map(function (entry) { return entry.day; }));
  assert.deepStrictEqual(Array.from(days).sort(), [1, 2, 3, 4, 5]);
  DATA.timetable.forEach(function (entry) {
    assert.ok(entry.start >= 1 && entry.end <= 12 && entry.start <= entry.end, '非法课表区间：' + entry.id);
    assert.ok(entry.roomId && DATA.rooms.some(function (room) { return room.id === entry.roomId; }), '未知教室：' + entry.roomId);
  });
});
test('8 条办事流程均无循环依赖，且至少两个并行层', function () {
  assert.ok(DATA.procedures.length >= 8);
  DATA.procedures.forEach(function (proc) {
    const result = E.topoSort(proc.nodes);
    assert.strictEqual(result.hasCycle, false, proc.title + ' 存在循环依赖');
    assert.strictEqual(result.order.length, proc.nodes.length);
    assert.ok(proc.nodes.length >= 4);
  });
  const parallel = DATA.procedures.filter(function (proc) { return E.topoSort(proc.nodes).parallelLevels.length > 0; });
  assert.ok(parallel.length >= 2, '可并行流程过少');
});
test('个人课表存在示例冲突，GPA 数据可计算', function () {
  const conflicts = E.findConflicts(DATA.studentCourses);
  assert.strictEqual(conflicts.hasConflict, true);
  const result = E.gpa(DATA.gpaCourses);
  assert.ok(result.gpa4 > 0 && result.gpa4 <= 4);
  assert.ok(result.gpa100 > 0 && result.gpa100 <= 100);
});

console.log('\n[10] 本地资源引用与外链扫描');
const REQUIRED_FILES = [
  'index.html',
  'assets/css/tokens.css',
  'assets/css/app.css',
  'assets/js/data.js',
  'assets/js/engine.js',
  'assets/js/ai.js',
  'assets/js/app.js',
  // 开源发布版不包含 .md 文档，此处仅校验运行时所需文件与自测脚本本身
  'verify.cjs'
];
test('所有交付文件均存在', function () {
  REQUIRED_FILES.forEach(function (file) {
    assert.ok(exists(file), '缺少文件：' + file);
  });
});
test('index.html 中的本地 script/link 引用均存在', function () {
  const html = read('index.html');
  const refs = [];
  const re = /<(?:script|link)\b[^>]*\b(?:src|href)="([^"]+)"/gi;
  let match;
  while ((match = re.exec(html))) refs.push(match[1]);
  assert.ok(refs.length >= 6, '引用数量异常：' + refs.length);
  refs.forEach(function (ref) {
    if (/^(#|data:|mailto:)/i.test(ref)) return;
    assert.ok(!/^https?:/i.test(ref), '存在外链引用：' + ref);
    assert.ok(exists(ref), '引用文件不存在：' + ref);
  });
});
test('index.html 没有内联外链与可疑占位内容', function () {
  const html = read('index.html');
  assert.ok(!/https?:\/\//i.test(html), 'index.html 存在外链');
  assert.ok(html.indexOf(FORBIDDEN_UNFINISHED) === -1, 'index.html 存在未完成标记');
  assert.ok(html.indexOf(FORBIDDEN_LOREM) === -1, 'index.html 存在占位段落');
});
test('运行时代码没有控制台错误、未完成标记与占位内容', function () {
  const files = ['assets/js/data.js', 'assets/js/engine.js', 'assets/js/ai.js', 'assets/js/app.js'];
  files.forEach(function (file) {
    const text = read(file);
    assert.ok(text.indexOf(FORBIDDEN_CONSOLE) === -1, file + ' 存在控制台错误输出');
    assert.ok(text.indexOf(FORBIDDEN_UNFINISHED) === -1, file + ' 存在未完成标记');
    assert.ok(text.indexOf(FORBIDDEN_LOREM) === -1, file + ' 存在占位段落');
    assert.ok(text.toLowerCase().indexOf(FORBIDDEN_PLACEHOLDER) === -1, file + ' 存在占位字符串');
  });
});
test('全库（html/css/js/md）无外部网络链接', function () {
  const files = walk('.', []).filter(function (file) {
    return /\.(html|css|js|md)$/i.test(file);
  });
  const hits = [];
  files.forEach(function (file) {
    const text = read(file);
    const matches = text.match(/https?:\/\//gi);
    if (matches) hits.push(file + ' × ' + matches.length);
  });
  assert.deepStrictEqual(hits, [], '发现外链：' + hits.join('；'));
});
test('AI 层是唯一发起 fetch 的运行时文件', function () {
  ['assets/js/data.js', 'assets/js/engine.js', 'assets/js/app.js'].forEach(function (file) {
    assert.ok(!/\bfetch\s*\(/.test(read(file)), file + ' 不应直接发起网络请求');
  });
  assert.ok(/\bfetch\s*\(/.test(read('assets/js/ai.js')), 'ai.js 应包含可选 API 调用');
});

console.log('\n' + '='.repeat(64));
console.log('结果：' + passed + ' 项通过，' + failed + ' 项失败');
if (failed) {
  failures.forEach(function (item) {
    console.log('  - ' + item.name + '：' + item.message);
  });
  process.exitCode = 1;
} else {
  console.log('全部断言通过。');
}
