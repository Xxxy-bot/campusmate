(function (root) {
  'use strict';

  /* =========================================================================
   * 校园智服通 CampusMate · AI 适配层 ai.js
   * -------------------------------------------------------------------------
   * 双模式：
   *   1. 本地引擎（默认）：调用 CampusEngine 的 TF-IDF + 余弦检索，离线可用。
   *   2. 大模型 API（可选）：在设置面板填 Base URL / Key / 模型名后，
   *      先用本地检索取出 Top-K 知识作为上下文，再调用 OpenAI 兼容接口。
   * 未配置、配置不完整或请求失败时，自动回退本地引擎，并返回 fallback 标记。
   * ========================================================================= */

  const CONFIG_KEY = 'campusmate.ai.config.v1';
  const DEFAULT_CONFIG = { baseUrl: '', apiKey: '', model: '' };
  const TIMEOUT_MS = 15000;
  const LOCAL_MIN_SCORE = 0.25;

  const HANDOFF = {
    department: '学生服务大厅“一站式”窗口',
    place: '大学生活动中心一楼',
    time: '工作日 9:00—17:00',
    note: '演示环境中的人工转办信息为模拟数据'
  };

  function now() {
    if (root.performance && typeof root.performance.now === 'function') return root.performance.now();
    return Date.now();
  }

  function readConfig() {
    try {
      const raw = root.localStorage.getItem(CONFIG_KEY);
      if (!raw) return Object.assign({}, DEFAULT_CONFIG);
      const parsed = JSON.parse(raw);
      return {
        baseUrl: typeof parsed.baseUrl === 'string' ? parsed.baseUrl : '',
        apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : '',
        model: typeof parsed.model === 'string' ? parsed.model : ''
      };
    } catch (err) {
      return Object.assign({}, DEFAULT_CONFIG);
    }
  }

  let config = readConfig();
  let index = null;

  function ensureIndex() {
    if (index) return index;
    const data = root.CampusMateData || { knowledgeBase: [], synonyms: {} };
    index = root.CampusEngine.createIndex(data.knowledgeBase, { synonyms: data.synonyms });
    return index;
  }

  function isConfigured() {
    return Boolean(String(config.baseUrl || '').trim() && String(config.apiKey || '').trim() && String(config.model || '').trim());
  }

  function getMode() {
    return isConfigured() ? 'api' : 'local';
  }

  function getStatus() {
    const mode = getMode();
    return {
      mode: mode,
      label: mode === 'api' ? '当前：大模型 API' : '当前：本地引擎',
      configured: mode === 'api',
      model: mode === 'api' ? config.model : '',
      hasConfig: Boolean(config.baseUrl || config.apiKey || config.model)
    };
  }

  function getConfig() {
    return { baseUrl: config.baseUrl, apiKey: config.apiKey, model: config.model };
  }

  function getMaskedKey() {
    if (!config.apiKey) return '';
    if (config.apiKey.length <= 8) return '••••••••';
    return config.apiKey.slice(0, 3) + '••••••' + config.apiKey.slice(-4);
  }

  function saveConfig(next) {
    const value = next || {};
    const baseUrl = String(value.baseUrl || '').trim();
    const apiKey = String(value.apiKey || '').trim();
    const model = String(value.model || '').trim();
    const any = Boolean(baseUrl || apiKey || model);
    if (any && !(baseUrl && apiKey && model)) {
      return { ok: false, error: 'Base URL、API Key、模型名需同时填写；留空则使用本地引擎。' };
    }
    if (any && !/^https?:\/\//i.test(baseUrl)) {
      return { ok: false, error: 'Base URL 需以 http 或 https 协议开头。' };
    }
    config = any ? { baseUrl: baseUrl.replace(/\/+$/, ''), apiKey: apiKey, model: model } : Object.assign({}, DEFAULT_CONFIG);
    let warning = '';
    try {
      if (any) root.localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
      else root.localStorage.removeItem(CONFIG_KEY);
    } catch (err) {
      warning = '浏览器本地存储不可用，配置仅在当前页面有效，刷新后会恢复本地引擎。';
    }
    return { ok: true, mode: getMode(), status: getStatus(), warning: warning };
  }

  function clearConfig() {
    config = Object.assign({}, DEFAULT_CONFIG);
    try {
      root.localStorage.removeItem(CONFIG_KEY);
    } catch (err) {
      // 存储不可用时仅重置内存配置
    }
    return { ok: true, mode: 'local', status: getStatus() };
  }

  function relatedFor(hit, results, knowledgeBase) {
    const out = [];
    const seen = new Set([hit.id]);
    results.forEach(function (item) {
      if (out.length >= 3) return;
      if (!item || seen.has(item.id) || item.score <= 0) return;
      seen.add(item.id);
      out.push({ id: item.id, title: item.title, question: item.question, confidence: item.confidence });
    });
    if (out.length < 3) {
      knowledgeBase.forEach(function (doc) {
        if (out.length >= 3 || seen.has(doc.id)) return;
        if (doc.category !== hit.category) return;
        seen.add(doc.id);
        out.push({ id: doc.id, title: doc.title, question: doc.question, confidence: 0 });
      });
    }
    return out;
  }

  function localAnswerText(hit, confidence, matched) {
    if (!matched || !hit) {
      return '未在本地知识库中匹配到足够可靠的答案（最高相似度 ' + confidence + '%）。\n\n' +
        '建议转人工咨询：' + HANDOFF.department + '，' + HANDOFF.place + '，' + HANDOFF.time + '。\n' +
        '也可以换一种说法，补充业务名称（如“学籍证明”“宿舍报修”“校园卡挂失”）后再次提问。';
    }
    const lines = [hit.answer, '', '办理步骤：'];
    (hit.steps || []).forEach(function (step, i) { lines.push((i + 1) + '. ' + step); });
    if (hit.materials && hit.materials.length) {
      lines.push('', '所需材料：' + hit.materials.join('、'));
    }
    if (hit.place) lines.push('', '办理地点：' + hit.place + (hit.department ? '（' + hit.department + '）' : ''));
    if (hit.time) lines.push('办理时间：' + hit.time);
    lines.push('', '依据：' + hit.id + '《' + hit.title + '》 · 检索置信度 ' + confidence + '%');
    return lines.join('\n');
  }

  function localAsk(question) {
    ensureIndex();
    const data = root.CampusMateData || { knowledgeBase: [] };
    const result = root.CampusEngine.search(question, index, {
      topK: 5,
      minScore: LOCAL_MIN_SCORE,
      synonyms: data.synonyms
    });
    const hit = result.matched && result.results.length ? result.results[0] : null;
    const related = hit ? relatedFor(hit, result.results, data.knowledgeBase) : [];
    const answer = localAnswerText(hit, result.confidence, Boolean(hit));
    return {
      mode: 'local',
      modeLabel: '本地引擎',
      fallback: false,
      fallbackReason: '',
      question: String(question || ''),
      matched: Boolean(hit),
      answer: answer,
      hit: hit,
      sources: result.results.filter(function (item) { return item.score > 0; }).slice(0, 3),
      related: related,
      confidence: result.confidence,
      topScore: result.topScore,
      tokens: result.tokens,
      expanded: result.expanded,
      handoff: handoffWithReason(hit ? '' : '本地知识库低置信度'),
      elapsedMs: 0
    };
  }

  function handoffWithReason(reason) {
    return {
      department: HANDOFF.department,
      place: HANDOFF.place,
      time: HANDOFF.time,
      note: HANDOFF.note,
      reason: reason || ''
    };
  }

  function buildPrompt(question, searchResult) {
    const context = (searchResult.results || []).map(function (item, i) {
      return [
        '【资料 ' + (i + 1) + '】' + item.id + '《' + item.title + '》',
        '回答：' + item.answer,
        '步骤：' + (item.steps || []).join('；'),
        '材料：' + (item.materials || []).join('、'),
        '部门：' + item.department + '；地点：' + item.place + '；时间：' + item.time
      ].join('\n');
    }).join('\n\n');
    const system = [
      '你是“校园智服通 CampusMate”，面向仙桃职业学院学生的校园办事助手。',
      '必须优先依据下面提供的本地知识库资料回答，不得编造办理地点、电话、金额和时限。',
      '如果资料不足以回答，要明确说明“知识库中未找到明确依据”，并建议转人工咨询，不要猜测。',
      '回答使用简体中文，先给结论，再给办理步骤与所需材料；控制在 350 字以内。',
      '下面资料为竞赛演示模拟数据，涉及实际办事时请提醒以学校最新通知为准。',
      '',
      context || '（本次没有检索到相关条目）'
    ].join('\n');
    return { system: system, user: String(question || '') };
  }

  function endpointOf(baseUrl) {
    const base = String(baseUrl || '').replace(/\/+$/, '');
    if (/\/chat\/completions$/i.test(base)) return base;
    return base + '/chat/completions';
  }

  async function callApi(question, searchResult) {
    const prompt = buildPrompt(question, searchResult);
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(function () { controller.abort(); }, TIMEOUT_MS) : null;
    try {
      const response = await fetch(endpointOf(config.baseUrl), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + config.apiKey
        },
        body: JSON.stringify({
          model: config.model,
          temperature: 0.2,
          max_tokens: 800,
          messages: [
            { role: 'system', content: prompt.system },
            { role: 'user', content: prompt.user }
          ]
        }),
        signal: controller ? controller.signal : undefined
      });
      if (!response.ok) {
        throw new Error('接口返回 HTTP ' + response.status);
      }
      const payload = await response.json();
      const choice = payload && payload.choices && payload.choices[0];
      let content = choice && choice.message ? choice.message.content : '';
      if (Array.isArray(content)) {
        content = content.map(function (part) { return part && part.text ? part.text : ''; }).join('');
      }
      if (typeof content !== 'string' || !content.trim()) {
        throw new Error('接口返回格式不符合 OpenAI Chat Completions 规范');
      }
      return content.trim();
    } catch (err) {
      if (err && err.name === 'AbortError') throw new Error('接口请求超时（' + Math.round(TIMEOUT_MS / 1000) + ' 秒）');
      const raw = err && err.message ? err.message : '接口请求失败';
      const friendly = /failed to fetch|networkerror|load failed|network request failed/i.test(raw)
        ? '网络请求失败，请检查接口地址、网络连接或服务端 CORS 配置'
        : raw;
      throw new Error(friendly);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * 对外统一问答入口。
   * 返回字段中的 mode 是“本次实际使用”的模式；
   * 如果调用 API 失败，会回退本地并设置 fallback=true / fallbackReason。
   */
  async function ask(question, options) {
    const opts = options || {};
    const text = String(question == null ? '' : question).trim();
    const started = now();
    if (!text) {
      return {
        mode: getMode(), modeLabel: getMode() === 'api' ? '大模型 API' : '本地引擎',
        fallback: false, fallbackReason: '', question: '', matched: false,
        answer: '请输入要咨询的校园办事问题，例如“学籍证明怎么办理”。',
        hit: null, sources: [], related: [], confidence: 0, tokens: [], expanded: [],
        handoff: handoffWithReason('未输入问题'), elapsedMs: 0
      };
    }

    // 无论哪种模式，都先做本地检索：既用于本地回答，也作为大模型的 RAG 上下文。
    ensureIndex();
    const data = root.CampusMateData || { knowledgeBase: [] };
    const searchResult = root.CampusEngine.search(text, index, {
      topK: 5,
      minScore: LOCAL_MIN_SCORE,
      synonyms: data.synonyms
    });
    const hit = searchResult.matched && searchResult.results.length ? searchResult.results[0] : null;
    const related = hit ? relatedFor(hit, searchResult.results, data.knowledgeBase) : [];
    const base = {
      question: text,
      matched: Boolean(hit),
      hit: hit,
      sources: searchResult.results.filter(function (item) { return item.score > 0; }).slice(0, 3),
      related: related,
      confidence: searchResult.confidence,
      topScore: searchResult.topScore,
      tokens: searchResult.tokens,
      expanded: searchResult.expanded,
      handoff: handoffWithReason(hit ? '' : '本地知识库低置信度'),
      elapsedMs: 0
    };

    if (!isConfigured() || opts.forceLocal) {
      const local = localAsk(text);
      local.elapsedMs = Math.round(now() - started);
      return local;
    }

    try {
      const apiAnswer = await callApi(text, searchResult);
      return Object.assign({}, base, {
        mode: 'api',
        modeLabel: '大模型 API',
        fallback: false,
        fallbackReason: '',
        answer: apiAnswer,
        elapsedMs: Math.round(now() - started)
      });
    } catch (err) {
      const localText = localAnswerText(hit, searchResult.confidence, Boolean(hit));
      return Object.assign({}, base, {
        mode: 'local',
        modeLabel: '本地引擎（API 失败回退）',
        fallback: true,
        fallbackReason: '大模型 API 调用失败，已回退本地引擎：' + (err && err.message ? err.message : '未知错误'),
        answer: localText,
        elapsedMs: Math.round(now() - started)
      });
    }
  }

  function warmup() {
    try {
      ensureIndex();
      return { ok: true, docs: (root.CampusMateData && root.CampusMateData.knowledgeBase.length) || 0 };
    } catch (err) {
      return { ok: false, docs: 0, error: err && err.message ? err.message : '索引构建失败' };
    }
  }

  const API = {
    ask: ask,
    warmup: warmup,
    getConfig: getConfig,
    getMaskedKey: getMaskedKey,
    saveConfig: saveConfig,
    clearConfig: clearConfig,
    getMode: getMode,
    getStatus: getStatus,
    isConfigured: isConfigured,
    handoff: HANDOFF
  };

  root.CampusAI = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
