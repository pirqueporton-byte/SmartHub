const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const code = fs.readFileSync(path.join(root, 'view-mode.js'), 'utf8');
const admin = { uid:'admin-uid', email:'pirqueporton@gmail.com', displayName:'Admin' };
const member = { uid:'member-uid', email:'member@example.test' };
function environment(store = new Map(), pathname = '/SmartHub/index.html') {
  const redirects = [], listeners = {}, nodes = new Map();
  const node = id => { if (!nodes.has(id)) nodes.set(id,{style:{},classList:{toggle(){},add(){},remove(){}},textContent:''}); return nodes.get(id); };
  const document = { hidden:false, body:node('body'), addEventListener:(name,fn)=>listeners[name]=fn, getElementById:node, querySelector:node, querySelectorAll:()=>[] };
  document.body.removeAttribute=()=>{};document.body.setAttribute=()=>{};
  const window = {location:{pathname,replace:url=>redirects.push(url)},addEventListener:(name,fn)=>listeners[name]=fn};
  const localStorage = {getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)};
  const context = vm.createContext({window,document,localStorage,console,setTimeout:()=>0,setInterval:()=>0,clearTimeout(){}});
  vm.runInContext(code,context);context.SmartHubView=window.SmartHubView;
  return {api:window.SmartHubView,context,store,redirects,localStorage,nodes,window};
}
const e=environment();
assert.equal(e.api.home(admin),'admin_inicio.html');
assert.equal(e.api.save(admin,'celular'),true);
assert.equal(e.api.home(admin),'admin_porton.html');
assert.equal(e.api.get(member),'tablet');
assert.equal(environment(e.store).api.home(admin),'admin_porton.html','choice survives fresh page context');
assert.equal(environment().api.home(admin),'admin_inicio.html','another device keeps default');
for(const pathname of ['admin_inicio.html','usuario.html','admin_riego.html']) {
 const ctx=environment(e.store,'/SmartHub/'+pathname);assert.equal(ctx.api.route(admin),true);assert.deepEqual(ctx.redirects,['admin_porton.html']);
}
assert.equal(environment(e.store,'/SmartHub/admin_porton.html').api.route(admin),false,'no mobile redirect loop');
e.api.save(admin,'tablet');
assert.equal(environment(e.store,'/SmartHub/usuario.html').api.route(admin),true);
for(const mode of ['tablet','celular']) {e.api.save(member,mode);assert.equal(e.api.home(member),'usuario.html','member never gets admin dashboard');}
assert.equal(e.api.save(member,'admin'),false);
assert.equal(e.api.save(null,'celular'),false);
e.localStorage.setItem=()=>{throw Error('storage disabled')};assert.equal(e.api.save(admin,'celular'),false);
function inline(name) {return [...fs.readFileSync(path.join(root,name),'utf8').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]).join('\n');}
async function checkAuth(name,user,allowed,mobile) {
 const x=environment(new Map(),'/SmartHub/'+name);if(mobile)x.api.save(user,'celular');let callback;let checks=0,signouts=0;
 const auth={currentUser:user,onAuthStateChanged:fn=>callback=fn,signOut:async()=>{signouts++;auth.currentUser=null}};
 const db={ref:p=>({once:async()=>{checks++;return {exists:()=>allowed,val:()=>({nombre:'Test'})}},on(){}})};
 const firebase={initializeApp(){},auth:()=>auth,database:()=>db};firebase.auth.GoogleAuthProvider=class{};
 x.context.firebase=firebase;x.window.firebase=firebase;
 // Mounting DOM controls is separate from authorization and routing.
 x.context.SmartHubView={...x.api,mount(){}};
 vm.runInContext(inline(name),x.context);
 callback(user);await new Promise(resolve=>setImmediate(resolve));
 return {...x,checks,signouts};
}
(async()=>{
 for(const file of ['index.html','usuario.html']) {
  const denied=await checkAuth(file,member,false,true);assert.equal(denied.signouts,1);assert(!denied.redirects.includes('admin_inicio.html'));
  const allowed=await checkAuth(file,member,true,true);assert.equal(allowed.checks,1);assert.equal(allowed.signouts,0);
 }
 const quick=await checkAuth('usuario.html',admin,true,true);assert.deepEqual(quick.redirects,['admin_porton.html']);
 const standard=await checkAuth('usuario.html',admin,true,false);assert.deepEqual(standard.redirects,['admin_inicio.html']);
 const login=await checkAuth('index.html',admin,true,true);assert.deepEqual(login.redirects,['admin_porton.html']);
 console.log('PASS: persisted choice, separate users/devices, launch routing, no loops, return to tablet, storage failure, whitelist denial, admin access to mobile gate. No Firebase writes.');
})().catch(err=>{console.error(err);process.exit(1)});
