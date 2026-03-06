const LOW_RANGE = createRange(1, 12);
const MID_RANGE = createRange(13, 24);
const HIGH_RANGE = createRange(25, 37);
const HISTORY_KEY = "loto7_generator_history";
const HISTORY_LIMIT = 50;
const MAX_RETRY_PER_SET = 200;
const AUTH_KEY = "chotensai_auth_ok";

const setCountEl = document.getElementById("setCount");
const doubleBridgeEl = document.getElementById("doubleBridge");
const doubleBridgeLabelEl = document.getElementById("doubleBridgeLabel");
const inputErrorEl = document.getElementById("inputError");
const statusMsgEl = document.getElementById("statusMsg");
const resultsEl = document.getElementById("results");
const historyEl = document.getElementById("history");
const generateBtn = document.getElementById("generateBtn");
const copyAllBtn = document.getElementById("copyAllBtn");
const clearHistoryBtn = document.getElementById("clearHistoryBtn");

let latestResults = [];
let historyItems = loadHistory();

init();

function init() {
  if (localStorage.getItem(AUTH_KEY) !== "1") {
    window.location.replace("./password.html");
    return;
  }
  bindEvents();
  validateCountInput();
  updateDoubleBridgeLabel();
  renderResults([]);
  renderHistory();
}

function bindEvents() {
  setCountEl.addEventListener("input", validateCountInput);
  doubleBridgeEl.addEventListener("change", updateDoubleBridgeLabel);
  generateBtn.addEventListener("click", handleGenerate);
  copyAllBtn.addEventListener("click", handleCopyAll);
  clearHistoryBtn.addEventListener("click", handleClearHistory);
}

function validateCountInput() {
  const count = Number(setCountEl.value);
  const valid = Number.isInteger(count) && count >= 1 && count <= 20;
  inputErrorEl.textContent = valid ? "" : "生成セット数は1〜20で指定してください。";
  generateBtn.disabled = !valid;
  return valid;
}

function updateDoubleBridgeLabel() {
  doubleBridgeLabelEl.textContent = doubleBridgeEl.checked ? "ON" : "OFF";
}

function handleGenerate() {
  statusMsgEl.textContent = "";
  if (!validateCountInput()) return;

  const count = Number(setCountEl.value);
  const doubleBridge = doubleBridgeEl.checked;
  const results = [];
  let failCount = 0;

  for (let i = 0; i < count; i += 1) {
    const generated = generateOneSet(doubleBridge, MAX_RETRY_PER_SET);
    if (!generated) {
      failCount += 1;
      results.push({ failed: true });
      continue;
    }
    results.push(generated);
  }

  latestResults = results;
  renderResults(results);

  const historyPayload = {
    timestamp: new Date().toISOString(),
    settings: { count, doubleBridge },
    results: results.map((item) =>
      item.failed
        ? { failed: true }
        : {
            numbers: item.numbers,
            lowCount: item.lowCount,
            midCount: item.midCount,
            highCount: item.highCount,
            lowBridge: item.lowBridge,
            highBridge: item.highBridge,
            doubleBridge: item.doubleBridge
          }
    )
  };
  addHistory(historyPayload);

  if (failCount > 0) {
    statusMsgEl.textContent = "条件を満たす組み合わせを生成できませんでした。再生成してください。";
    statusMsgEl.style.color = "#a12323";
  } else {
    statusMsgEl.textContent = `${count}セット生成しました。`;
    statusMsgEl.style.color = "";
  }
}

function handleCopyAll() {
  const successful = latestResults.filter((item) => !item.failed);
  if (successful.length === 0) {
    statusMsgEl.textContent = "コピー対象のセットがありません。";
    statusMsgEl.style.color = "#a12323";
    return;
  }

  const text = successful
    .map((item, index) => `Set ${index + 1}: ${formatNumbers(item.numbers)}`)
    .join("\n");
  copyText(text, "全セットをコピーしました。");
}

function handleClearHistory() {
  localStorage.removeItem(HISTORY_KEY);
  historyItems = [];
  renderHistory();
  statusMsgEl.textContent = "履歴をクリアしました。";
  statusMsgEl.style.color = "";
}

