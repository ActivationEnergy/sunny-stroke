"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const site = path.join(__dirname, "..", "docs");
const elements = new Map();
const timers = new Map();
const frames = new Map();
let nextTimerId = 1;
let nextFrameId = 1;
let context;
const warnings = [];
const testConsole = { ...console, warn: (...args) => warnings.push(args) };

class Element {
  constructor(tag = "div") {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.listeners = {};
    this.hidden = false;
    this.disabled = false;
    this.textContent = "";
    this.value = "";
    this.selectionCount = 0;
    this.selected = false;
    this.classes = new Set();
    this.classList = { add: (name) => this.classes.add(name), remove: (name) => this.classes.delete(name) };
  }
  addEventListener(type, listener) { this.listeners[type] = listener; }
  removeEventListener(type, listener) { if (this.listeners[type] === listener) delete this.listeners[type]; }
  setAttribute(name, value) { this.attributes[name] = value; if (name === "class") this.classes = new Set(value.split(/\s+/)); }
  hasAttribute(name) { return name in this.attributes; }
  removeAttribute(name) { delete this.attributes[name]; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  querySelectorAll(selector) {
    return this.children.flatMap((child) => {
      const matches = selector.startsWith(".") ? child.classes.has(selector.slice(1)) : child.tagName.toLowerCase() === selector;
      return [...(matches ? [child] : []), ...child.querySelectorAll(selector)];
    });
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  closest(selector) { return selector.startsWith("button") && this.tagName === "BUTTON" ? this : null; }
  focus() { document.activeElement = this; }
  select() { this.selectionCount++; this.selected = true; }
}

const document = {
  activeElement: new Element("body"),
  hidden: false,
  listeners: {},
  addEventListener(type, listener) { this.listeners[type] = listener; },
  getElementById(id) {
    if (!elements.has(id)) elements.set(id, new Element(id === "playback-mode" ? "select" : "div"));
    return elements.get(id);
  },
  createElement: (tag) => new Element(tag),
  createElementNS: (_, tag) => new Element(tag),
  head: {
    append(script) {
      try {
        vm.runInContext(fs.readFileSync(path.join(site, script.src), "utf8"), context);
        script.onload();
      } catch (error) { script.onerror(error); }
    },
  },
};

const window = {
  HANZI_SHARDS: {}, listeners: {},
  matchMedia() { return { matches: false }; },
  addEventListener(type, listener) { this.listeners[type] = listener; },
  setTimeout(callback, delay) { const id = nextTimerId++; timers.set(id, { callback, delay }); return id; },
  clearTimeout(id) { timers.delete(id); },
  requestAnimationFrame(callback) { const id = nextFrameId++; frames.set(id, callback); return id; },
  cancelAnimationFrame(id) { frames.delete(id); },
};
const location = { hash: "", href: "file:///docs/index.html" };
const history = { replaceState(_state, _title, hash) { location.hash = hash; location.href = `file:///docs/index.html${hash}`; } };
context = vm.createContext({ window, document, location, history, navigator: {}, console: testConsole, setTimeout });

for (const file of ["data/index.js", "data/dictionary.js", "data/audit-status.js", "app.js"]) {
  vm.runInContext(fs.readFileSync(path.join(site, file), "utf8"), context);
}

function flush() { return new Promise((resolve) => setImmediate(resolve)); }
function fireTimer() {
  const [id, timer] = timers.entries().next().value;
  timers.delete(id);
  timer.callback();
  return timer;
}
function fireFrame() {
  const [id, callback] = frames.entries().next().value;
  frames.delete(id);
  callback();
}
function finishFinalStroke() {
  const svg = elements.get("stage").children[0];
  const target = svg.querySelector("animate") || svg.querySelector(".stroke-current");
  const type = target.tagName === "ANIMATE" ? "endEvent" : "animationend";
  assert.ok(target.listeners[type], "final stroke must listen for actual animation completion");
  target.listeners[type]({ target });
}
function assertComplete(total) {
  const svg = elements.get("stage").children[0];
  assert.equal(svg.querySelectorAll(".stroke-current").length, 0);
  assert.equal(svg.querySelectorAll(".stroke-done").length, total);
  assert.match(elements.get("step-label").textContent, /书写完成/);
  assert.match(elements.get("stage").attributes["aria-label"], /书写完成/);
  assert.ok(strokeCards().every((card) => !card.attributes["aria-current"]));
  assert.equal(elements.get("sequence").children[total].attributes["aria-current"], "step");
}
function strokeCards() {
  return elements.get("sequence").children.filter((card) => !card.dataset.complete);
}
function assertCompleteCard(total) {
  const cards = elements.get("sequence").children;
  assert.equal(cards.length, total + 1);
  const card = cards[total];
  assert.equal(card.dataset.complete, "true");
  assert.equal(card.children[2].textContent, "完整字形");
  assert.equal(card.children[1].querySelectorAll(".stroke-current").length, 0);
  assert.equal(card.children[1].querySelectorAll(".stroke-done").length, total);
  return card;
}

(async () => {
  await flush();
  assert.equal(elements.get("viewer").hidden, false);
  assert.equal(elements.get("character").textContent, "永");
  assert.match(elements.get("pinyin").textContent, /yǒng/);
  assert.match(elements.get("definition").textContent, /eternal/);
  assertCompleteCard(5);
  assert.equal(elements.get("play").disabled, true);
  assert.equal(elements.get("stop").disabled, false);
  assert.equal([...timers.values()][0].delay, 1000);
  const initialGroup = elements.get("stage").children[0].children[0];
  assert.equal(initialGroup.children[0].tagName, "DEFS");
  assert.match(initialGroup.children[1].attributes.mask, /stroke-reveal/);

  const query = elements.get("query");
  query.focus();
  query.listeners.focus();
  assert.equal(timers.size, 0);
  assert.equal(query.selectionCount, 0);
  query.listeners.pointerup({ button: 0, pointerType: "mouse" });
  assert.equal(frames.size, 1);
  query.selected = false; // Native click places the caret after focus.
  fireFrame();
  assert.equal(query.selectionCount, 1);
  assert.equal(query.selected, true);
  query.selected = false;
  query.listeners.pointerup({ button: 0, pointerType: "mouse" });
  fireFrame();
  assert.equal(query.selectionCount, 2);
  assert.equal(query.selected, true);
  query.listeners.pointerup({ button: 0, pointerType: "mouse" });
  query.value = "春";
  query.listeners.input({ isComposing: false });
  assert.equal(frames.size, 0);
  assert.equal(query.selectionCount, 2);
  await flush();
  assert.equal(elements.get("character").textContent, "春");
  query.listeners.pointerup({ button: 0, pointerType: "mouse" });
  assert.equal(frames.size, 1);
  query.listeners.compositionstart();
  assert.equal(frames.size, 0);
  query.value = "shu";
  query.listeners.input({ isComposing: true });
  assert.equal(elements.get("character").textContent, "春");
  query.value = "书";
  query.listeners.compositionend();
  await flush();
  assert.equal(elements.get("character").textContent, "书");
  query.value = "";
  query.listeners.input({ isComposing: false });
  assert.equal(elements.get("character").textContent, "书");
  assert.equal(elements.get("search-message").textContent, "");
  query.listeners.pointerup({ button: 0, pointerType: "mouse" });
  query.listeners.blur();
  assert.equal(frames.size, 0);

  const example = new Element("button");
  example.dataset.char = "好";
  elements.get("examples").listeners.click({ target: example });
  await flush();
  assert.equal(elements.get("character").textContent, "好");
  assert.equal(elements.get("stroke-count").textContent, "6 画");
  assert.match(elements.get("definition").textContent, /good/);

  example.dataset.char = "亹";
  elements.get("examples").listeners.click({ target: example });
  await flush();
  assert.equal(elements.get("stroke-count").textContent, "22 画");
  assert.equal(strokeCards().length, 22);
  assert.match(elements.get("review-status").textContent, /第 10–12 笔/);
  assert.ok(elements.get("stage").children[0].children[0].children[0].classes.has("stroke-fade-in"));
  const tenth = elements.get("sequence").children[9];
  assert.equal(tenth.children[1].children[0].children[9].attributes["stroke-width"], "16");
  elements.get("sequence").listeners.click({ target: tenth });
  assert.equal(elements.get("step-label").textContent, "第 10 / 22 笔");
  assert.equal(elements.get("stage").children[0].children[0].children[9].attributes["stroke-width"], "16");

  example.dataset.char = "亸";
  elements.get("examples").listeners.click({ target: example });
  await flush();
  assert.equal(elements.get("stroke-count").textContent, "16 画");
  assert.match(elements.get("review-status").textContent, /AnimCJK/);

  example.dataset.char = "𬜯";
  elements.get("examples").listeners.click({ target: example });
  await flush();
  assert.equal(elements.get("stroke-count").textContent, "10 画");
  assert.match(elements.get("review-status").textContent, /AnimCJK/);

  example.dataset.char = "苧";
  elements.get("examples").listeners.click({ target: example });
  await flush();
  assert.equal(elements.get("stroke-count").textContent, "9 画");
  assert.equal(elements.get("standard-code").hidden, false);
  assert.equal(elements.get("standard-digits").textContent, "1 2 2 4 4 5 1 2");
  assert.match(elements.get("review-status").textContent, /原图形的逐笔顺序/);

  example.dataset.char = "蒐";
  elements.get("examples").listeners.click({ target: example });
  await flush();
  assert.equal(elements.get("stroke-count").textContent, "14 画");
  assert.equal(strokeCards().length, 14);
  assert.equal(elements.get("standard-digits").textContent, "1 2 2 3 2 5 1 1 3 5 5 4");

  for (const character of [..."彟爇脩莿蒻薳藨"]) {
    example.dataset.char = character;
    elements.get("examples").listeners.click({ target: example });
    await flush();
    const expected = window.HANZI_AUDIT.standardCounts[character];
    assert.ok(strokeCards().length > expected);
    assert.equal(elements.get("standard-code").hidden, false);
    assert.match(elements.get("review-status").textContent, /供参考/);
  }

  example.dataset.char = "櫆";
  elements.get("examples").listeners.click({ target: example });
  await flush();
  assert.equal(elements.get("stroke-count").textContent, "17 画");
  assert.equal(elements.get("standard-code").hidden, true);
  assert.match(elements.get("review-status").textContent, /人工核对意见/);

  example.dataset.char = "㑇";
  elements.get("examples").listeners.click({ target: example });
  await flush();
  assert.match(elements.get("search-message").textContent, /暂缺逐笔图形/);

  elements.get("query").value = "春书";
  elements.get("search-form").listeners.submit({ preventDefault() {} });
  await flush();
  assert.equal(elements.get("matches").hidden, false);
  assert.equal(elements.get("matches-list").children.length, 2);
  assert.equal(elements.get("character").textContent, "春");
  const book = elements.get("matches-list").children[1];
  elements.get("matches-list").listeners.click({ target: book });
  await flush();
  assert.equal(elements.get("character").textContent, "书");
  assert.equal(elements.get("stroke-count").textContent, "4 画");
  elements.get("next").listeners.click();
  assert.equal(elements.get("step-label").textContent, "第 2 / 4 笔");
  assert.equal(location.hash, "#/%E4%B9%A6");

  elements.get("play").listeners.click();
  assert.equal(elements.get("step-label").textContent, "第 1 / 4 笔");
  assert.equal(elements.get("play").disabled, true);
  assert.equal(elements.get("stop").disabled, false);
  assert.equal(elements.get("step-label").attributes["aria-live"], "off");
  assert.equal(timers.size, 1);
  const staleTimer = [...timers.values()][0];
  assert.equal(staleTimer.delay, 1000);
  for (const step of [2, 3, 4]) {
    fireTimer();
    assert.equal(elements.get("step-label").textContent, `第 ${step} / 4 笔`);
    assert.equal(elements.get("sequence").children[step - 1].attributes["aria-current"], "step");
  }
  assert.equal(elements.get("stage").children[0].querySelectorAll(".stroke-current").length, 1);
  finishFinalStroke();
  assertComplete(4);
  assert.equal([...timers.values()][0].delay, 1600);
  fireTimer();
  assert.equal(elements.get("step-label").textContent, "第 1 / 4 笔");
  assert.ok(elements.get("stage").children[0].classes.has("is-loop-reset"));
  elements.get("stop").listeners.click();
  assert.equal(timers.size, 0);
  assert.equal(elements.get("step-label").textContent, "第 1 / 4 笔");
  assert.equal(elements.get("stop").disabled, true);
  assert.equal(elements.get("step-label").attributes["aria-live"], "polite");

  elements.get("play").listeners.click();
  staleTimer.callback();
  assert.equal(elements.get("step-label").textContent, "第 1 / 4 笔");
  fireTimer();
  elements.get("next").listeners.click();
  assert.equal(timers.size, 0);
  assert.equal(elements.get("step-label").textContent, "第 3 / 4 笔");

  elements.get("play").listeners.click();
  elements.get("tab-sequence").listeners.click();
  assert.equal(timers.size, 0);
  assert.equal(elements.get("viewer").dataset.mobileView, "sequence");
  elements.get("tab-stage").listeners.click();
  assert.equal(elements.get("viewer").dataset.mobileView, "stage");

  elements.get("play").listeners.click();
  document.hidden = true;
  document.listeners.visibilitychange();
  assert.equal(timers.size, 0);
  document.hidden = false;

  elements.get("play").listeners.click();
  example.dataset.char = "好";
  elements.get("examples").listeners.click({ target: example });
  await flush();
  assert.equal(timers.size, 1);
  assert.equal(elements.get("character").textContent, "好");
  assert.equal(elements.get("step-label").textContent, "第 1 / 6 笔");

  example.dataset.char = "一";
  elements.get("examples").listeners.click({ target: example });
  await flush();
  assert.equal(timers.size, 0);
  assert.equal(elements.get("play").disabled, true);
  assert.equal(elements.get("stop").disabled, true);
  assert.match(elements.get("playback-status").textContent, /只有一笔/);
  assertComplete(1);
  assertCompleteCard(1);

  // Single playback finishes only after the final drawing event. Stopping
  // progression during that last drawing must not leave it permanently red.
  example.dataset.char = "书";
  elements.get("examples").listeners.click({ target: example });
  await flush();
  elements.get("stop").listeners.click();
  const mode = elements.get("playback-mode");
  mode.value = "once";
  mode.listeners.change();
  elements.get("play").listeners.click();
  for (const step of [2, 3, 4]) fireTimer();
  const oldWatchdog = [...timers.values()][0];
  const oldSvg = elements.get("stage").children[0];
  const oldTarget = oldSvg.querySelector("animate") || oldSvg.querySelector(".stroke-current");
  const oldType = oldTarget.tagName === "ANIMATE" ? "endEvent" : "animationend";
  const oldEnd = oldTarget.listeners[oldType];
  oldEnd({ target: oldSvg }); // The loop-reset event must not finish a stroke.
  assert.equal(oldSvg.querySelectorAll(".stroke-current").length, 1);
  elements.get("stop").listeners.click();
  assert.equal(timers.size, 1); // Current drawing can still complete.
  finishFinalStroke();
  assertComplete(4);
  assert.equal(timers.size, 0);
  assert.equal(elements.get("play").disabled, false);
  assert.equal(elements.get("stop").disabled, true);
  assert.ok(elements.get("sequence").children[3].children[1].querySelector(".stroke-current"));

  elements.get("play").listeners.click();
  oldEnd({ target: oldTarget });
  oldWatchdog.callback();
  assert.equal(elements.get("step-label").textContent, "第 1 / 4 笔");
  mode.focus();
  let prevented = false;
  window.listeners.keydown({ key: "ArrowRight", preventDefault() { prevented = true; } });
  assert.equal(prevented, false);
  assert.equal(elements.get("step-label").textContent, "第 1 / 4 笔");
  for (const step of [2, 3, 4]) fireTimer();
  finishFinalStroke();
  assertComplete(4);
  assert.equal(timers.size, 0);

  // All manual entrances use the same final-stroke rule.
  const penultimate = elements.get("sequence").children[2];
  elements.get("sequence").listeners.click({ target: penultimate });
  assert.equal(elements.get("stage").children[0].querySelectorAll(".stroke-current").length, 1);
  elements.get("next").listeners.click();
  finishFinalStroke();
  assertComplete(4);
  elements.get("sequence").listeners.click({ target: elements.get("sequence").children[3] });
  finishFinalStroke();
  assertComplete(4);
  elements.get("previous").listeners.click();
  document.activeElement = new Element("body");
  window.listeners.keydown({ key: "ArrowRight", preventDefault() {} });
  finishFinalStroke();
  assertComplete(4);

  // Changes during a round apply at the end; changing a completed loop to
  // once cancels its pending replay. Choosing loop while stopped doesn't start it.
  elements.get("play").listeners.click();
  mode.value = "loop";
  mode.listeners.change();
  for (const step of [2, 3, 4]) fireTimer();
  finishFinalStroke();
  assertComplete(4);
  const pendingReplay = [...timers.values()][0];
  assert.equal(pendingReplay.delay, 1600);
  mode.value = "once";
  mode.listeners.change();
  assert.equal(timers.size, 0);
  mode.value = "loop";
  mode.listeners.change();
  pendingReplay.callback();
  assertComplete(4);
  assert.equal(timers.size, 0);

  // A replaced final SVG cannot affect the newly selected character.
  elements.get("play").listeners.click();
  for (const step of [2, 3, 4]) fireTimer();
  const staleWatchdog = [...timers.values()][0];
  const staleSvg = elements.get("stage").children[0];
  const staleTarget = staleSvg.querySelector("animate") || staleSvg.querySelector(".stroke-current");
  const staleType = staleTarget.tagName === "ANIMATE" ? "endEvent" : "animationend";
  const staleEnd = staleTarget.listeners[staleType];
  example.dataset.char = "好";
  elements.get("examples").listeners.click({ target: example });
  await flush();
  staleEnd({ target: staleTarget });
  staleWatchdog.callback();
  assert.equal(elements.get("character").textContent, "好");
  assert.equal(elements.get("step-label").textContent, "第 1 / 6 笔");
  assert.equal(warnings.length, 0);

  // Complete view clears both the fill and the existing special outlines,
  // while static step cards retain their teaching highlight.
  example.dataset.char = "亹";
  elements.get("examples").listeners.click({ target: example });
  await flush();
  elements.get("sequence").listeners.click({ target: elements.get("sequence").children[9] });
  elements.get("show-all").listeners.click();
  assertComplete(22);
  const outline = elements.get("stage").children[0].querySelectorAll(".stroke-done")[9];
  assert.equal(outline.attributes.stroke, "#344c46");
  assert.equal(elements.get("sequence").children[9].children[1].querySelector(".stroke-current").attributes.stroke, "#b55443");
  const fullCard = assertCompleteCard(22);
  assert.equal(fullCard.children[1].querySelectorAll(".stroke-done")[9].attributes.stroke, "#344c46");
  elements.get("play").listeners.click();
  assert.equal(timers.size, 1);
  elements.get("sequence").listeners.click({ target: fullCard });
  assertComplete(22);
  assert.equal(timers.size, 0);
  assert.equal(elements.get("viewer").dataset.mobileView, "stage");

  // The CSS fallback also reports completion; a missing event becomes a
  // fully visible static character rather than a stuck red final stroke.
  elements.get("sequence").listeners.click({ target: elements.get("sequence").children[21] });
  assert.equal(elements.get("stage").children[0].querySelector("animate"), null);
  finishFinalStroke();
  assertComplete(22);
  elements.get("sequence").listeners.click({ target: elements.get("sequence").children[21] });
  fireTimer();
  assertComplete(22);
  assert.match(elements.get("playback-status").textContent, /已使用静态显示/);
  assert.equal(warnings.length, 1);
  assert.equal(timers.size, 0);

  elements.get("sequence").listeners.click({ target: elements.get("sequence").children[21] });
  elements.get("tab-sequence").listeners.click();
  assertComplete(22);
  assert.equal(timers.size, 0);
  elements.get("tab-stage").listeners.click();
  assertComplete(22);

  // Fresh startup with reduced motion must never wait for an animation event.
  elements.clear(); timers.clear(); frames.clear();
  window.HANZI_SHARDS = {};
  window.matchMedia = () => ({ matches: true });
  location.hash = "";
  context = vm.createContext({ window, document, location, history, navigator: {}, console: testConsole, setTimeout });
  for (const file of ["data/index.js", "data/dictionary.js", "data/audit-status.js", "app.js"]) {
    vm.runInContext(fs.readFileSync(path.join(site, file), "utf8"), context);
  }
  await flush();
  assert.equal(timers.size, 0);
  elements.get("show-all").listeners.click();
  assertComplete(5);
  elements.get("previous").listeners.click();
  elements.get("next").listeners.click();
  assertComplete(5);
  assert.equal(timers.size, 0);
  console.log("Smoke test passed: lookup, completion colors, once/loop, manual controls, stale callbacks, fallbacks, and reduced motion");
})().catch((error) => { console.error(error); process.exitCode = 1; });
