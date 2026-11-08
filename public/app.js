'use strict';
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const authShell = $('#auth-shell'), appShell = $('#app-shell');
const loginView = $('#login-view'), registerView = $('#register-view');
let files = [], folders = [], currentPage = 'overview', currentFolderId = null, toastTimer, lockerName = 'My locker';

async function api(url, options = {}) {
  let response;
  try { response = await fetch(url, { credentials: 'same-origin', ...options }); }
  catch { throw new Error('Cannot reach CryptLock. Check that the server is running.'); }
  const type = response.headers.get('content-type') || '';
  const data = type.includes('application/json') ? await response.json() : null;
  if (!response.ok || (data && data.ok !== true)) throw new Error(data?.error || `Request failed (${response.status}).`);
  return data || response;
}
function toast(message) {
  const el = $('#toast'); el.textContent = message; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}
function setFormBusy(form, busy, label) {
  const button = $('button[type="submit"]', form); if (!button) return;
  button.disabled = busy; button.classList.toggle('is-loading', busy);
  const text = $('.button-text', button); if (text) { if (!button.dataset.label) button.dataset.label = text.textContent; text.textContent = busy ? label : button.dataset.label; }
}
function message(id, text, success = false) { const el = $(id); if (el) { el.textContent = text; el.classList.toggle('success', success); } }
function showAuth(view = 'login') { appShell.hidden = true; authShell.hidden = false; loginView.hidden = view !== 'login'; registerView.hidden = view !== 'register'; }
async function showApp() { authShell.hidden = true; appShell.hidden = false; await refreshData(); navigate('overview'); }
$$('[data-view]').forEach(b => b.addEventListener('click', () => showAuth(b.dataset.view)));
$$('[data-toggle]').forEach(b => b.addEventListener('click', () => { const input = $('#' + b.dataset.toggle); input.type = input.type === 'password' ? 'text' : 'password'; b.textContent = input.type === 'password' ? 'Show' : 'Hide'; }));

// Live password-strength feedback for account creation. This is guidance, not a server-side policy.
const registerPassword = $('#register-password');
const strengthWrap = $('#strength-wrap');
const strengthLabel = $('#strength-label');
if (registerPassword && strengthWrap) {
  registerPassword.addEventListener('input', () => {
    const value = registerPassword.value;
    let score = 0;
    if (value.length >= 8) score++;
    if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score++;
    if (/\d/.test(value)) score++;
    if (/[^A-Za-z0-9]/.test(value) && value.length >= 12) score++;
    strengthWrap.dataset.level = value.length ? String(Math.max(1, score)) : '0';
    strengthLabel.textContent = !value ? 'PASSWORD STRENGTH' : ['','WEAK PASSWORD','FAIR PASSWORD','GOOD PASSWORD','STRONG PASSWORD'][Math.max(1, score)];
  });
}
$$('[data-view]').forEach(button => button.addEventListener('click', () => {
  const card = $('#auth-card');
  if (card) { card.classList.remove('auth-card-enter'); void card.offsetWidth; card.classList.add('auth-card-enter'); }
}));

$('#login-form').addEventListener('submit', async e => {
  e.preventDefault(); const form = e.currentTarget, password = $('#login-password').value;
  message('#login-message', ''); if (!password) return message('#login-message', 'Enter your master password.');
  setFormBusy(form, true, 'Unlocking vault...');
  try { await api('/api/login', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ password }) }); form.reset(); await showApp(); }
  catch (err) { message('#login-message', err.message); }
  finally { setFormBusy(form, false); }
});
$('#register-form').addEventListener('submit', async e => {
  e.preventDefault(); const form = e.currentTarget, password = $('#register-password').value, confirm = $('#confirm-password').value, lockerName = $('#register-locker-name').value.trim();
  message('#register-message', '');
  if (!lockerName || lockerName.length > 40 || /[\\/]/.test(lockerName)) return message('#register-message', 'Choose a locker name of 1 to 40 characters without slashes.');
  if (password.length < 8 || password.length > 72) return message('#register-message', 'Use a password between 8 and 72 characters.');
  if (password !== confirm) return message('#register-message', 'The passwords do not match.');
  setFormBusy(form, true, 'Creating locker...');
  try { await api('/api/register', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ password, lockerName }) }); form.reset(); showAuth('login'); message('#login-message', 'Your locker is ready. Sign in to continue.', true); }
  catch (err) { message('#register-message', err.message); }
  finally { setFormBusy(form, false); }
});

