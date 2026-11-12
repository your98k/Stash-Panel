// Offline rendered-tree regression: executes actual TSX, never calls device APIs.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');
const ts = require('typescript');
const root = process.env.STASH_PANEL_SOURCE || path.resolve(__dirname, '../src');
const jsx = (type, props) => ({ type, props: props || {} });
const failIO = () => { throw Error('Device/network access forbidden in theme regression'); };
const scripting = new Proxy({
  Path: { join: path.join }, Script: { directory: '/synthetic-script' },
  AppIntentManager: { register: spec => args => ({ name: spec.name, args }) },
  AppIntentProtocol: { AppIntent: 'AppIntent' }, fetch: failIO,
  Widget: { isTransparentMode: false, isBlurMode: false, isTransparentBackground: false },
}, { get: (target, name) => name in target ? target[name] : String(name) });
const context = vm.createContext({ console, Date, Math, Set, Map, URL,
  Storage: { get: () => null, set: failIO, remove: failIO },
  Keychain: { get: () => null, set: failIO, remove: failIO },
  fetch: failIO, encodeURIComponent, decodeURIComponent });
const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} }; cache.set(file, module);
  let source = fs.readFileSync(file, 'utf8');
  // Expose only the error component in this VM; never start widget data loading.
  if (file === path.join(root, 'widget.tsx')) {
    assert(/\nmain\(\)\s*$/.test(source), 'Widget entry changed: review offline test isolation');
    source = source.replace(/\nmain\(\)\s*$/, '\nexport { ErrorView }\n');
  }
  const out = ts.transpileModule(source, {
    fileName: file, compilerOptions: { target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, jsxImportSource: 'scripting' }
  }).outputText;
  const localRequire = name => {
    if (name === 'scripting') return scripting;
    if (name === 'scripting/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
    assert(name.startsWith('.'), 'Unexpected dependency: ' + name);
    const base = path.resolve(path.dirname(file), name);
    const found = [base + '.ts', base + '.tsx', path.join(base, 'index.tsx')].find(fs.existsSync);
    assert(found, 'Missing local module: ' + base);
    return load(found);
  };
  vm.runInContext('(function(require,module,exports){' + out + '\n})', context, { filename: file })(localRequire, module, module.exports);
  return module.exports;
}
// Exercise both automatic-JSX absent children and a host normalizing them to [].
// This is an adversarial runtime contract, not a claim to emulate native layout.
let emptyChildren = false;
const renderedComponents = [];
function render(v) {
  if (Array.isArray(v)) return v.map(render);
  if (!v || typeof v !== 'object') return v;
  if (typeof v.type === 'function') {
    renderedComponents.push(v.type.name);
    return render(v.type(emptyChildren && v.props.children === undefined ? { ...v.props, children: [] } : v.props));
  }
  if (v.type && v.props) return { type: v.type, props: Object.fromEntries(Object.entries(v.props).map(([k, p]) => [k, render(p)])) };
  return Object.fromEntries(Object.entries(v).map(([k, p]) => [k, render(p)]));
}
function nodes(v, out = []) {
  if (!v || typeof v !== 'object') return out;
  if (v.type && v.props) out.push(v);
  Object.values(v).forEach(x => nodes(x, out));
  return out;
}
const { makeTheme, Root, Num } = load(path.join(root, 'ui.tsx'));
const { ReferenceStyle } = load(path.join(root, 'styles/board.tsx'));
const { DEFAULT_LOOK, getPrefs } = load(path.join(root, 'settings.ts'));
const plain = makeTheme(DEFAULT_LOOK);
const ctxFor = (th, inApp = false, stash = null) => ({ th, inApp, stash, size: 'm',
  subs: [], prefs: getPrefs(), stashErr: '', all: {}, nat: null, events: [] });
