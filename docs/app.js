"use strict";

const $ = (id) => document.getElementById(id);
const elements = {
  query: $("query"), form: $("search-form"), message: $("search-message"),
  matches: $("matches"), matchesList: $("matches-list"), matchesCount: $("matches-count"),
  viewer: $("viewer"), character: $("character"), count: $("stroke-count"),
  pinyin: $("pinyin"), definition: $("definition"),
  reviewStatus: $("review-status"),
  standardCode: $("standard-code"), standardDigits: $("standard-digits"), subtitle: $("viewer-subtitle"),
  summary: $("selected-summary"), tabStage: $("tab-stage"), tabSequence: $("tab-sequence"),
  stage: $("stage"), progress: $("progress-text"), label: $("step-label"),
  previous: $("previous"), next: $("next"), sequence: $("sequence"),
  play: $("play"), stop: $("stop"), mode: $("playback-mode"), playbackStatus: $("playback-status"),
  sequenceTotal: $("sequence-total"), copy: $("copy-link"), all: $("show-all")
};
const PLAYBACK_INTERVAL_MS = 1000;
const COMPLETED_HOLD_MS = 1600;
const svgNamespace = "http://www.w3.org/2000/svg";
const shardCache = new Map();
const shardLoads = new Map();
const index = window.HANZI_INDEX;
const dictionary = window.HANZI_DICTIONARY?.entries || {};
const standardCounts = window.HANZI_AUDIT?.standardCounts || {};
const standardCodes = window.HANZI_AUDIT?.standardCodes || {};
const supplements = new Set(index?.supplement?.characters || []);
const manualOverrides = index?.manualOverrides || {};
const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || false;
let activeCharacter = "";
let activeStrokes = [];
let activeMedians = [];
let activeStep = 1;
let requestId = 0;
let playbackTimer = null;
let isPlaying = false;
let stageComplete = false;
let cancelStrokeCompletion = null;
let finishCurrentStroke = null;
let animationSerial = 0;
let composingQuery = false;
let lastLiveQuery = null;
let querySelectionFrame = null;

function setMessage(message) { elements.message.textContent = message; }
function isHanzi(character) { return /\p{Script=Han}/u.test(character); }
function uniqueHanzi(value) { return [...new Set([...value].filter(isHanzi))]; }
function formatStep(number) { return String(number).padStart(2, "0"); }

function playbackMode() { return elements.mode?.value === "once" ? "once" : "loop"; }

function updatePlaybackUI() {
  elements.play.disabled = isPlaying || activeStrokes.length <= 1;
  elements.stop.disabled = !isPlaying;
  if (elements.mode) elements.mode.disabled = activeStrokes.length <= 1;
  elements.play.setAttribute("aria-label", `从第一笔开始${playbackMode() === "loop" ? "自动循环播放" : "播放一次"}，每秒一笔`);
  elements.label.setAttribute("aria-live", isPlaying ? "off" : "polite");
  const message = stageComplete
    ? activeStrokes.length === 1 ? "书写完成 · 只有一笔，无需自动播放"
      : isPlaying ? "书写完成 · 1.6 秒后重播" : "书写完成 · 可再次播放"
    : isPlaying ? `${playbackMode() === "loop" ? "循环" : "单次"}播放中 · 每 1 秒一笔`
      : `已停止，停在第 ${activeStep} 笔`;
  if (elements.playbackStatus.textContent !== message) elements.playbackStatus.textContent = message;
}

function stopPlayback() {
  window.clearTimeout(playbackTimer);
  playbackTimer = null;
  isPlaying = false;
  updatePlaybackUI();
}

function schedulePlayback(delay) {
  const timerId = window.setTimeout(() => {
    if (playbackTimer !== timerId || !isPlaying) return;
    playbackTimer = null;
    if (document.hidden) { stopPlayback(); return; }
    const reset = activeStep === activeStrokes.length;
    activeStep = reset ? 1 : activeStep + 1;
    renderStage({ animate: true, reset });
    if (activeStep < activeStrokes.length) schedulePlayback(PLAYBACK_INTERVAL_MS);
  }, delay);
  playbackTimer = timerId;
}