function formatBytes(n = 0) { const bytes=Math.max(0,Number(n)||0); if(bytes<1024)return `${Math.round(bytes)} B`; const u=['KB','MB','GB','TB']; let value=bytes/1024, i=0; while(value>=1024 && i<u.length-1){value/=1024;i++;} return `${value.toFixed(2)} ${u[i]}`; }
function exactBytes(n = 0) { return `${(Number(n)||0).toLocaleString()} bytes`; }
function fileCategory(name='') { const ext=name.includes('.')?name.split('.').pop().toLowerCase():''; if(['png','jpg','jpeg','gif','webp','svg','bmp','tif','tiff'].includes(ext))return 'image'; if(['mp4','mkv','mov','avi','webm'].includes(ext))return 'video'; if(['mp3','wav','aac','flac','ogg','m4a'].includes(ext))return 'audio'; if(['pdf','doc','docx','txt','rtf','ppt','pptx','xls','xlsx','csv'].includes(ext))return 'document'; if(['zip','rar','7z','tar','gz'].includes(ext))return 'archive'; if(['c','h','cpp','py','js','ts','html','css','java','json','xml','sql','php','go','rs'].includes(ext))return 'code'; return 'other'; }
function dateLabel(d) { return d ? new Date(d).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}) : '—'; }
function fileGlyph(name='') { const ext = name.split('.').pop().toLowerCase(); return ({pdf:'PDF',png:'IMG',jpg:'IMG',jpeg:'IMG',gif:'IMG',webp:'IMG',doc:'DOC',docx:'DOC',txt:'TXT',csv:'CSV',xlsx:'XLS',xls:'XLS',ppt:'PPT',pptx:'PPT',zip:'ZIP',mp4:'VID',mp3:'AUD'})[ext] || 'FILE'; }
function safeText(tag, cls, text) { const el=document.createElement(tag); if(cls) el.className=cls; el.textContent=text; return el; }
async function refreshData() {
  const [f, d, l] = await Promise.all([api('/api/files'), api('/api/folders'), api('/api/locker')]); files=f.files; folders=d.folders; lockerName=l.lockerName || 'My locker'; updateLockerBranding(); renderOverview(); renderAll(); renderFolders(); renderRecent(); renderTrash(); $('#nav-file-count').textContent=files.filter(x=>!x.trashedAt).length;
}
function navigate(page) {
  currentPage=page; $$('.page-view').forEach(v => v.hidden = v.id !== `page-${page}`);
  $$('.nav-link[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
  const labels={overview:'Overview',all:'All files',folders:'Folders',recent:'Recent',trash:'Trash'}; $('#breadcrumb-current').textContent=labels[page]||'Overview';
  $('#sidebar').classList.remove('open');
}
$$('[data-page]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.page)));
$('#mobile-menu').addEventListener('click',()=>$('#sidebar').classList.toggle('open'));

function updateLockerBranding(){const initial=(lockerName.trim()[0]||'C').toUpperCase();$('#profile-locker-name').textContent=lockerName;$('#profile-avatar').textContent=initial;$('#top-avatar').textContent=initial;document.title=`${lockerName} | CryptLock`; }
function supportsPreview(name=''){return ['.pdf','.png','.jpg','.jpeg','.gif','.webp','.bmp','.txt','.md','.csv','.json','.xml','.log','.c','.h','.cc','.cpp','.cxx','.hpp','.hxx','.py','.js','.ts','.jsx','.tsx','.html','.css','.java','.cs','.sql','.php','.go','.rs','.sh','.bash','.yaml','.yml','.toml','.ini','.conf','.rb','.swift','.kt','.dart','.r','.lua','.env','.mk'].includes(name.toLowerCase().slice(name.lastIndexOf('.')));}
function actionButton(label, symbol, fn, danger=false) { const b=safeText('button',`icon-btn${danger?' danger':''}`,symbol); b.type='button'; b.title=label; b.setAttribute('aria-label',label); b.addEventListener('click',fn); return b; }
function makeFileRow(file, mode='normal') {
  const row=document.createElement('div'); row.className='file-row';
  const name=document.createElement('div'); name.className='file-name'; name.append(safeText('span','file-type',fileGlyph(file.name)));
  const text=document.createElement('div'); text.style.minWidth='0'; text.append(safeText('strong','',file.name),safeText('small','',file.folderName || 'Personal locker')); name.append(text);
  const size=safeText('span','cell-muted size-cell',formatBytes(file.size)); size.title=exactBytes(file.size); size.setAttribute('aria-label',`${formatBytes(file.size)} (${exactBytes(file.size)})`); const date=safeText('span','cell-muted date-cell',dateLabel(file.createdAt));
  const actions=document.createElement('div'); actions.className='row-actions';
  if(mode==='trash') {
    actions.append(actionButton('Restore','↶',()=>restoreFile(file.id)),actionButton('Delete permanently','×',()=>permanentDelete(file.id),true));
  } else {
    if(supportsPreview(file.name)) actions.append(actionButton('Preview','◉',()=>previewFile(file.id,file.name)));
    actions.append(actionButton('Download','↓',()=>downloadFile(file.id,file.name)),actionButton('Move to folder','↗',()=>moveFile(file)),actionButton('Rename','✎',()=>renameFile(file)),actionButton('Move to trash','⌫',()=>trashFile(file.id),true));
  }
  row.append(name,size,date,actions); return row;
}
function renderList(target, list, mode='normal') { const el=$(target); el.replaceChildren(); if(!list.length){const empty=document.createElement('div');empty.className='empty-state';empty.append(safeText('b','',mode==='trash'?'Trash is empty':'Nothing here yet'),safeText('p','',mode==='trash'?'Deleted files will appear here.':'Upload a file or create a folder to get started.'));el.append(empty);return;} list.forEach(f=>el.append(makeFileRow(f,mode))); }
function activeFiles() { return files.filter(f=>!f.trashedAt); }
function renderOverview() {
  const active=activeFiles(), total=active.reduce((n,f)=>n+(f.size||0),0);
  $('#stat-files').textContent=active.length; $('#stat-folders').textContent=folders.length; $('#stat-storage').textContent=formatBytes(total); $('#stat-storage').title=`${exactBytes(total)} total across ${active.length} active file(s)`; $('#stat-storage').setAttribute('aria-label',`${formatBytes(total)} encrypted storage used, ${exactBytes(total)}`);
  const quick=$('#quick-folders'); quick.replaceChildren();
  const top=folders.slice(0,4); if(!top.length){quick.append(safeText('div','empty-state','No folders yet. Create one from Folders.'));}
  top.forEach(folder=>{const b=document.createElement('button');b.className='quick-folder';b.append(safeText('span','folder-glyph','▱'),safeText('strong','',folder.name),safeText('small','',`${folder.fileCount||0} files`));b.addEventListener('click',()=>{navigate('folders');selectFolder(folder.id);});quick.append(b);});
  const recent=active.slice().sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,5); renderList('#overview-recent',recent);
}
function renderAll() { const q=$('#file-search').value.trim().toLowerCase(); const type=$('#file-type-filter')?.value||'all'; const sort=$('#file-sort')?.value||'newest'; const list=activeFiles().filter(f=>f.name.toLowerCase().includes(q)&&(type==='all'||fileCategory(f.name)===type)); list.sort((a,b)=>sort==='oldest'?new Date(a.createdAt)-new Date(b.createdAt):sort==='name-asc'?a.name.localeCompare(b.name):sort==='name-desc'?b.name.localeCompare(a.name):sort==='largest'?(b.size||0)-(a.size||0):sort==='smallest'?(a.size||0)-(b.size||0):new Date(b.createdAt)-new Date(a.createdAt)); renderList('#all-files-list',list); }
function renderFolders() {
  const grid=$('#folders-grid'); grid.replaceChildren();
  if(!folders.length) grid.append(safeText('div','empty-state','No folders created yet. Use “New folder” to organize your files.'));
  folders.forEach(folder=>{
    const card=document.createElement('button');card.className='folder-card';card.append(safeText('span','folder-glyph','▱'),safeText('strong','',folder.name),safeText('small','',`${folder.fileCount||0} files · Open folder`));
    const del=actionButton('Delete empty folder','×',async e=>{e.stopPropagation();await deleteFolder(folder.id);},true);del.classList.add('folder-delete');card.append(del);card.addEventListener('click',()=>selectFolder(folder.id));grid.append(card);
  });
  if(currentFolderId){const folder=folders.find(f=>f.id===currentFolderId);$('#folder-files-title').textContent=folder?folder.name:'Folder contents';$('#folder-files-subtitle').textContent=folder?'Files in this collection.':'Choose a folder to see its files.';$('#clear-folder').hidden=false;renderList('#folder-files',activeFiles().filter(f=>f.folderId===currentFolderId));}
  else {$('#folder-files-title').textContent='Folder contents';$('#folder-files-subtitle').textContent='Choose a folder to see its files.';$('#clear-folder').hidden=true;$('#folder-files').replaceChildren();}
}
function selectFolder(id){currentFolderId=id;renderFolders();}
$('#clear-folder').addEventListener('click',()=>{currentFolderId=null;renderFolders();});
function renderRecent(){const recent=activeFiles().slice().sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));renderList('#recent-files',recent);}
function renderTrash(){renderList('#trash-files',files.filter(f=>f.trashedAt),'trash');}
$('#file-search').addEventListener('input',renderAll); $('#file-type-filter')?.addEventListener('change',renderAll); $('#file-sort')?.addEventListener('change',renderAll);
$$('[data-layout]').forEach(b=>b.addEventListener('click',()=>{$$('[data-layout]').forEach(x=>x.classList.toggle('selected',x===b));$('#all-files-list').classList.toggle('grid-layout',b.dataset.layout==='grid');}));

