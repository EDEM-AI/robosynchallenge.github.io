/* Loopback-only preview using the SAME Finals.gs handler and private local state.
 * It does not write production sheets or send email. Tokens are stored hashed.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const http = require('node:http');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const [configPath, stateDir, portText='8096'] = process.argv.slice(2);
if (!configPath || !stateDir) throw Error('Usage: node tools/preview_finals.cjs PRIVATE_CONFIG PRIVATE_STATE_DIR [PORT]');
const config = JSON.parse(fs.readFileSync(configPath));
fs.mkdirSync(stateDir, {recursive:true, mode:0o700});
const statePath = path.join(stateDir, 'requests.json');
const rows = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath)) : [];
const paperPath = path.join(stateDir, 'papers.json');
const papers = fs.existsSync(paperPath) ? JSON.parse(fs.readFileSync(paperPath)) : [];
const previewProperties = {PAPER_INTAKE_ENABLED:'true', PAPER_DRIVE_ROOT_ID:'paper-preview', PAPER_TEST_DRIVE_ROOT_ID:'paper-test-preview'};
function savePapers() {
  fs.writeFileSync(paperPath+'.tmp',JSON.stringify(papers,null,2),{mode:0o600});
  fs.renameSync(paperPath+'.tmp',paperPath);
}
const sessions = new Map(), limits = new Map();
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
function rate(key, count, duration) {
  const now = Date.now();
  let item = limits.get(key);
  if (!item || item.start + duration < now) { item = {start:now,count:0}; limits.set(key,item); }
  if (++item.count > count) throw Error('Too many requests; please try again later.');
}
function session(id) {
  const value = sessions.get(id);
  if (!value || value.expiry < Date.now()) throw Error('Please sign in again.');
  return value;
}
const context = vm.createContext({
  ...require('./paper_preview.cjs')(stateDir),
  SHEETS:{}, config_:(k,d) => previewProperties[k] ?? config.properties[k] ?? d,
  requiredEmail_:value=>{if(!/^[^\s@<>\r\n]+@[^\s@<>\r\n]+$/.test(value))throw Error('Invalid email');return value;},
  normalizeEmail_:s=>String(s).trim().toLowerCase(), requireSession_:session,
  findRow_:(table, key, email) => {
    if (table !== 'Users' || key !== 'email') throw Error('Unsupported preview lookup');
    return config.users.find(u=>u.email===email);
  },
  rows_:name => { if(name === 'PaperSubmissions')return papers.map((row,i)=>({...row,_rowNumber:i+2})); if(name !== 'FinalsRequests') throw Error('Unsupported preview table'); return rows; },
  updateRow_:(name,number,values)=>{if(name!=='PaperSubmissions'||!papers[number-2])throw Error('Invalid preview row');Object.assign(papers[number-2],values);savePapers();},
  appendRow_:(name,row) => {
    if(name === 'PaperSubmissions'){papers.push(row);savePapers();return;}
    if(name !== 'FinalsRequests') throw Error('Unsupported preview table');
    const next = rows.concat(row);
    fs.writeFileSync(statePath+'.tmp', JSON.stringify(next,null,2), {mode:0o600});
    fs.renameSync(statePath+'.tmp',statePath); rows.push(row);
  },
  reviewerHash_:hash, withReviewLock_:fn=>fn(), checkRateLimit_:(kind,email,n,ms)=>rate(kind+email,n,ms),
  id_:prefix=>prefix+'_'+crypto.randomUUID().replaceAll('-','').slice(0,14), now_:()=>new Date().toISOString(),
});
vm.runInContext(fs.readFileSync(path.join(root,'apps-script/Finals.gs'),'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(root,'apps-script/PaperSubmissions.gs'),'utf8'), context);
const types = {'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.mp4':'video/mp4','.zip':'application/zip','.pdf':'application/pdf'};
function reply(res,status,value) {
  res.writeHead(status, {'Content-Type':'application/json','Cache-Control':'no-store'});
  res.end(JSON.stringify(value));
}
http.createServer(async (req,res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (req.method === 'POST' && pathname === '/api/finals') {
    if (req.headers.origin && !['http://127.0.0.1:'+portText,'http://localhost:'+portText].includes(req.headers.origin)) return reply(res,403,{ok:false,error:'Origin rejected'});
    try {
      let raw='';
      for await (const chunk of req) { raw += chunk; if(Buffer.byteLength(raw)>14*1024*1024) throw Error('Request too large'); }
      const data = JSON.parse(raw);
      if(data.action !== 'paper_submit' && Buffer.byteLength(raw)>65536) throw Error('Request too large');
      if (data.action === 'login') {
        rate('login',20,60000);
        const email = String(data.email||'').trim().toLowerCase();
        const user = config.users.find(u=>u.email===email && u.token_status==='active');
        const expected = Buffer.from(user?.token_sha256 || '0'.repeat(64),'hex');
        if(!crypto.timingSafeEqual(Buffer.from(hash(String(data.token||'')),'hex'),expected) || !user) throw Error('Email or token is invalid.');
        const id=crypto.randomBytes(32).toString('hex'); sessions.set(id,{email,expiry:Date.now()+86400000});
        return reply(res,200,{ok:true,session_id:id});
      }
      if(String(data.action).startsWith('paper_'))return reply(res,200,{...context.handlePaperAction_(data.action,data),preview:true});
      return reply(res,200,context.handleFinalsAction_(data.action,data));
    } catch(error) { return reply(res,400,{ok:false,error:error.message}); }
  }
  if(req.method !== 'GET') return reply(res,405,{ok:false});
  if(pathname === '/static/config.js') {
    res.writeHead(200, {'Content-Type':'text/javascript','Cache-Control':'no-store'});
    return res.end('window.ROBO_SYN_CONFIG={API_BASE_URL:"/api/finals"};');
  }
  const preview = pathname === '/finals/preview/preliminary/';
  const material = ['/material/RoboSynChallenge-2026-submission-template.zip','/material/RoboSynChallenge-report.pdf'].includes(pathname);
  const allowed = material || preview || pathname === '/' || pathname === '/finals/' || pathname === '/faq/' || /^\/static\/(css|js|assets)\/[a-zA-Z0-9_./-]+$/.test(pathname);
  if(!allowed || pathname.split('/').includes('..')) return reply(res,404,{ok:false});
  const name = preview ? 'finals/preview/preliminary/index.html' : pathname === '/' ? 'index.html' : pathname === '/finals/' ? 'finals/index.html' : pathname === '/faq/' ? 'faq/index.html' : pathname.slice(1);
  const file=path.resolve(root,name);
  if(!file.startsWith(root+path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return reply(res,404,{ok:false});
  res.writeHead(200, {'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
  fs.createReadStream(file).pipe(res);
}).listen(Number(portText),'127.0.0.1',()=>console.log('Finals preview: http://127.0.0.1:'+portText+'/finals/'));