function startPlayback() {
  if (activeStrokes.length <= 1 || isPlaying) return;
  setMobileView("stage");
  isPlaying = true;
  activeStep = 1;
  renderStage({ animate: true });
  schedulePlayback(PLAYBACK_INTERVAL_MS);
  updatePlaybackUI();
}

function setMobileView(view) {
  elements.viewer.dataset.mobileView = view;
  elements.tabStage.setAttribute("aria-selected", view === "stage" ? "true" : "false");
  elements.tabSequence.setAttribute("aria-selected", view === "sequence" ? "true" : "false");
}

function glyph(strokes, step, className, options = {}) {
  const svg = document.createElementNS(svgNamespace, "svg");
  svg.setAttribute("viewBox", "0 0 1024 1024");
  svg.setAttribute("class", className);
  svg.setAttribute("aria-hidden", "true");
  if (options.reset) svg.classList.add("is-loop-reset");
  const group = document.createElementNS(svgNamespace, "g");
  group.setAttribute("transform", "scale(1,-1) translate(0,-900)");
  const animate = options.animate && !reducedMotion;
  const median = options.median;
  let maskId = null;
  if (animate && Array.isArray(median) && median.length > 1) {
    const length = median.slice(1).reduce((sum, point, index) => {
      const previous = median[index];
      return sum + Math.hypot(point[0] - previous[0], point[1] - previous[1]);
    }, 0);
    if (length > 0) {
      maskId = `stroke-reveal-${++animationSerial}`;
      const defs = document.createElementNS(svgNamespace, "defs");
      const mask = document.createElementNS(svgNamespace, "mask");
      mask.setAttribute("id", maskId);
      mask.setAttribute("maskUnits", "userSpaceOnUse");
      mask.setAttribute("maskContentUnits", "userSpaceOnUse");
      mask.setAttribute("x", "0");
      mask.setAttribute("y", "-124");
      mask.setAttribute("width", "1024");
      mask.setAttribute("height", "1024");
      const cover = document.createElementNS(svgNamespace, "rect");
      cover.setAttribute("x", "0");
      cover.setAttribute("y", "-124");
      cover.setAttribute("width", "1024");
      cover.setAttribute("height", "1024");
      cover.setAttribute("fill", "black");
      const brush = document.createElementNS(svgNamespace, "path");
      brush.setAttribute("d", median.map(([x, y], index) => `${index ? "L" : "M"} ${x} ${y}`).join(" "));
      brush.setAttribute("fill", "none");
      brush.setAttribute("stroke", "white");
      brush.setAttribute("stroke-width", "160");
      brush.setAttribute("stroke-linecap", "round");
      brush.setAttribute("stroke-linejoin", "round");
      brush.setAttribute("stroke-dasharray", String(length));
      brush.setAttribute("stroke-dashoffset", String(length));
      const motion = document.createElementNS(svgNamespace, "animate");
      motion.setAttribute("attributeName", "stroke-dashoffset");
      motion.setAttribute("from", String(length));
      motion.setAttribute("to", "0");
      motion.setAttribute("dur", "0.78s");
      motion.setAttribute("fill", "freeze");
      brush.append(motion);
      mask.append(cover, brush);
      defs.append(mask);
      group.append(defs);
    }
  }
  const style = manualOverrides[activeCharacter]?.strokeStyle;
  strokes.forEach((pathData, offset) => {
    const path = document.createElementNS(svgNamespace, "path");
    path.setAttribute("d", pathData);
    const current = options.highlightCurrent !== false && offset + 1 === step;
    path.setAttribute("class", current ? "stroke-current" : "stroke-done");
    if (animate && offset + 1 === step) {
      if (maskId) path.setAttribute("mask", `url(#${maskId})`);
      else path.classList.add("stroke-fade-in");
    }
    if (style?.numbers?.includes(offset + 1)) {
      path.setAttribute("stroke", current ? "#b55443" : "#344c46");
      path.setAttribute("stroke-width", String(style.outlineWidth));
      path.setAttribute("stroke-linejoin", "round");
      path.setAttribute("stroke-linecap", "round");
    }
    group.append(path);
  });
  svg.append(group);
  return svg;
}