const picker=$('#file-picker');
function chooseFiles(){picker.click();}
$('#overview-upload').addEventListener('click',chooseFiles);$('#all-upload').addEventListener('click',chooseFiles);
picker.addEventListener('change',async()=>{const chosen=[...picker.files];if(!chosen.length)return;for(const file of chosen){const data=new FormData();data.append('file',file);if(currentPage==='folders'&&currentFolderId)data.append('folderId',currentFolderId);try{await api('/api/files',{method:'POST',body:data});toast(`${file.name} encrypted and uploaded`);}catch(err){toast(`${file.name}: ${err.message}`);}}picker.value='';await refreshData();});

function openModal(){ $('#modal-backdrop').hidden=false;$('#folder-name').value='';message('#folder-message','');$('#folder-name').focus(); }
function closeModal(){ $('#modal-backdrop').hidden=true; }
$('#create-folder').addEventListener('click',openModal);$('#modal-close').addEventListener('click',closeModal);$('#modal-backdrop').addEventListener('click',e=>{if(e.target.id==='modal-backdrop')closeModal();});
$('#folder-form').addEventListener('submit',async e=>{e.preventDefault();const name=$('#folder-name').value.trim();if(!name)return;try{await api('/api/folders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});closeModal();await refreshData();toast('Folder created.');}catch(err){message('#folder-message',err.message);}});
async function deleteFolder(id){if(!confirm('Delete this empty folder?'))return;try{await api(`/api/folders/${id}`,{method:'DELETE'});if(currentFolderId===id)currentFolderId=null;await refreshData();toast('Folder deleted.');}catch(err){toast(err.message);}}
async function moveFile(file){if(!folders.length){toast('Create a folder first.');return;}const choices=folders.map((f,i)=>`${i+1}. ${f.name}`).join('\n');const answer=prompt(`Move “${file.name}” to which folder? Enter its number:\n${choices}\n\nEnter 0 to move to All files.`);if(answer===null)return;const n=Number(answer);if(!Number.isInteger(n)||n<0||n>folders.length){toast('Invalid folder selection.');return;}const folderId=n===0?null:folders[n-1].id;try{await api(`/api/files/${file.id}/folder`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({folderId})});await refreshData();toast('File moved.');}catch(err){toast(err.message);}}
async function renameFile(file){const name=prompt('New file name:',file.name);if(name===null||!name.trim())return;try{await api(`/api/files/${file.id}/rename`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:name.trim()})});await refreshData();toast('File renamed.');}catch(err){toast(err.message);}}
async function trashFile(id){if(!confirm('Move this file to Trash?'))return;try{await api(`/api/files/${id}`,{method:'DELETE'});await refreshData();toast('File moved to Trash.');}catch(err){toast(err.message);}}
async function restoreFile(id){try{await api(`/api/files/${id}/restore`,{method:'POST'});await refreshData();toast('File restored.');}catch(err){toast(err.message);}}
async function permanentDelete(id){if(!confirm('Permanently delete this encrypted file? This cannot be undone.'))return;try{await api(`/api/files/${id}/permanent`,{method:'DELETE'});await refreshData();toast('File permanently deleted.');}catch(err){toast(err.message);}}
async function previewFile(id,name){
  const tab=window.open('about:blank','_blank');
  if(!tab){toast('Allow pop-ups to open file previews.');return;}
  const ext=name.toLowerCase().slice(name.lastIndexOf('.'));
  const textExtensions=['.txt','.md','.csv','.json','.xml','.log','.c','.h','.cc','.cpp','.cxx','.hpp','.hxx','.py','.js','.ts','.jsx','.tsx','.html','.css','.java','.cs','.sql','.php','.go','.rs','.sh','.bash','.yaml','.yml','.toml','.ini','.conf','.rb','.swift','.kt','.dart','.r','.lua','.env','.mk'];
  tab.document.title=`Preview · ${name}`;
  tab.document.body.textContent='Decrypting secure preview…';
  try{
    const response=await fetch(`/api/files/${encodeURIComponent(id)}/preview`,{credentials:'same-origin'});
    if(!response.ok){const d=await response.json().catch(()=>({}));throw new Error(d.error||'Preview failed.');}
    if(textExtensions.includes(ext)){
      const source=await response.text();
      const doc=tab.document; doc.documentElement.style.cssText='background:#0b0d16;color:#e7e9f5;';
      doc.body.replaceChildren(); doc.body.style.cssText='margin:0;background:#0b0d16;color:#e7e9f5;font:14px/1.65 ui-monospace,SFMono-Regular,Consolas,monospace;';
      const header=doc.createElement('header'); header.textContent=`${name}  ·  Decrypted preview`; header.style.cssText='position:sticky;top:0;padding:16px 24px;background:#151827;border-bottom:1px solid #30334a;color:#c8b4ff;font:600 13px system-ui;';
      const pre=doc.createElement('pre'); pre.textContent=source; pre.style.cssText='white-space:pre;overflow:auto;margin:0;padding:24px;tab-size:4;';
      doc.body.append(header,pre);
    }else{
      const blob=await response.blob(),url=URL.createObjectURL(blob);tab.location.href=url;setTimeout(()=>URL.revokeObjectURL(url),60000);
    }
  }catch(err){tab.close();toast(err.message);}
}
async function downloadFile(id,name){try{const response=await fetch(`/api/files/${encodeURIComponent(id)}/download`,{credentials:'same-origin'});if(!response.ok){const d=await response.json().catch(()=>({}));throw new Error(d.error||'Download failed.');}const blob=await response.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Decrypted download ready.');}catch(err){toast(err.message);}}

function closeLockerSettings(){ $('#locker-settings-backdrop').hidden=true; }
$('#locker-settings-button').addEventListener('click',()=>{ $('#locker-name-input').value=lockerName; message('#locker-settings-message',''); $('#locker-settings-backdrop').hidden=false; $('#locker-name-input').focus(); });
$('#locker-settings-close').addEventListener('click',closeLockerSettings);
$('#locker-settings-backdrop').addEventListener('click',e=>{if(e.target.id==='locker-settings-backdrop')closeLockerSettings();});
$('#locker-settings-form').addEventListener('submit',async e=>{e.preventDefault();const name=$('#locker-name-input').value.trim();if(!name||name.length>40||/[\\/]/.test(name))return message('#locker-settings-message','Use 1 to 40 characters without slashes.');try{const result=await api('/api/locker',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({lockerName:name})});lockerName=result.lockerName;updateLockerBranding();closeLockerSettings();toast('Locker name updated.');}catch(err){message('#locker-settings-message',err.message);}});
$('#logout-button').addEventListener('click',async()=>{try{await api('/api/logout',{method:'POST'});files=[];folders=[];currentFolderId=null;showAuth('login');toast('Your locker is locked.');}catch(err){toast(err.message);}});
(async()=>{try{const s=await api('/api/auth/status');if(s.authenticated)await showApp();}catch{showAuth('login');}})();