const resolve = (paint, appearance) => typeof paint === 'object' ? paint[appearance] : paint;
const text = (tree, value) => nodes(tree).find(n => n.type === 'Text' && n.props.children === value);
const failures = [];
function check(name, run) { try { run(); console.log('PASS ' + name); } catch (e) { failures.push(name + ': ' + e.message); console.error('FAIL ' + name + ': ' + e.message); } }
for (const appearance of ['light', 'dark']) {
  for (const inApp of [false, true]) check(`${appearance} ${inApp ? 'preview' : 'widget'} background and foreground`, () => {
    const tree = render(jsx(ReferenceStyle, { ctx: ctxFor(plain, inApp) }));
    if (inApp) assert.equal(resolve(tree.props.background.props.background, appearance), resolve(plain.bg, appearance), 'Preview retains adaptive background');
    else assert.equal(tree.props.background, undefined, 'Native plain surface belongs to the host');
    for (const value of ['Stash', '—', '未测']) {
      assert(text(tree, value), 'Metric missing: ' + value);
      assert.equal(resolve(text(tree, value).props.foregroundStyle, appearance), resolve(plain.t1, appearance), 'Primary foreground must track appearance');
    }
    assert.equal(resolve(text(tree, '节点延迟').props.foregroundStyle, appearance), resolve(plain.t2, appearance));
    const divider = nodes(tree).find(n => n.type === 'Rectangle' && n.props.frame?.width === 0.5);
    assert.equal(resolve(divider.props.fill, appearance), resolve(plain.border, appearance));
    const refresh = nodes(tree).find(n => n.type === 'Image' && n.props.systemName === 'arrow.clockwise');
    assert.equal(resolve(refresh.props.background.props.fill, appearance), resolve(plain.card, appearance));
    if (inApp) assert.equal(tree.props.clipShape.cornerRadius, 22);
    else {
      assert(!nodes(tree).some(n => n.props.widgetBackground !== undefined), 'No native plain backdrop modifier');
      assert(!nodes(tree).some(n => n.type === 'Rectangle' && !n.props.frame), 'No full-size rectangular paint in plain widget');
    }
    const content = tree.props.children;
    assert.equal(content.props.padding, 13); assert.equal(content.props.spacing, 5);
  });
}
for (const look of [
  { mode: 'custom', color: '#102030', text: 'auto' },
  { mode: 'custom', color: '#FFF4E0', text: 'auto' },
  { mode: 'custom', color: '#102030', text: 'custom', textColor: '#FFEEDD' },
  { mode: 'custom', bgType: 'image', image: '/synthetic-background.png', text: 'white' },
]) for (const inApp of [false, true]) check(`custom ${look.bgType || look.color} ${look.text} ${inApp ? 'preview' : 'widget'}`, () => {
  const th = makeTheme({ ...DEFAULT_LOOK, ...look, accent: '#AABBCC' });
  const ctx = ctxFor(th, inApp);
  const before = JSON.stringify(ctx);
  const tree = render(jsx(ReferenceStyle, { ctx }));
  assert.equal(inApp ? tree.props.background.props.background : tree.props.background.props.widgetBackground, th.bg);
  assert.equal(text(tree, 'Stash').props.foregroundStyle, th.t1);
  assert.equal(text(tree, '未测').props.foregroundStyle, th.t1);
  assert.equal(text(tree, '节点延迟').props.foregroundStyle, th.t2);
  assert.equal(text(tree, '未知').props.foregroundStyle, th.accent);
  assert.equal(JSON.stringify(ctx), before, 'Context must not be mutated');
  if (th.image) {
    assert(nodes(tree).some(n => n.type === 'Image' && n.props.filePath === th.image.path));
    assert(nodes(tree).some(n => n.type === 'Rectangle' && n.props.fill === 'rgba(0,0,0,0.3)'));
  }
});
check('runtime totals, metric values, actions and quota remain intact', () => {
  const stash = { t: 0, mode: 1, groups: [], speed: { downloadTotal: 2048, uploadTotal: 1024 }, nodes: {} };
  const ctx = ctxFor(plain, false, stash);
  ctx.subs = [{ usage: { total: 8192, up: 1024, down: 1024 } }];
  const tree = render(jsx(ReferenceStyle, { ctx }));
  for (const value of ['2.0 KB', '1.0 KB', '0', '6.0 KB']) assert(text(tree, value), value);
  const intents = nodes(tree).filter(n => n.type === 'Button').map(n => n.props.intent);
  assert(intents.some(i => i.name === 'StashPanelRefreshIntent'));
  assert(intents.some(i => i.name === 'StashPanelModeIntent' && i.args.mode === 2));
});
check('shared Root leaves native surface unpainted and Num respects explicit color', () => {
  const tree = render(jsx(Root, { ctx: ctxFor(plain), children: jsx(Num, { value: '42', size: 20, color: plain.t1 }) }));
  assert.equal(tree.props.background, undefined);
  assert.equal(text(tree, '42').props.foregroundStyle.dark, plain.t1.dark);
});
check('value metrics survive empty children arrays, including zero and unavailable states', () => {
  emptyChildren = true;
  try {
    for (const inApp of [false, true]) {
      const stash = { t: 0, mode: 1, groups: [], speed: { downloadTotal: 2048, uploadTotal: 1024 }, nodes: {} };
      const ctx = ctxFor(plain, inApp, stash);
      ctx.subs = [{ usage: { total: 8192, up: 1024, down: 1024 } }];
      const tree = render(jsx(ReferenceStyle, { ctx }));
      for (const value of ['策略组数', '节点延迟', '剩余流量', '运行模式', '0', '未测', '6.0 KB', '分流']) {
        assert(text(tree, value), 'Empty children suppressed metric: ' + value);
      }
      const absent = render(jsx(ReferenceStyle, { ctx: ctxFor(plain, inApp) }));
      for (const value of ['—', '未测', '未添加', '未知']) assert(text(absent, value), value);
    }
  } finally { emptyChildren = false; }
});
check('default native tree has no Background component or surface paint', () => {
  renderedComponents.length = 0;
  const tree = render(jsx(ReferenceStyle, { ctx: ctxFor(plain) }));
  assert(!renderedComponents.includes('Background'), 'Plain native must not instantiate Background');
  assert.equal(tree.props.background, undefined);
  for (const n of nodes(tree)) {
    assert.equal(n.props.widgetBackground, undefined, 'No backdrop modifier anywhere');
    if (n.props.background !== undefined) {
      // Only the intentionally small refresh and mode controls may paint.
      assert.equal(n.props.background.type, 'Capsule');
      assert((n.type === 'Image' && n.props.systemName === 'arrow.clockwise' && n.props.frame.width === 20 && n.props.frame.height === 20)
        || (n.type === 'HStack' && n.props.padding.horizontal === 7 && n.props.padding.vertical === 2), 'Unexpected background outside small controls');
    }
    if (n.props.fill !== undefined) {
      assert(['Circle', 'Capsule'].includes(n.type) || (n.type === 'Rectangle' && n.props.frame?.width === 0.5 && n.props.frame?.height === 39), 'Unexpected surface fill');
    }
  }
});
check('all sizes isolate native and preview backgrounds, including image blur and dim', () => {
  for (const size of ['s', 'm', 'l']) for (const inApp of [false, true]) {
    for (const look of [DEFAULT_LOOK, { ...DEFAULT_LOOK, mode: 'custom', color: '#142536' },
      { ...DEFAULT_LOOK, mode: 'custom', bgType: 'image', image: '/synthetic-image.png', blur: 4, dim: 0.45 }]) {
      const th = makeTheme(look);
      const tree = render(jsx(Root, { ctx: { ...ctxFor(th, inApp), size }, children: jsx(Num, { value: '42', size: 13 }) }));
      const backdrop = tree.props.background;
      const content = tree.props.children;
      const paints = inApp || th.custom;
      assert.equal(backdrop !== undefined, paints);
      if (paints) {
        assert.equal(backdrop.props.ignoresSafeArea, !inApp);
        assert.equal(backdrop.props.clipped, true);
        assert.equal(backdrop.props.background !== undefined, inApp);
        assert.equal(JSON.stringify(inApp ? backdrop.props.background : backdrop.props.widgetBackground), JSON.stringify(th.bg));
      }
      assert(!content.props.background && !content.props.widgetBackground);
      assert(!content.props.ignoresSafeArea, 'Content must not extend beyond safe bounds');
      assert.equal(nodes(tree).filter(n => n.props.widgetBackground !== undefined).length, !inApp && th.custom ? 1 : 0);
      if (inApp) assert.equal(tree.props.clipShape.cornerRadius, 22);
      else assert(!tree.props.clipShape && !tree.props.overlay, 'Native host owns corner mask');
      if (th.image) {
        const img = nodes(backdrop).find(n => n.type === 'Image');
        assert.equal(img.props.filePath, '/synthetic-image.png');
        assert.equal(img.props.blur, 4); assert.equal(img.props.scaleToFill, true);
        assert(nodes(backdrop).some(n => n.type === 'Rectangle' && n.props.fill === 'rgba(0,0,0,0.45)'));
        assert(!nodes(content).some(n => n.type === 'Image'));
      }
    }
  }
});
check('host transparent, blur and image modes suppress native custom backdrops, not app previews', () => {
  for (const flag of ['isTransparentMode', 'isBlurMode', 'isTransparentBackground']) {
    scripting.Widget[flag] = true;
    try {
      for (const size of ['s', 'm', 'l']) for (const look of [DEFAULT_LOOK,
        { ...DEFAULT_LOOK, mode: 'custom', color: '#142536' },
        { ...DEFAULT_LOOK, mode: 'custom', bgType: 'image', image: '/synthetic-image.png', blur: 4, dim: 0.45 }]) {
        const th = makeTheme(look);
        renderedComponents.length = 0;
        const native = render(jsx(Root, { ctx: { ...ctxFor(th), size }, children: jsx(Num, { value: '42', size: 13 }) }));
        assert(!renderedComponents.includes('Background'), flag + ' must not instantiate Background');
        assert.equal(native.props.background, undefined);
        assert(!nodes(native).some(n => n.props.widgetBackground !== undefined || n.props.background !== undefined || n.props.fill !== undefined || n.type === 'Image'), 'Host backdrop must not be covered by custom paint/image/dim');
        const preview = render(jsx(Root, { ctx: { ...ctxFor(th, true), size } }));
        assert.equal(JSON.stringify(preview.props.background.props.background), JSON.stringify(th.bg), 'Preview is independent of widget flags');
        assert.equal(preview.props.clipShape.cornerRadius, 22);
        if (th.image) assert(nodes(preview).some(n => n.type === 'Image' && n.props.filePath === th.image.path));
      }
    } finally { scripting.Widget[flag] = false; }
  }
});
check('native error state never paints an inset rectangle or backdrop', () => {
  const { ErrorView } = load(path.join(root, 'widget.tsx'));
  for (const flag of [null, 'isTransparentMode', 'isBlurMode', 'isTransparentBackground']) {
    if (flag) scripting.Widget[flag] = true;
    try {
      renderedComponents.length = 0;
      const tree = render(jsx(ErrorView, { message: 'Synthetic unavailable data' }));
      assert(!renderedComponents.includes('Background'));
      assert(nodes(tree).some(n => n.type === 'Text'), 'Error remains visible');
      assert(!nodes(tree).some(n => n.props.background !== undefined || n.props.widgetBackground !== undefined || n.props.fill !== undefined), 'Error view must remain clear');
    } finally { if (flag) scripting.Widget[flag] = false; }
  }
});
check('medium fixed row budget stays 157pt with larger metric clearance', () => {
  const tree = render(jsx(ReferenceStyle, { ctx: ctxFor(plain) }));
  const content = tree.props.children;
  const rows = content.props.children;
  assert.equal(rows.length, 4);
  const metricHeights = nodes(rows[2]).filter(n => n.type === 'VStack' && n.props.frame?.height).map(n => n.props.frame.height);
  assert.equal(metricHeights.join(','), '35,35,35,35');
  assert.equal(2 * content.props.padding + 20 + 49 + 35 + 12 + 3 * content.props.spacing, 157);
});
if (failures.length) { console.error(`${failures.length} theme checks failed`); process.exitCode = 1; }
else console.log('PASS all offline TSX rendered-tree regressions; native Scripting rasterization not tested');