function generateOneSet(doubleBridgeRequired, maxRetry) {
  for (let i = 0; i < maxRetry; i += 1) {
    const m = pickOne([1, 2, 3]);
    const l = randomInt(2, 7 - m - 2);
    const h = 7 - m - l;

    const lows = sampleWithoutReplacement(LOW_RANGE, l).sort((a, b) => a - b);
    const highs = sampleWithoutReplacement(HIGH_RANGE, h).sort((a, b) => a - b);

    const lm = getLowMidCandidates(lows);
    const hm = getHighMidCandidates(highs);

    let mids;
    if (doubleBridgeRequired) {
      mids = pickMidsDoubleBridge(m, lm, hm);
    } else {
      mids = pickMidsBridge(m, lm, hm);
    }
    if (!mids) continue;

    const numbers = [...lows, ...mids, ...highs].sort((a, b) => a - b);
    const lowBridge = hasIntersection(mids, lm);
    const highBridge = hasIntersection(mids, hm);
    const doubleBridge = lowBridge && highBridge;

    if (!lowBridge && !highBridge) continue;
    if (doubleBridgeRequired && !doubleBridge) continue;

    return {
      numbers,
      lowCount: lows.length,
      midCount: mids.length,
      highCount: highs.length,
      lowBridge,
      highBridge,
      doubleBridge
    };
  }
  return null;
}

function pickMidsBridge(m, lm, hm) {
  const plans = [];
  if (lm.length > 0) plans.push({ primary: lm, opposite: hm });
  if (hm.length > 0) plans.push({ primary: hm, opposite: lm });
  shuffle(plans);

  for (const plan of plans) {
    const primaryOnly = difference(plan.primary, plan.opposite);
    if (primaryOnly.length === 0) continue;

    const oppositeSet = new Set(plan.opposite);
    const safePool = MID_RANGE.filter((n) => !oppositeSet.has(n));
    if (safePool.length < m) continue;

    const selected = new Set([pickOne(primaryOnly)]);
    fillSetRandomly(selected, safePool, m);
    if (selected.size !== m) continue;

    return [...selected].sort((a, b) => a - b);
  }

  const bm = unique([...lm, ...hm]);
  if (bm.length === 0) return null;
  const selected = new Set([pickOne(bm)]);
  fillSetRandomly(selected, MID_RANGE, m);
  if (selected.size !== m) return null;
  return [...selected].sort((a, b) => a - b);
}

function pickMidsDoubleBridge(m, lm, hm) {
  if (lm.length === 0 || hm.length === 0) return null;

  if (m === 1) {
    const overlap = intersection(lm, hm);
    if (overlap.length === 0) return null;
    return [pickOne(overlap)];
  }

  const selected = new Set();
  selected.add(pickOne(lm));
  selected.add(pickOne(hm));
  fillSetRandomly(selected, MID_RANGE, m);

  if (selected.size !== m) return null;
  return [...selected].sort((a, b) => a - b);
}

function getLowMidCandidates(lows) {
  const out = [];
  lows.forEach((l) => {
    const start = Math.max(13, l + 3);
    const end = Math.min(24, l + 11);
    if (start <= end) {
      for (let n = start; n <= end; n += 1) out.push(n);
    }
  });
  return unique(out);
}

function getHighMidCandidates(highs) {
  const out = [];
  highs.forEach((h) => {
    const start = Math.max(13, h - 11);
    const end = Math.min(24, h - 3);
    if (start <= end) {
      for (let n = start; n <= end; n += 1) out.push(n);
    }
  });
  return unique(out);
}