async function loadStrokes(character) {
  const shard = (character.codePointAt(0) >>> 8).toString(16).padStart(4, "0");
  if (!shardCache.has(shard)) {
    if (!shardLoads.has(shard)) {
      shardLoads.set(shard, new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = `./data/${shard}.js`;
        script.onload = () => resolve(window.HANZI_SHARDS?.[shard]);
        script.onerror = () => reject(new Error("字形文件加载失败"));
        document.head.append(script);
      }));
    }
    let data;
    try { data = await shardLoads.get(shard); }
    catch (error) { shardLoads.delete(shard); throw error; }
    if (!data?.characters || typeof data.characters !== "object") throw new Error("字形文件格式错误");
    shardCache.set(shard, { characters: data.characters, medians: data.medians || {} });
  }
  const cached = shardCache.get(shard);
  const strokes = cached.characters[character];
  if (!Array.isArray(strokes) || strokes.length !== index.counts[character]) throw new Error("笔画数据不完整");
  const medians = cached.medians[character];
  return { strokes, medians: Array.isArray(medians) && medians.length === strokes.length ? medians : [] };
}

function updateStageUI() {
  const total = activeStrokes.length;
  elements.stage.setAttribute("aria-label", stageComplete
    ? `${activeCharacter}字，书写完成，共${total}笔。完整字形为深色。`
    : `${activeCharacter}字，第${activeStep}笔，共${total}笔。当前笔为朱红色。`);
  elements.progress.textContent = `${formatStep(activeStep)} / ${formatStep(total)}`;
  elements.label.textContent = stageComplete ? `书写完成 · ${total} / ${total} 笔` : `第 ${activeStep} / ${total} 笔`;
  elements.previous.disabled = activeStep === 1;
  elements.next.disabled = activeStep === total;
  elements.sequence.querySelectorAll("button").forEach((button) => {
    const current = button.dataset.complete === "true"
      ? stageComplete : !stageComplete && Number(button.dataset.step) === activeStep;
    if (current) button.setAttribute("aria-current", "step");
    else button.removeAttribute("aria-current");
  });
  updatePlaybackUI();
}

function completeStage(svg) {
  if (elements.stage.children[0] !== svg) return;
  svg.querySelectorAll(".stroke-current").forEach((path) => {
    path.removeAttribute("mask");
    path.classList.remove("stroke-fade-in");
    path.setAttribute("class", "stroke-done");
    if (path.hasAttribute("stroke")) path.setAttribute("stroke", "#344c46");
  });
  stageComplete = true;
  if (isPlaying) {
    if (playbackMode() === "once") stopPlayback();
    else schedulePlayback(COMPLETED_HOLD_MS);
  }
  updateStageUI();
}

function watchFinalStroke(svg) {
  const path = svg.querySelector(".stroke-current");
  const target = svg.querySelector("animate") || path;
  const eventType = target.tagName.toLowerCase() === "animate" ? "endEvent" : "animationend";
  let finished = false;
  let watchdog;
  const cancel = () => {
    finished = true;
    window.clearTimeout(watchdog);
    target.removeEventListener(eventType, finish);
    cancelStrokeCompletion = null;
    finishCurrentStroke = null;
  };
  const finish = (event) => {
    if (finished || elements.stage.children[0] !== svg || (event && event.target !== target)) return;
    cancel();
    completeStage(svg);
  };
  target.addEventListener(eventType, finish);
  // Stopping playback cancels progression; the current final stroke still finishes.
  // Replacing the SVG cancels both the old event and its fallback.
  watchdog = window.setTimeout(() => {
    if (finished || elements.stage.children[0] !== svg) return;
    console.warn("笔画动画未报告完成，改用静态显示", activeCharacter, activeStep, eventType);
    finish();
    elements.playbackStatus.textContent += " · 已使用静态显示";
  }, PLAYBACK_INTERVAL_MS);
  cancelStrokeCompletion = cancel;
  finishCurrentStroke = () => finish();
}

