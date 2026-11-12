const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');
const ts = require('typescript');
const esbuild = require('esbuild');
const root = process.env.STASH_PANEL_SOURCE || path.resolve(__dirname, '../src');
const sources = [];
function walk(dir) { for (const ent of fs.readdirSync(dir, {withFileTypes:true})) { const p=path.join(dir,ent.name); if(ent.isDirectory()) walk(p); else if(/\.tsx?$/.test(p)) sources.push(p); } }
walk(root);
for(const filename of sources) {
  const result=ts.transpileModule(fs.readFileSync(filename,'utf8'), {fileName:filename, reportDiagnostics:true, compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.Preserve,isolatedModules:true}});
  const errors=(result.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error);
  assert.equal(errors.length,0,filename+': '+errors.map(x=>ts.flattenDiagnosticMessageText(x.messageText,' ')).join('\n'));
}
console.log('PASS syntax: '+sources.length+' TypeScript/TSX files');
const memory=new Map(), secrets=new Map();
const calls=[];
let offline=false, forbidden=false;
const leaf='Node / Tokyo';
const fixture={proxies:{'Select / Main':{type:'Selector',now:leaf,all:[leaf,'Fast']},Fast:{type:'URLTest',now:leaf,all:[leaf]},[leaf]:{type:'Shadowsocks',history:[{time:'2026-11-12T02:00:00Z',delay:80},{time:'2026-11-12T02:01:00Z',delay:0}]}}};
async function mockFetch(url,opts={}) {
  calls.push({url,...opts});
  if(offline) throw new Error('SENSITIVE URL '+url);
  if(forbidden) return {ok:false,status:401};
  const p=url.replace(/^http:\/\/127\.0\.0\.1:9090/,'');
  let payload;
  if(p==='/configs') payload={mode:'rule'};
  else if(p==='/proxies') payload=fixture;
  else if(p==='/version') payload={version:'3.7.0'};
  else if(p==='/stash/speed') payload={uploadTotal:1,downloadTotal:2,upload:3,download:4};
  else if(p==='/stash/proxy/display/v2') payload={mode:'rule',proxyGroups:[{name:'Select / Main',type:'Selector',now:leaf,proxies:[{name:leaf,type:'Shadowsocks',alive:true,delay:80},{name:'Fast',type:'URLTest'}]}]};
  else if(p.startsWith('/proxies/')&&p.includes('/delay?')) payload={delay:23,alive:true};
  else if(opts.method==='PUT') payload={};
  else throw Error('Unexpected mock request');
  return {ok:true,status:200,json:async()=>payload};
}
const scripting={fetch:mockFetch,Notification:{schedule:async()=>{}}};
const context=vm.createContext({Storage:{get:k=>memory.get(k)??null,set:(k,v)=>memory.set(k,v),remove:k=>memory.delete(k)},Keychain:{get:k=>secrets.get(k)??null,set:(k,v)=>{secrets.set(k,v);return true},remove:k=>secrets.delete(k)},console,Date,Math,Set,Map,URL,encodeURIComponent,decodeURIComponent});
const cache={};
function load(filename) {
  const p=path.join(root,filename+'.ts'); if(cache[p]) return cache[p].exports;
  const module={exports:{}}; cache[p]=module;
  const out=ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText;
  const fn=vm.runInContext('(function(require,module,exports){'+out+'\n})',context,{filename:p});
  fn(name=>name==='scripting'?scripting:load(path.normalize(path.join(path.dirname(filename),name))),module,module.exports);
  return module.exports;
}
async function test() {
 const settings=load('settings'), api=load('api'), subs=load('subs');
 settings.setApiSecret('mock-secret');
 assert(!JSON.stringify([...memory]).includes('mock-secret'));
 assert.throws(()=>settings.setApiUrl('http://user:pass@host:9090'));
 assert.throws(()=>settings.setApiUrl('http://host/?secret=value'));
 const r=await api.loadStash();
 assert.equal(r.error,''); assert.equal(r.data.mode,1); assert.equal(r.data.version,'3.7.0'); assert.equal(r.data.speed.download,4);
 assert.equal(r.data.groups.find(g=>g.name==='Select / Main').selectable,true);
 assert.equal(r.data.groups.find(g=>g.name==='Fast').selectable,false);
 assert.equal(r.data.nodes[leaf].ok,false);
 assert.equal(r.data.nodes[leaf].h.join(','),'80,-1');
 assert(calls.every(c=>!c.method||c.method==='GET'),'load must not write');
 assert(calls.every(c=>c.headers.Authorization==='Bearer mock-secret'));
 assert.equal(api.pathTo(r.data,'Fast','other'),null);
 assert.equal(api.switchTarget(r.data,r.data.groups.find(g=>g.name==='Fast')),undefined);
 const n=await api.testNode(leaf);
 assert.equal(n.nodes[leaf].ms,23);
 assert(calls.some(c=>c.url.includes('/proxies/Node%20%2F%20Tokyo/delay?timeout=5000&url=')));
 await assert.rejects(api.setStash({group:'Fast',node:leaf}),/自动管理/);
 const before=calls.length; await api.setStash({mode:2});
 assert(calls.slice(before).some(c=>c.method==='PATCH'&&c.body==='{"mode":"global"}'));
 await api.setStash({group:'Select / Main',node:'Fast'});
 assert(calls.some(c=>c.method==='PUT'&&c.url.endsWith('/Select%20%2F%20Main')&&c.body==='{"name":"Fast"}'));
 offline=true; const stale=await api.loadStash(); assert.equal(stale.data.stale,true); assert(!stale.error.includes('SENSITIVE')); assert(!stale.error.includes('mock-secret')); offline=false;
 forbidden=true; const denied=await api.loadStash(); assert.match(denied.error,/鉴权/); forbidden=false;
 const yaml='proxy-providers:\n  "Primary":\n    type: http\n    url: "https://example.test/sub?token=secret"\n    headers:\n      User-Agent: Stash\n  Backup: { type: http, url: "https://example.test/backup" }\nproxy-groups:\n  - name: test';
 const imported=subs.parseSubs(yaml);
 assert.equal(imported.length,2); assert.equal(imported[0].name,'Primary'); assert(imported[0].url.includes('#headers='));
 assert.equal(subs.parseSubs('https://example.test/sub').length,1);
 assert.equal(subs.parseUserinfo('upload=1; download=2; total=3; expire=4').total,3);
 const added=subs.importSubs(imported,12); assert.equal(added.added.length,2); assert.equal(subs.importSubs(imported,12).added.length,0);
 assert(!JSON.stringify([...memory]).includes('token=secret'));
 assert.equal(subs.listSubs().length,2);
 assert.equal(subs.subURL(subs.listSubs()[0].id),imported[0].url);
 assert.equal(api.normalize({mode:'direct'},{},null,fixture).mode,0);
 assert.equal(api.normalize({mode:'global'},{},null,fixture).mode,2);
 console.log('PASS mocked API: read-only load, auth, mode mapping, nested groups, automatic policy guard, delay/history, encoded writes, offline cache, redacted failures');
 console.log('PASS subscription: YAML providers, inline mapping, quoted URL, headers, plain URL, quota parsing, duplicate import, Keychain-only links');
 const meta=JSON.parse(fs.readFileSync(path.join(root,'script.json'),'utf8'));
 assert.equal(meta.remoteResource,null); assert.equal(meta.name,'Stash Panel');
 assert(fs.existsSync(path.join(root,meta.iconImage))); assert(meta.author && meta.author.name==='your98k');
 const plugin={name:'host-filesystem',setup(build){
  build.onResolve({filter:/.*/},args=>{
   if(args.path==='scripting'||args.path.startsWith('scripting/')) return {path:args.path,external:true};
   let p=path.isAbsolute(args.path)?args.path:path.resolve(args.importer?path.dirname(args.importer):root,args.path);
   if(!fs.existsSync(p)) { if(fs.existsSync(p+'.ts'))p+='.ts';else if(fs.existsSync(p+'.tsx'))p+='.tsx';else throw Error('Missing module '+p); }
   return {path:p,namespace:'host'};
  });
  build.onLoad({filter:/.*/,namespace:'host'},args=>({contents:fs.readFileSync(args.path,'utf8'),loader:args.path.endsWith('.tsx')?'tsx':'ts',resolveDir:path.dirname(args.path)}));
 }};
 const built=await esbuild.build({entryPoints:['index.tsx','widget.tsx','app_intents.tsx','control_widget_button.tsx','control_widget_toggle.tsx'].map(x=>path.join(root,x)),bundle:true,write:false,outdir:'/tmp/stash-validation',format:'esm',platform:'neutral',jsx:'automatic',jsxImportSource:'scripting',plugins:[plugin],logLevel:'warning'});
 assert.equal(built.outputFiles.length,5);
 console.log('PASS bundled: app, widget, AppIntents; all local imports and exports resolve');
 console.log('NOTE: Scripting SDK typecheck and on-device UI rendering not verified; no live Stash requests were made.');
}
test().catch(e=>{console.error(e);process.exitCode=1});