function renderResults(results) {
  resultsEl.innerHTML = "";
  if (results.length === 0) {
    resultsEl.innerHTML = "<p>まだ生成されていません。</p>";
    return;
  }

  results.forEach((item, index) => {
    const row = document.createElement("article");
    row.className = "item";

    if (item.failed) {
      row.innerHTML = `
        <div class="item-head">
          <strong>セット ${index + 1}</strong>
        </div>
        <p class="nums">生成失敗</p>
      `;
      resultsEl.appendChild(row);
      return;
    }

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.textContent = "コピー";
    copyBtn.addEventListener("click", () => {
      copyText(formatNumbers(item.numbers), `セット ${index + 1} をコピーしました。`);
    });

    const head = document.createElement("div");
    head.className = "item-head";
    const title = document.createElement("strong");
    title.textContent = `セット ${index + 1}`;
    head.appendChild(title);
    head.appendChild(copyBtn);

    const nums = document.createElement("p");
    nums.className = "nums";
    nums.textContent = formatNumbers(item.numbers);

    const badges = document.createElement("div");
    badges.className = "badges";
    badges.appendChild(makeBadge(`低${item.lowCount}/中${item.midCount}/高${item.highCount}`));
    badges.appendChild(makeBadge(item.doubleBridge ? "Double Bridge" : "Bridge"));

    row.appendChild(head);
    row.appendChild(nums);
    row.appendChild(badges);
    resultsEl.appendChild(row);
  });
}

function renderHistory() {
  historyEl.innerHTML = "";
  if (historyItems.length === 0) {
    historyEl.innerHTML = "<p>履歴はありません。</p>";
    return;
  }

  historyItems.forEach((entry) => {
    const item = document.createElement("article");
    item.className = "item";

    const timestamp = new Date(entry.timestamp);
    const meta = document.createElement("p");
    meta.className = "history-meta";
    meta.textContent = `${timestamp.toLocaleString("ja-JP")} / ${entry.settings.count}セット / ダブルブリッジ ${
      entry.settings.doubleBridge ? "ON" : "OFF"
    }`;
    item.appendChild(meta);

    const lines = entry.results
      .map((result, index) => {
        if (result.failed) return `Set ${index + 1}: 生成失敗`;
        return `Set ${index + 1}: ${formatNumbers(result.numbers)}`;
      })
      .join("\n");
    const pre = document.createElement("pre");
    pre.textContent = lines;
    pre.style.margin = "0";
    pre.style.whiteSpace = "pre-wrap";
    pre.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    pre.style.fontSize = "0.86rem";
    item.appendChild(pre);

    historyEl.appendChild(item);
  });
}

function addHistory(entry) {
  historyItems.unshift(entry);
  if (historyItems.length > HISTORY_LIMIT) {
    historyItems = historyItems.slice(0, HISTORY_LIMIT);
  }
  localStorage.setItem(HISTORY_KEY, JSON.stringify(historyItems));
  renderHistory();
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
}

function formatNumbers(nums) {
  return nums.map((n) => String(n).padStart(2, "0")).join(" ");
}

function fillSetRandomly(setObj, pool, targetSize) {
  const available = shuffle(pool.filter((n) => !setObj.has(n)));
  while (setObj.size < targetSize && available.length > 0) {
    setObj.add(available.pop());
  }
}

function copyText(text, successMessage) {
  navigator.clipboard
    .writeText(text)
    .then(() => {
      statusMsgEl.textContent = successMessage;
      statusMsgEl.style.color = "";
    })
    .catch(() => {
      statusMsgEl.textContent = "コピーに失敗しました。";
      statusMsgEl.style.color = "#a12323";
    });
}

function makeBadge(text) {
  const span = document.createElement("span");
  span.className = "badge";
  span.textContent = text;
  return span;
}

function createRange(start, end) {
  const out = [];
  for (let i = start; i <= end; i += 1) out.push(i);
  return out;
}

function sampleWithoutReplacement(source, count) {
  return shuffle([...source]).slice(0, count);
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickOne(arr) {
  return arr[randomInt(0, arr.length - 1)];
}

function unique(arr) {
  return [...new Set(arr)];
}

function hasIntersection(a, b) {
  const setB = new Set(b);
  return a.some((n) => setB.has(n));
}

function intersection(a, b) {
  const setB = new Set(b);
  return unique(a.filter((n) => setB.has(n)));
}

function difference(a, b) {
  const setB = new Set(b);
  return unique(a.filter((n) => !setB.has(n)));
}