function renderStage(options = {}) {
  if (cancelStrokeCompletion) cancelStrokeCompletion();
  stageComplete = false;
  const animated = options.animate && !reducedMotion;
  const svg = glyph(activeStrokes.slice(0, activeStep), activeStep, "stage-glyph", {
    animate: animated,
    reset: options.reset,
    highlightCurrent: !options.complete,
    median: activeMedians[activeStep - 1],
  });
  if (activeStep === activeStrokes.length && animated) watchFinalStroke(svg);
  elements.stage.replaceChildren(svg);
  if (activeStep === activeStrokes.length && !animated) completeStage(svg);
  else updateStageUI();
}

function renderCharacter() {
  const total = activeStrokes.length;
  elements.character.textContent = activeCharacter;
  elements.count.textContent = `${total} 画`;
  const entry = dictionary[activeCharacter];
  elements.pinyin.textContent = entry?.pinyin?.join(" / ") || "拼音暂无";
  elements.definition.textContent = entry?.definition || "暂无英文释义";
  const standardCount = standardCounts[activeCharacter];
  const mismatch = Boolean(standardCount && standardCount !== total);
  elements.standardCode.hidden = !mismatch;
  elements.standardDigits.textContent = mismatch ? [...(standardCodes[activeCharacter] || "")].join(" ") : "";
  elements.subtitle.textContent = mismatch
    ? "下方按原图形数据的笔画顺序展示，供观察与推断；当前笔为朱红色，写完后全字恢复深色。"
    : "已写的笔画为深色，当前一笔以朱红标出；写完后全字恢复深色。";
  if (mismatch) {
    elements.reviewStatus.textContent = `图形来源字形为 ${total} 画，GF 0023—2020 规范为 ${standardCount} 画；下方保留原图形的逐笔顺序供参考，不能视为规范逐笔图。`;
    elements.reviewStatus.dataset.mismatch = "true";
  } else if (manualOverrides[activeCharacter]) {
    elements.reviewStatus.textContent = activeCharacter === "亹"
      ? "已依据规范将第 10–12 笔修订为「口」的三笔；请复核修订字形。"
      : "已按人工核对意见修订字形，笔画数与规范相同；整字笔顺和字形仍需继续核验。";
    elements.reviewStatus.dataset.mismatch = "false";
  } else if (supplements.has(activeCharacter)) {
    elements.reviewStatus.textContent = "补充图形来自 AnimCJK；笔画数与规范相同，笔顺和字形待核验。";
    elements.reviewStatus.dataset.mismatch = "false";
  } else if (standardCount) {
    elements.reviewStatus.textContent = "笔画数与规范相同；笔顺和字形尚待逐字核验。";
    elements.reviewStatus.dataset.mismatch = "false";
  } else {
    elements.reviewStatus.textContent = "此字不在《通用规范汉字表》8105 字内；图形笔顺未按该规范核验。";
    elements.reviewStatus.dataset.mismatch = "false";
  }
  elements.sequenceTotal.textContent = `共 ${total} 笔`;
  const cards = Array.from({ length: total + 1 }, (_, offset) => {
    const complete = offset === total;
    const step = complete ? total : offset + 1;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "step-card";
    button.dataset.step = String(step);
    if (complete) button.dataset.complete = "true";
    button.setAttribute("aria-label", complete ? `查看${activeCharacter}的完整字形` : `查看${activeCharacter}的第${step}笔`);
    const number = document.createElement("span");
    number.className = "step-number";
    number.textContent = complete ? "完成" : formatStep(step);
    const label = document.createElement("span");
    label.className = "step-caption";
    label.textContent = complete ? "完整字形" : `第 ${step} 笔`;
    button.append(number, glyph(activeStrokes.slice(0, step), step, "small-glyph", { highlightCurrent: !complete }), label);
    return button;
  });
  elements.sequence.replaceChildren(...cards);
  elements.summary.hidden = false;
  elements.viewer.hidden = false;
  setMobileView("stage");
  renderStage();
}

