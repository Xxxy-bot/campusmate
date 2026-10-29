(function (root) {
  'use strict';

  /* =========================================================================
   * 校园智服通 CampusMate · 核心算法引擎 engine.js
   * -------------------------------------------------------------------------
   * 本文件只放“可被答辩指着讲”的算法，不碰 DOM、不发请求、不依赖任何库。
   * 浏览器中挂载为 window.CampusEngine；Node 中通过 module.exports 加载。
   *
   * 六组算法：
   *   1. 中文分词：正向最大匹配（FMM）+ 词典 + 同义词/别名扩展
   *   2. 知识检索：TF-IDF 向量 + 余弦相似度 + Top-K 排序
   *   3. 空教室匹配：节次区间覆盖判定 + 连堂空闲块
   *   4. 办事向导：Kahn 拓扑排序 + 并行分层 + 环检测
   *   5. 学业计算：学分加权 GPA（4.0 制 / 百分制）
   *   6. 课表冲突：同天节次区间求交 + 教学周区间求交
   * ========================================================================= */

  const PERIOD_COUNT = 12;

  // 节次时间表（仙桃职业学院演示作息），供学习助手换算“第几节 = 几点”。
  const PERIOD_TIMES = [
    { start: '08:00', end: '08:45' },
    { start: '08:55', end: '09:40' },
    { start: '10:00', end: '10:45' },
    { start: '10:55', end: '11:40' },
    { start: '14:00', end: '14:45' },
    { start: '14:55', end: '15:40' },
    { start: '16:00', end: '16:45' },
    { start: '16:55', end: '17:40' },
    { start: '19:00', end: '19:45' },
    { start: '19:55', end: '20:40' },
    { start: '20:50', end: '21:35' },
    { start: '21:45', end: '22:30' }
  ];

  // 通用中文停用词：检索前过滤，避免“怎么/需要/可以”等虚词稀释向量。
  const DEFAULT_STOPWORDS = [
    '的', '了', '吗', '呢', '啊', '吧', '呀', '哦', '是', '我', '你', '他', '她', '它', '们',
    '这', '那', '这个', '那个', '这些', '那些', '一个', '一下', '一些', '什么', '怎么', '怎样',
    '如何', '为什么', '多少', '多久', '哪里', '哪儿', '可以', '能否', '是否', '需要', '想要',
    '我想', '我要', '请问', '麻烦', '告诉', '有关', '关于', '以及', '或者', '还是', '但是',
    '因为', '所以', '如果', '的话', '进行', '应该', '一般', '具体', '相关', '流程', '步骤',
    '材料', '手续', '办理', '申请', '查询', '问题', '情况', '办法', '方法', '时候', '现在',
    '在', '有', '要', '想', '能', '会', '就', '都', '也', '还', '又', '很', '太', '个', '些',
    '下', '上', '中', '后', '前', '里', '外', '对', '为', '以', '于', '之', '其', '或', '但',
    '而', '并', '等', '被', '把', '让', '给', '从', '到', '由', '着', '过', '得', '地', '和',
    '与', '及', '把', '被', '请问', '麻烦', '一下', '怎么办', '咋办', '怎', '么', '什', '哪',
    '去', '取', '连', '评', '约', '丢', '办', '理', '时', '间', '几', '次', '门', '收',
    'my', 'the', 'a', 'an', 'is', 'are', 'how',
    'what', 'can', 'i', 'to', 'of', 'and', 'for', 'please'
  ];

  // 校园领域基础词典：与 data.js 的关键词合并使用，保证 FMM 能切出完整业务词。
  const DEFAULT_DICTIONARY = [
    '学籍证明', '在读证明', '在校证明', '毕业证明', '学历证明', '成绩单', '成绩复查', '成绩复核',
    '补考', '重修', '缓考', '免修', '选课', '退课', '调停课', '教室借用', '转专业', '休学',
    '复学', '退学', '学籍', '档案', '报到证', '毕业去向', '学生证', '校园卡', '一卡通', '挂失',
    '补办', '充值', '宿舍', '报修', '水电', '空调', '门禁', '校园网', '网络', '快递', '食堂',
    '图书馆', '借阅', '续借', '超期', '罚款', '自习', '座位', '预约', '电子资源', '论文',
    '查重', '奖学金', '助学金', '助学贷款', '勤工助学', '困难补助', '学费减免', '国家奖学金',
    '国家励志奖学金', '体测', '体质测试', '免测', '医保', '报销', '心理咨询', '校医院',
    '实习', '备案', '三方协议', '就业推荐表', '专升本', '招聘会', '简历', '社团', '志愿',
    '竞赛', '比赛', '报名', '场地', '体育馆', '校车', '请假', '走读', '防诈骗', '失物招领',
    '教务处', '学生工作处', '后勤', '财务处', '保卫处', '教学周', '节次', '教室', '容量',
    '多媒体', '学分', '绩点', 'gpa', '加权', '课表', '冲突', '空闲', '拓扑排序', '并行',
    '先修', '依赖', '图书借阅', '办件', '维修单', '数据分析', '折线图', '柱状图', '环形图',
    '图书', '毕业', '考试', '收费', '不合格', '上门', '报名时间', '成绩', '课程', '上课'
  ];

  /* ------------------------------------------------------------------ *
   * 基础工具
   * ------------------------------------------------------------------ */

  function normalize(text) {
    return String(text == null ? '' : text)
      .replace(/[\uFF01-\uFF5E]/g, function (ch) {
        // 全角 ASCII 转半角，保证“ＧＰＡ”“１２３”也能被匹配
        return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0);
      })
      .toLowerCase()
      .replace(/[^\u3400-\u9fffA-Za-z0-9]+/g, ' ')
      .trim();
  }

  function isCjk(ch) {
    return /[\u3400-\u9fff]/.test(ch);
  }

  function clamp(num, min, max) {
    const n = Number(num);
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, n));
  }

  function round(num, digits) {
    const p = Math.pow(10, digits == null ? 2 : digits);
    return Math.round((Number(num) + Number.EPSILON) * p) / p;
  }

  function toSet(value) {
    if (value instanceof Set) return value;
    if (Array.isArray(value)) return new Set(value.filter(Boolean).map(String));
    return new Set();
  }

  function addDictionaryText(dict, text) {
    if (text == null) return;
    const full = normalize(text);
    if (!full) return;
    if (full.length <= 18) dict.add(full);
    full.split(' ').forEach(function (part) {
      if (part.length >= 2 && part.length <= 18) dict.add(part);
    });
  }

  /**
   * 建立 FMM 词典：基础词 + 文档标题 / 关键词 / 分类 / 标准问题 + 同义词。
   * 标题整串也会入典，保证“学籍证明办理”这类固定说法不被切碎。
   */
  function createDictionary(docs, extras, synonyms) {
    const dict = new Set(DEFAULT_DICTIONARY);
    // 把停用词也放进词典，FMM 才能把“怎么/请问/办理”整体切出后过滤掉，
    // 避免退化成“怎/么/办/理”这类无意义单字，稀释查询向量。
    DEFAULT_STOPWORDS.forEach(function (word) { dict.add(word); });
    (extras || []).forEach(function (word) {
      addDictionaryText(dict, word);
    });
    if (synonyms) {
      const groups = Array.isArray(synonyms)
        ? synonyms
        : Object.keys(synonyms).map(function (key) { return [key].concat(synonyms[key] || []); });
      groups.forEach(function (group) {
        group.forEach(function (word) { addDictionaryText(dict, word); });
      });
    }
    (docs || []).forEach(function (doc) {
      if (!doc) return;
      addDictionaryText(dict, doc.title);
      addDictionaryText(dict, doc.category);
      (doc.keywords || []).forEach(function (word) {
        addDictionaryText(dict, word);
      });
      (doc.tags || []).forEach(function (word) {
        addDictionaryText(dict, word);
      });
      if (doc.synonyms) {
        Object.keys(doc.synonyms).forEach(function (key) {
          addDictionaryText(dict, key);
          (doc.synonyms[key] || []).forEach(function (alias) {
            addDictionaryText(dict, alias);
          });
        });
      }
    });
    return dict;
  }

  /**
   * 同义词组：canonical -> [aliases]，组内双向扩展。
   * 例如「校园卡 / 一卡通 / 饭卡」会形成一个互通组，查询任一词都能召回同一批条目。
   */
  function buildSynonymGroups(synonyms) {
    const groups = new Map();
    if (!synonyms) return groups;
    let entries = [];
    if (Array.isArray(synonyms)) {
      entries = synonyms.map(function (group) {
        return [group[0], group.slice(1)];
      });
    } else {
      entries = Object.keys(synonyms).map(function (key) {
        return [key, synonyms[key]];
      });
    }
    entries.forEach(function (entry) {
      const members = [entry[0]].concat(Array.isArray(entry[1]) ? entry[1] : [])
        .map(function (w) { return normalize(w); })
        .filter(Boolean);
      if (members.length < 2) return;
      members.forEach(function (member) {
        const set = groups.get(member) || new Set();
        members.forEach(function (other) { if (other !== member) set.add(other); });
        groups.set(member, set);
      });
    });
    return groups;
  }

  /**
   * 正向最大匹配分词（Forward Maximum Matching）。
   * 思路：从左到右，每次在词典中尝试“最长”的词，命中即切；否则退化为单字。
   * 再过滤停用词，并按同义词组做查询扩展。
   *
   * @param {string} text 待分词文本
   * @param {Set|Array} [dictionary] 词典，缺省使用内置校园词典
   * @param {Object|Array|Map} [synonyms] 同义词表，可选
   * @returns {string[]} 词序列（含扩展词）
   */
  function tokenize(text, dictionary, synonyms) {
    const norm = normalize(text);
    if (!norm) return [];
    const dict = dictionary instanceof Set ? dictionary : toSet(dictionary || DEFAULT_DICTIONARY);
    if (!dict.size) {
      DEFAULT_DICTIONARY.forEach(function (w) { dict.add(w); });
    }
    let maxLen = 1;
    dict.forEach(function (word) {
      if (word.length > maxLen) maxLen = word.length;
    });
    maxLen = Math.min(maxLen, 12);

    const raw = [];
    let i = 0;
    while (i < norm.length) {
      const ch = norm[i];
      if (ch === ' ') {
        i += 1;
        continue;
      }
      // 英文、数字整体保留（如 gpa、2026、a101）
      if (/[a-z0-9]/.test(ch)) {
        let j = i + 1;
        while (j < norm.length && /[a-z0-9.]/.test(norm[j])) j += 1;
        raw.push(norm.slice(i, j));
        i = j;
        continue;
      }
      if (!isCjk(ch)) {
        i += 1;
        continue;
      }
      // 中文：从最长候选长度向下找词典
      let matched = '';
      const limit = Math.min(maxLen, norm.length - i);
      for (let len = limit; len >= 1; len -= 1) {
        const candidate = norm.slice(i, i + len);
        if (dict.has(candidate)) {
          matched = candidate;
          break;
        }
      }
      if (matched) {
        raw.push(matched);
        i += matched.length;
      } else {
        raw.push(ch);
        i += 1;
      }
    }

    const stopwords = new Set(DEFAULT_STOPWORDS);
    const base = [];
    raw.forEach(function (word) {
      const w = word.trim();
      if (!w) return;
      if (stopwords.has(w)) return;
      // 纯标点/单空格已在上一步清理；保留单字，让 IDF 自然降低其权重
      base.push(w);
    });

    const groups = buildSynonymGroups(synonyms);
    if (!groups.size) return base;

    const expanded = [];
    const seen = new Set(base);
    base.forEach(function (word) {
      const group = groups.get(word);
      if (!group) return;
      group.forEach(function (alias) {
        if (stopwords.has(alias) || seen.has(alias)) return;
        seen.add(alias);
        expanded.push(alias);
      });
    });
    return base.concat(expanded);
  }

  /* ------------------------------------------------------------------ *
   * TF-IDF + 余弦相似度检索
   * ------------------------------------------------------------------ */

  function vectorEntries(vec) {
    if (!vec) return [];
    if (vec instanceof Map) return Array.from(vec.entries());
    return Object.keys(vec).map(function (key) { return [key, vec[key]]; });
  }

  function entriesToMap(vec) {
    const map = new Map();
    vectorEntries(vec).forEach(function (entry) {
      const value = Number(entry[1]);
      if (Number.isFinite(value) && value !== 0) map.set(entry[0], value);
    });
    return map;
  }

  /**
   * 计算 TF-IDF 向量。
   * TF 使用次线性缩放 1 + ln(count)，避免长文档词频过大；
   * IDF 使用 ln((N+1)/(df+1)) + 1，保证常见词权重仍然为正。
   * 返回未归一化的 Map；调用方可按需归一化。
   */
  function tfidfVector(tokens, idf) {
    const freq = new Map();
    (tokens || []).forEach(function (token) {
      if (!token) return;
      freq.set(token, (freq.get(token) || 0) + 1);
    });
    const vec = new Map();
    freq.forEach(function (count, token) {
      let weight;
      if (idf instanceof Map) weight = idf.get(token);
      else if (idf && typeof idf === 'object') weight = idf[token];
      const idfValue = Number.isFinite(weight) ? Number(weight) : 1;
      vec.set(token, (1 + Math.log(count)) * idfValue);
    });
    return vec;
  }

  function normalizeVector(vec) {
    const map = entriesToMap(vec);
    let sum = 0;
    map.forEach(function (value) { sum += value * value; });
    if (!sum) return new Map();
    const norm = Math.sqrt(sum);
    const out = new Map();
    map.forEach(function (value, key) { out.set(key, value / norm); });
    return out;
  }

  /**
   * 余弦相似度：cos(A,B) = A·B / (|A|·|B|)，结果保证在 [0,1]。
   * 对零向量返回 0，避免除零；对称性由公式本身保证。
   */
  function cosine(vecA, vecB) {
    const a = entriesToMap(vecA);
    const b = entriesToMap(vecB);
    if (!a.size || !b.size) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    a.forEach(function (value) { normA += value * value; });
    b.forEach(function (value) { normB += value * value; });
    if (!normA || !normB) return 0;
    // 遍历较小向量，减少比较次数
    const [small, large] = a.size <= b.size ? [a, b] : [b, a];
    small.forEach(function (value, key) {
      if (large.has(key)) dot += value * large.get(key);
    });
    const result = dot / (Math.sqrt(normA) * Math.sqrt(normB));
    return clamp(Number.isFinite(result) ? result : 0, 0, 1);
  }

  /**
   * 把文档的“标题、关键词、标准问题”转成加权词序列。
   * 标题与关键词是人工提炼的高信号字段，重复计入（字段权重），
   * 答案正文不参与检索，避免长文本稀释主题词。
   */
  function documentTokens(doc, dictionary) {
    if (!doc) return [];
    const tokens = [];
    const title = tokenize(doc.title || '', dictionary, null);
    const keywords = [];
    (doc.keywords || []).forEach(function (word) {
      tokenize(word, dictionary, null).forEach(function (t) { keywords.push(t); });
    });
    const category = tokenize(doc.category || '', dictionary, null);
    const question = tokenize(doc.question || '', dictionary, null);
    // 标题 ×3，关键词 ×3，分类 ×1，标准问题 ×1
    for (let i = 0; i < 3; i += 1) tokens.push.apply(tokens, title);
    for (let i = 0; i < 3; i += 1) tokens.push.apply(tokens, keywords);
    tokens.push.apply(tokens, category);
    tokens.push.apply(tokens, question);
    if (!tokens.length && doc.content) tokens.push.apply(tokens, tokenize(doc.content, dictionary, null));
    return tokens;
  }

  /**
   * 构建检索索引（一次性计算，问答时直接复用）。
   * @param {Array} docs 知识条目
   * @param {Object} options { synonyms, dictionary, stopwords }
   */
  function createIndex(docs, options) {
    const opts = options || {};
    const list = Array.isArray(docs) ? docs : [];
    const dictionary = createDictionary(list, opts.dictionary, opts.synonyms);
    const tokenLists = list.map(function (doc) {
      return documentTokens(doc, dictionary);
    });
    const df = new Map();
    tokenLists.forEach(function (tokens) {
      const unique = new Set(tokens);
      unique.forEach(function (token) {
        df.set(token, (df.get(token) || 0) + 1);
      });
    });
    const n = list.length;
    const idf = new Map();
    df.forEach(function (value, token) {
      idf.set(token, Math.log((n + 1) / (value + 1)) + 1);
    });
    const vectors = tokenLists.map(function (tokens) {
      return normalizeVector(tfidfVector(tokens, idf));
    });
    return {
      __campusIndex: true,
      docs: list,
      dictionary: dictionary,
      synonyms: opts.synonyms || null,
      idf: idf,
      vectors: vectors,
      n: n
    };
  }

  function publicResult(doc, score, rank) {
    return {
      rank: rank,
      id: doc.id || '',
      title: doc.title || '',
      category: doc.category || '',
      question: doc.question || doc.title || '',
      answer: doc.answer || '',
      steps: doc.steps || [],
      materials: doc.materials || [],
      department: doc.department || '',
      place: doc.place || '',
      time: doc.time || '',
      tip: doc.tip || '',
      keywords: doc.keywords || [],
      score: round(score, 4),
      confidence: Math.round(score * 100)
    };
  }

  /**
   * 知识库检索主函数。
   * @param {string} query 用户问句
   * @param {Array|Object} docsOrIndex 知识条目数组，或 createIndex 的返回值
   * @param {Object} options { topK=5, minScore=0.14, synonyms, dictionary }
   * @returns {Object} { query, tokens, expanded, results, matched, topScore, confidence }
   */
  function search(query, docsOrIndex, options) {
    const opts = options || {};
    const topK = Math.max(1, Math.floor(Number(opts.topK) || 5));
    const minScore = Number.isFinite(Number(opts.minScore)) ? Number(opts.minScore) : 0.25;
    const index = docsOrIndex && docsOrIndex.__campusIndex
      ? docsOrIndex
      : createIndex(docsOrIndex || [], {
        synonyms: opts.synonyms,
        dictionary: opts.dictionary
      });
    const tokens = tokenize(query, index.dictionary, opts.synonyms === undefined ? index.synonyms : opts.synonyms);
    const baseTokens = tokenize(query, index.dictionary, null);
    const expanded = tokens.filter(function (token) { return baseTokens.indexOf(token) === -1; });
    const queryVector = normalizeVector(tfidfVector(tokens, index.idf));
    if (!tokens.length || !queryVector.size) {
      return {
        query: String(query == null ? '' : query),
        tokens: tokens,
        expanded: expanded,
        results: [],
        matched: false,
        topScore: 0,
        confidence: 0,
        minScore: minScore,
        indexSize: index.n
      };
    }
    const scored = index.docs.map(function (doc, i) {
      return { doc: doc, score: cosine(queryVector, index.vectors[i]) };
    });
    scored.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return String(a.doc.id || '').localeCompare(String(b.doc.id || ''));
    });
    const results = scored.slice(0, topK).map(function (item, i) {
      return publicResult(item.doc, item.score, i + 1);
    });
    const topScore = results.length ? results[0].score : 0;
    return {
      query: String(query == null ? '' : query),
      tokens: tokens,
      expanded: expanded,
      results: results,
      matched: topScore >= minScore,
      topScore: round(topScore, 4),
      confidence: Math.round(topScore * 100),
      minScore: minScore,
      indexSize: index.n
    };
  }

  /* ------------------------------------------------------------------ *
   * 空教室：区间覆盖 + 连堂空闲块
   * ------------------------------------------------------------------ */

  function intValue(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.round(n) : fallback;
  }

  function activeInWeek(entry, week) {
    if (week == null || week === '' || !Number.isFinite(Number(week))) return true;
    const w = Number(week);
    if (Array.isArray(entry.weeks) && entry.weeks.length) {
      return entry.weeks.map(Number).indexOf(w) !== -1;
    }
    if (entry.weekStart != null && w < intValue(entry.weekStart, 1)) return false;
    if (entry.weekEnd != null && w > intValue(entry.weekEnd, 20)) return false;
    return true;
  }

  function sortBlocks(blocks) {
    return blocks.sort(function (a, b) {
      if (a.start !== b.start) return a.start - b.start;
      return a.end - b.end;
    });
  }

  /**
   * 计算某教室某天的空闲块。
   * 先把被课程占用的节次涂成 true（区间覆盖），再线性扫描得到连续空闲段。
   */
  function freeBlocksForRoom(roomId, params) {
    const p = params || {};
    const schedule = p.schedule || [];
    const day = intValue(p.day, 1);
    const week = p.week;
    const occupied = new Array(PERIOD_COUNT + 1).fill(false);
    schedule.forEach(function (entry) {
      if (!entry) return;
      if (String(entry.roomId || entry.room || '') !== String(roomId)) return;
      if (intValue(entry.day, -1) !== day) return;
      if (!activeInWeek(entry, week)) return;
      const start = clamp(intValue(entry.start, 1), 1, PERIOD_COUNT);
      const end = clamp(intValue(entry.end, start), start, PERIOD_COUNT);
      for (let period = start; period <= end; period += 1) occupied[period] = true;
    });
    const blocks = [];
    let start = null;
    for (let period = 1; period <= PERIOD_COUNT; period += 1) {
      if (!occupied[period]) {
        if (start == null) start = period;
      } else if (start != null) {
        blocks.push({ start: start, end: period - 1, length: period - start });
        start = null;
      }
    }
    if (start != null) {
      blocks.push({ start: start, end: PERIOD_COUNT, length: PERIOD_COUNT - start + 1 });
    }
    return blocks;
  }

  /**
   * 空教室查询。
   * 判定：请求的节次区间必须完全落在一个空闲块内（区间覆盖），
   * 同时可要求“至少连续 N 节”（连堂课匹配）；结果按当日最长连续空闲时长倒序。
   *
   * 参数：rooms, schedule, week, day, start, end, building,
   *       minCapacity, multimedia, consecutive
   * 返回：教室数组，每项附带 freeBlocks、bestBlock、longest、availablePeriods。
   */
  function freeRooms(params) {
    const p = params || {};
    const rooms = Array.isArray(p.rooms) ? p.rooms : [];
    const schedule = Array.isArray(p.schedule) ? p.schedule : [];
    const day = intValue(p.day, 1);
    if (day < 1 || day > 7) return [];
    const start = clamp(intValue(p.start, 1), 1, PERIOD_COUNT);
    const end = clamp(intValue(p.end, PERIOD_COUNT), 1, PERIOD_COUNT);
    if (start > end) return [];
    const week = p.week == null || p.week === '' ? null : intValue(p.week, null);
    const building = p.building && p.building !== 'all' ? String(p.building) : '';
    const minCapacity = Math.max(0, intValue(p.minCapacity, 0));
    const needMultimedia = Boolean(p.multimedia);
    const consecutive = Math.max(1, intValue(p.consecutive, end - start + 1));

    const result = [];
    rooms.forEach(function (room) {
      if (!room) return;
      const id = room.id != null ? room.id : room.roomId;
      if (id == null) return;
      if (building && String(room.building || '') !== building) return;
      if (minCapacity && intValue(room.capacity, 0) < minCapacity) return;
      if (needMultimedia && !room.multimedia) return;
      const blocks = freeBlocksForRoom(id, { schedule: schedule, day: day, week: week });
      // 请求区间必须被某一个连续空闲块完整覆盖
      const covering = blocks.filter(function (block) {
        return block.start <= start && block.end >= end;
      });
      if (!covering.length) return;
      // 连堂课匹配看“覆盖请求区间的这一块”是否够长；
      // 不能拿当天别处的长空闲块来冒充，否则请求 1—2 节也会被 9—12 节的长块带进来。
      if (covering[0].length < consecutive) return;
      let best = blocks[0];
      let availablePeriods = 0;
      blocks.forEach(function (block) {
        availablePeriods += block.length;
        if (block.length > best.length) best = block;
      });
      result.push({
        id: id,
        name: room.name || String(id),
        building: room.building || '',
        capacity: intValue(room.capacity, 0),
        multimedia: Boolean(room.multimedia),
        type: room.type || '标准教室',
        freeBlocks: blocks,
        bestBlock: best,
        longest: best.length,
        availablePeriods: availablePeriods,
        queryBlock: { start: start, end: end, length: end - start + 1 }
      });
    });

    result.sort(function (a, b) {
      if (b.longest !== a.longest) return b.longest - a.longest;
      if (b.availablePeriods !== a.availablePeriods) return b.availablePeriods - a.availablePeriods;
      if (b.capacity !== a.capacity) return b.capacity - a.capacity;
      return String(a.name).localeCompare(String(b.name));
    });
    return result;
  }

  /* ------------------------------------------------------------------ *
   * 拓扑排序：办事流程
   * ------------------------------------------------------------------ */

  function getDeps(node) {
    const raw = node && (node.deps || node.dependencies || node.requires);
    if (!Array.isArray(raw)) return [];
    const seen = new Set();
    const out = [];
    raw.forEach(function (dep) {
      const id = String(dep);
      if (!seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    });
    return out;
  }

  /** 在有向图中找一个真实环（DFS 染色），用于向用户说明哪里形成了循环依赖。 */
  function findCycle(ids, outgoing) {
    const color = new Map();
    const stack = [];
    const position = new Map();
    let found = null;

    function dfs(id) {
      color.set(id, 1);
      position.set(id, stack.length);
      stack.push(id);
      const next = outgoing.get(id) || [];
      for (let i = 0; i < next.length; i += 1) {
        const to = next[i];
        if (color.get(to) === 1) {
          const startIndex = position.get(to) || 0;
          found = stack.slice(startIndex).concat(to);
          return true;
        }
        if (!color.get(to) && dfs(to)) return true;
      }
      stack.pop();
      position.delete(id);
      color.set(id, 2);
      return false;
    }

    for (let i = 0; i < ids.length; i += 1) {
      if (!color.get(ids[i]) && dfs(ids[i])) break;
    }
    return found;
  }

  /**
   * Kahn 拓扑排序 + 并行分层。
   * - order：满足依赖的线性顺序
   * - levels：同一层互不依赖，可并行办理
   * - hasCycle：存在循环依赖时为 true，并返回 cycle 路径
   * 未知依赖会被忽略并写入 warnings，保证旧数据不会让页面白屏。
   */
  function topoSort(nodes) {
    const list = Array.isArray(nodes) ? nodes : [];
    const ids = [];
    const map = new Map();
    const warnings = [];
    list.forEach(function (node) {
      if (!node || node.id == null) return;
      const id = String(node.id);
      if (map.has(id)) {
        warnings.push('节点编号重复，已忽略：' + id);
        return;
      }
      map.set(id, node);
      ids.push(id);
    });
    const outgoing = new Map();
    const indegree = new Map();
    ids.forEach(function (id) {
      outgoing.set(id, []);
      indegree.set(id, 0);
    });
    ids.forEach(function (id) {
      getDeps(map.get(id)).forEach(function (dep) {
        if (!map.has(dep)) {
          warnings.push('未知依赖已忽略：' + dep);
          return;
        }
        outgoing.get(dep).push(id);
        indegree.set(id, (indegree.get(id) || 0) + 1);
      });
    });

    const order = [];
    const levels = [];
    let frontier = ids.filter(function (id) { return indegree.get(id) === 0; });
    while (frontier.length) {
      levels.push(frontier.slice());
      frontier.forEach(function (id) { order.push(id); });
      const next = [];
      frontier.forEach(function (id) {
        (outgoing.get(id) || []).forEach(function (to) {
          indegree.set(to, indegree.get(to) - 1);
          if (indegree.get(to) === 0) next.push(to);
        });
      });
      // 保持原始输入顺序，结果可复现
      next.sort(function (a, b) { return ids.indexOf(a) - ids.indexOf(b); });
      frontier = next;
    }

    const hasCycle = order.length !== ids.length;
    let cycle = [];
    if (hasCycle) {
      const blocked = ids.filter(function (id) { return order.indexOf(id) === -1; });
      cycle = findCycle(blocked, outgoing) || blocked;
    }
    return {
      order: order,
      levels: levels,
      parallelLevels: levels.map(function (level, index) {
        return level.length > 1 ? { level: index, ids: level.slice() } : null;
      }).filter(Boolean),
      hasCycle: hasCycle,
      cycle: cycle,
      warnings: warnings,
      total: ids.length
    };
  }

  /* ------------------------------------------------------------------ *
   * GPA / 学业计算
   * ------------------------------------------------------------------ */

  // 百分制 -> 4.0 制绩点（国内高校常见分段，演示实现）
  const GPA_POINTS = [
    { min: 90, point: 4.0 },
    { min: 85, point: 3.7 },
    { min: 82, point: 3.3 },
    { min: 78, point: 3.0 },
    { min: 75, point: 2.7 },
    { min: 72, point: 2.3 },
    { min: 68, point: 2.0 },
    { min: 64, point: 1.5 },
    { min: 60, point: 1.0 },
    { min: 0, point: 0 }
  ];

  function scoreToPoint(score) {
    const value = clamp(score, 0, 100);
    for (let i = 0; i < GPA_POINTS.length; i += 1) {
      if (value >= GPA_POINTS[i].min) return GPA_POINTS[i].point;
    }
    return 0;
  }

  /**
   * 学分加权 GPA。
   * 4.0 制：Σ(课程绩点 × 学分) / Σ学分
   * 百分制：Σ(成绩 × 学分) / Σ学分
   * 非法成绩或零学分不计入，避免 NaN 污染结果。
   */
  function gpa(courses) {
    const list = Array.isArray(courses) ? courses : [];
    const details = [];
    let totalCredits = 0;
    let weightedPoint = 0;
    let weightedScore = 0;
    let invalidCount = 0;
    list.forEach(function (course) {
      if (!course) {
        invalidCount += 1;
        return;
      }
      const credits = Number(course.credits != null ? course.credits : course.credit);
      const score = Number(course.score);
      if (!Number.isFinite(credits) || credits <= 0 || !Number.isFinite(score) || score < 0 || score > 100) {
        invalidCount += 1;
        return;
      }
      const point = scoreToPoint(score);
      totalCredits += credits;
      weightedPoint += point * credits;
      weightedScore += score * credits;
      details.push({
        name: course.name || '未命名课程',
        credits: round(credits, 2),
        score: round(score, 2),
        point: point,
        qualityPoints: round(point * credits, 2)
      });
    });
    return {
      gpa4: totalCredits ? round(weightedPoint / totalCredits, 2) : 0,
      gpa100: totalCredits ? round(weightedScore / totalCredits, 2) : 0,
      totalCredits: round(totalCredits, 2),
      validCount: details.length,
      invalidCount: invalidCount,
      details: details
    };
  }

  /* ------------------------------------------------------------------ *
   * 课表冲突检测
   * ------------------------------------------------------------------ */

  function weekRange(course) {
    if (!course) return [1, 20];
    if (course.weekStart != null || course.weekEnd != null) {
      const start = intValue(course.weekStart, 1);
      const end = intValue(course.weekEnd, 20);
      return [Math.min(start, end), Math.max(start, end)];
    }
    if (Array.isArray(course.weeks) && course.weeks.length) {
      const nums = course.weeks.map(Number).filter(Number.isFinite);
      if (nums.length) return [Math.min.apply(null, nums), Math.max.apply(null, nums)];
    }
    return [1, 20];
  }

  function weeksOverlap(a, b) {
    const ra = weekRange(a);
    const rb = weekRange(b);
    return !(ra[1] < rb[0] || rb[1] < ra[0]);
  }

  function normalizeCourse(course) {
    if (!course) return null;
    const day = intValue(course.day, -1);
    const start = intValue(course.start != null ? course.start : course.startPeriod, -1);
    const end = intValue(course.end != null ? course.end : course.endPeriod, start);
    if (day < 1 || day > 7 || start < 1 || end < start) return null;
    return {
      id: String(course.id != null ? course.id : (course.name || 'course') + '-' + day + '-' + start),
      name: course.name || '未命名课程',
      day: day,
      start: start,
      end: end,
      location: course.location || course.place || course.room || '',
      teacher: course.teacher || '',
      weekStart: weekRange(course)[0],
      weekEnd: weekRange(course)[1]
    };
  }

  /**
   * 找出同一时间、同一教学周内节次重叠的课程对。
   * 冲突判定：day 相同 && 节次区间相交 && 教学周区间相交。
   * 例：第 3-4 节与第 4-5 节在“第 4 节”重叠，也会被判定为冲突。
   */
  function findConflicts(courses) {
    const list = (Array.isArray(courses) ? courses : []).map(normalizeCourse).filter(Boolean);
    const conflicts = [];
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const a = list[i];
        const b = list[j];
        if (a.day !== b.day) continue;
        const start = Math.max(a.start, b.start);
        const end = Math.min(a.end, b.end);
        if (start > end) continue;
        if (!weeksOverlap(a, b)) continue;
        const locations = [a.location, b.location].filter(Boolean);
        const samePlace = locations.length === 2 && locations[0] === locations[1];
        conflicts.push({
          a: a,
          b: b,
          day: a.day,
          start: start,
          end: end,
          periods: { start: start, end: end, length: end - start + 1 },
          locations: locations,
          reason: samePlace
            ? '同一节次安排了不同课程，地点相同也需确认是否合班'
            : '同一节次在两处地点同时有课'
        });
      }
    }
    return {
      hasConflict: conflicts.length > 0,
      count: conflicts.length,
      conflicts: conflicts,
      checked: list.length
    };
  }

  /* ------------------------------------------------------------------ *
   * 学习助手：空闲时段与推荐
   * ------------------------------------------------------------------ */

  function normalizeFreeOptions(options) {
    const o = options || {};
    return {
      week: o.week == null || o.week === '' ? null : intValue(o.week, null),
      start: clamp(intValue(o.start, 1), 1, PERIOD_COUNT),
      end: clamp(intValue(o.end, PERIOD_COUNT), 1, PERIOD_COUNT),
      days: Array.isArray(o.days) && o.days.length ? o.days.map(Number) : [1, 2, 3, 4, 5],
      minLength: Math.max(1, intValue(o.minLength, 1))
    };
  }

  /**
   * 计算一周内的空闲时段：逐天把课程区间涂占，再扫描连续空闲块。
   * 返回 [{ day, start, end, length }]，可与用户作息（start/end 节）叠加。
   */
  function findFreeSlots(courses, options) {
    const o = normalizeFreeOptions(options);
    const valid = (Array.isArray(courses) ? courses : []).map(normalizeCourse).filter(Boolean);
    const result = [];
    o.days.forEach(function (day) {
      const occupied = new Array(PERIOD_COUNT + 1).fill(false);
      valid.forEach(function (course) {
        if (course.day !== day) return;
        if (!activeInWeek(course, o.week)) return;
        for (let p = course.start; p <= course.end; p += 1) occupied[p] = true;
      });
      let start = null;
      for (let p = o.start; p <= o.end + 1; p += 1) {
        const busy = p <= o.end && occupied[p];
        if (p <= o.end && !busy) {
          if (start == null) start = p;
        } else if (start != null) {
          const blockEnd = p - 1;
          const length = blockEnd - start + 1;
          if (length >= o.minLength) {
            result.push({ day: day, start: start, end: blockEnd, length: length });
          }
          start = null;
        }
      }
    });
    return result;
  }

  /**
   * 每日空闲时段推荐：在空闲块基础上叠加“偏好时段”和“单次时长”打分。
   * 打分 = 连续节数 × 12 + 与偏好时段的重叠节数 × 5，越大越推荐。
   */
  function recommendSlots(courses, options) {
    const o = options || {};
    const dayStart = clamp(intValue(o.dayStart, 1), 1, PERIOD_COUNT);
    const dayEnd = clamp(intValue(o.dayEnd, PERIOD_COUNT), 1, PERIOD_COUNT);
    const minLength = Math.max(1, intValue(o.minLength, 2));
    const preference = o.preference || 'any';
    const limit = Math.max(1, intValue(o.limit, 8));
    const slots = findFreeSlots(courses, {
      week: o.week,
      start: Math.min(dayStart, dayEnd),
      end: Math.max(dayStart, dayEnd),
      days: o.days,
      minLength: minLength
    });
    const ranges = {
      morning: [1, 4],
      afternoon: [5, 8],
      evening: [9, 12]
    };
    const preferred = ranges[preference] || null;
    return slots.map(function (slot) {
      const overlap = preferred
        ? Math.max(0, Math.min(slot.end, preferred[1]) - Math.max(slot.start, preferred[0]) + 1)
        : 0;
      return Object.assign({}, slot, {
        preference: preference,
        score: slot.length * 12 + overlap * 5
      });
    }).sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      if (a.day !== b.day) return a.day - b.day;
      return a.start - b.start;
    }).slice(0, limit);
  }

  /* ------------------------------------------------------------------ *
   * 导出
   * ------------------------------------------------------------------ */

  const API = {
    tokenize: tokenize,
    tfidfVector: tfidfVector,
    cosine: cosine,
    search: search,
    createIndex: createIndex,
    normalizeVector: normalizeVector,
    freeRooms: freeRooms,
    freeBlocksForRoom: freeBlocksForRoom,
    topoSort: topoSort,
    gpa: gpa,
    scoreToPoint: scoreToPoint,
    findConflicts: findConflicts,
    findFreeSlots: findFreeSlots,
    recommendSlots: recommendSlots,
    PERIOD_TIMES: PERIOD_TIMES,
    PERIOD_COUNT: PERIOD_COUNT
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.CampusEngine = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
