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
    this.classList = { add: (name) => this.classes.add(name) };
  }
  addEventListener(type, listener) { this.listeners[type] = listener; }
  setAttribute(name, value) { this.attributes[name] = value; }
  removeAttribute(name) { delete this.attributes[name]; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  querySelectorAll(selector) { return selector === "button" ? this.children.filter((child) => child.tagName === "BUTTON") : []; }
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
    if (!elements.has(id)) elements.set(id, new Element());
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
  addEventListener(type, listener) { this.listeners[type] = listener; },
  setTimeout(callback, delay) { const id = nextTimerId++; timers.set(id, { callback, delay }); return id; },
  clearTimeout(id) { timers.delete(id); },
  requestAnimationFrame(callback) { const id = nextFrameId++; frames.set(id, callback); return id; },
  cancelAnimationFrame(id) { frames.delete(id); },
};
const location = { hash: "", href: "file:///docs/index.html" };
const history = { replaceState(_state, _title, hash) { location.hash = hash; location.href = `file:///docs/index.html${hash}`; } };
context = vm.createContext({ window, document, location, history, navigator: {}, console, setTimeout });

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

(async () => {
  await flush();
  assert.equal(elements.get("viewer").hidden, false);
  assert.equal(elements.get("character").textContent, "永");
  assert.match(elements.get("pinyin").textContent, /yǒng/);
  assert.match(elements.get("definition").textContent, /eternal/);
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
  assert.equal(elements.get("sequence").children.length, 22);
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
  assert.equal(elements.get("sequence").children.length, 14);
  assert.equal(elements.get("standard-digits").textContent, "1 2 2 3 2 5 1 1 3 5 5 4");

  for (const character of [..."彟爇脩莿蒻薳藨"]) {
    example.dataset.char = character;
    elements.get("examples").listeners.click({ target: example });
    await flush();
    const expected = window.HANZI_AUDIT.standardCounts[character];
    assert.ok(elements.get("sequence").children.length > expected);
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
  for (const step of [2, 3, 4, 1]) {
    fireTimer();
    assert.equal(elements.get("step-label").textContent, `第 ${step} / 4 笔`);
    assert.equal(elements.get("sequence").children[step - 1].attributes["aria-current"], "step");
    if (step === 4) assert.equal([...timers.values()][0].delay, 1600);
  }
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
  console.log("Smoke test passed: lookup, meanings, autoplay loop, stop, manual controls, and tab/character changes");
})().catch((error) => { console.error(error); process.exitCode = 1; });