async function selectCharacter(character, updateHash = true) {
  stopPlayback();
  if (!index?.counts) { setMessage("检索索引加载失败，请刷新页面重试。"); return; }
  if (!index.counts[character]) {
    requestId++;
    setMessage(standardCounts[character]
      ? `“${character}”属于通用规范汉字（${standardCounts[character]} 画），但本站暂缺逐笔图形。`
      : `“${character}”暂未收录逐笔图形。`);
    return;
  }
  const currentRequest = ++requestId;
  setMessage(`正在加载“${character}”的笔画…`);
  try {
    const { strokes, medians } = await loadStrokes(character);
    if (currentRequest !== requestId) return;
    activeCharacter = character;
    activeStrokes = strokes;
    const shapeDiffers = Boolean(standardCounts[character] && standardCounts[character] !== strokes.length);
    activeMedians = shapeDiffers ? [] : medians;
    activeStep = 1;
    renderCharacter();
    updatePlaybackUI();
    if (!reducedMotion && !document.hidden) startPlayback();
    setMessage("");
    if (updateHash) history.replaceState(null, "", `#/${encodeURIComponent(character)}`);
  } catch (error) {
    if (currentRequest === requestId) setMessage(`${error.message}。请刷新页面后重试。`);
  }
}

function showMatches(characters) {
  if (characters.length < 2) { elements.matches.hidden = true; return; }
  elements.matches.hidden = false;
  elements.matchesCount.textContent = `${characters.length} 个不同的汉字`;
  const buttons = characters.map((character) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.char = character;
    button.className = "match-char";
    button.textContent = character;
    button.title = index.counts[character] ? `${index.counts[character]} 画` : "暂无图形";
    if (!index.counts[character]) button.disabled = true;
    return button;
  });
  elements.matchesList.replaceChildren(...buttons);
}

function search(value, quietEmpty = false) {
  if (!index?.counts) { setMessage("检索索引加载失败，请刷新页面重试。"); return; }
  const characters = uniqueHanzi(value);
  if (!characters.length) { setMessage(quietEmpty ? "" : "请输入至少一个汉字。"); elements.matches.hidden = true; return; }
  showMatches(characters);
  const firstAvailable = characters.find((character) => index.counts[character]);
  if (firstAvailable) selectCharacter(firstAvailable);
  else setMessage("输入的汉字暂未收录逐笔图形。");
}

function searchFromInput() {
  const value = elements.query.value;
  if (value === lastLiveQuery) return;
  lastLiveQuery = value;
  search(value, true);
}

function cancelQuerySelection() {
  if (querySelectionFrame === null) return;
  window.cancelAnimationFrame(querySelectionFrame);
  querySelectionFrame = null;
}

function selectQueryAfterPointer() {
  cancelQuerySelection();
  // The browser may place the caret after focus/pointerup; select after that default action.
  querySelectionFrame = window.requestAnimationFrame(() => {
    querySelectionFrame = null;
    if (document.activeElement === elements.query && !composingQuery) elements.query.select();
  });
}

function fromHash() {
  const match = location.hash.match(/^#\/(.+)$/);
  if (!match) return null;
  try {
    const character = decodeURIComponent(match[1]);
    return [...character].length === 1 && isHanzi(character) ? character : null;
  } catch { return null; }
}

elements.form.addEventListener("submit", (event) => { event.preventDefault(); search(elements.query.value); });
$("examples").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-char]");
  if (button) { elements.query.value = button.dataset.char; lastLiveQuery = null; elements.matches.hidden = true; selectCharacter(button.dataset.char); }
});
elements.matchesList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-char]");
  if (button) selectCharacter(button.dataset.char);
});
$("random").addEventListener("click", () => {
  if (!index) return;
  const characters = Object.keys(index.counts);
  const character = characters[Math.floor(Math.random() * characters.length)];
  elements.query.value = character;
  lastLiveQuery = null;
  elements.matches.hidden = true;
  selectCharacter(character);
});
elements.previous.addEventListener("click", () => { stopPlayback(); activeStep = Math.max(1, activeStep - 1); renderStage({ animate: true }); });
elements.next.addEventListener("click", () => { stopPlayback(); activeStep = Math.min(activeStrokes.length, activeStep + 1); renderStage({ animate: true }); });
elements.all.addEventListener("click", () => { stopPlayback(); activeStep = activeStrokes.length; renderStage({ complete: true }); });
elements.play.addEventListener("click", startPlayback);
elements.stop.addEventListener("click", stopPlayback);
elements.mode?.addEventListener("change", () => {
  if (stageComplete && isPlaying && playbackMode() === "once") stopPlayback();
  updatePlaybackUI();
});
elements.tabStage.addEventListener("click", () => setMobileView("stage"));
elements.tabSequence.addEventListener("click", () => { stopHiddenPlayback(); setMobileView("sequence"); });
for (const [current, other, view] of [[elements.tabStage, elements.tabSequence, "sequence"], [elements.tabSequence, elements.tabStage, "stage"]]) {
  current.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      if (view === "sequence") stopHiddenPlayback();
      setMobileView(view);
      other.focus();
      event.preventDefault();
    }
  });
}
elements.sequence.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-step]");
  if (button) {
    stopPlayback();
    activeStep = Number(button.dataset.step);
    setMobileView("stage");
    const complete = button.dataset.complete === "true";
    renderStage({ animate: !complete, complete });
  }
});
elements.query.addEventListener("focus", () => { stopPlayback(); selectQueryAfterPointer(); });
elements.query.addEventListener("pointerup", (event) => {
  if (event.button === 0 && event.pointerType === "mouse") selectQueryAfterPointer();
});
elements.query.addEventListener("blur", cancelQuerySelection);
elements.query.addEventListener("compositionstart", () => { cancelQuerySelection(); composingQuery = true; });
elements.query.addEventListener("compositionend", () => { composingQuery = false; searchFromInput(); });
elements.query.addEventListener("input", (event) => {
  cancelQuerySelection();
  if (!composingQuery && !event.isComposing) searchFromInput();
});
elements.copy.addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(location.href); elements.copy.textContent = "已复制链接 ✓"; }
  catch { elements.copy.textContent = "复制失败，请从地址栏复制"; }
  window.setTimeout(() => { elements.copy.textContent = "复制此字链接"; }, 2400);
});
window.addEventListener("keydown", (event) => {
  if (!activeCharacter || ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName) || document.activeElement.isContentEditable
    || document.activeElement === elements.tabStage || document.activeElement === elements.tabSequence) return;
  if (event.key === "ArrowLeft" && activeStep > 1) { stopPlayback(); activeStep--; renderStage({ animate: true }); event.preventDefault(); }
  if (event.key === "ArrowRight" && activeStep < activeStrokes.length) { stopPlayback(); activeStep++; renderStage({ animate: true }); event.preventDefault(); }
});
window.addEventListener("hashchange", () => { const character = fromHash(); if (character && index) selectCharacter(character, false); });
function stopHiddenPlayback() {
  stopPlayback();
  if (finishCurrentStroke) finishCurrentStroke();
}
window.addEventListener("pagehide", stopHiddenPlayback);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) { stopHiddenPlayback(); cancelQuerySelection(); }
});

async function initialize() {
  if (!index?.counts) { setMessage("检索索引加载失败，请刷新页面重试。"); return; }
  const character = fromHash() || "永";
  const initial = index.counts[character] ? character : "永";
  elements.query.value = initial;
  await selectCharacter(initial, false);
}
initialize();
