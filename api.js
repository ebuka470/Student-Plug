/* Student Plug Hollow adapter — one shared integration module, ClearWords-style.
   Project URL pattern: https://hollow-3mbn.onrender.com/{projectId}/{endpoint}
   Do not place Hollow dashboard credentials or private API keys in browser code.
*/
(function () {
  'use strict';
  const CONFIG = {
    projectId: 'proj_7263khydhi',
    baseUrl: 'https://hollow-3mbn.onrender.com',
    endpoints: {
      users: 'users', profiles: 'profiles', progress: 'progress',
      attempts: 'practice-attempts', saved: 'saved-courses',
      community: 'community-posts', resources: 'resource-submissions',
      notifications: 'notifications'
    },
    timeoutMs: 12000
  };
  const root = () => `${CONFIG.baseUrl}/${encodeURIComponent(CONFIG.projectId)}`;
  const local = (key, fallback = null) => { try { const v=localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (_) { return fallback; } };
  const store = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {} };
  const token = () => { try { return localStorage.getItem('studentPlug.session') || ''; } catch (_) { return ''; } };
  async function request(path, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CONFIG.timeoutMs);
    try {
      const headers = {'Content-Type':'application/json', ...(options.headers||{})};
      if (options.auth && token()) headers.Authorization = `Bearer ${token()}`;
      const res = await fetch(`${root()}/${path.replace(/^\//,'')}`, {...options, headers, signal:controller.signal});
      const raw = await res.text(); let data = null;
      if (raw) { try { data=JSON.parse(raw); } catch (_) { data={raw}; } }
      if (!res.ok) throw new Error(data?.message || data?.error || `Hollow returned ${res.status} for ${path}`);
      return data;
    } catch (e) {
      if (e.name==='AbortError') throw new Error('Hollow timed out. Please retry.');
      if (e instanceof TypeError) throw new Error('Could not reach Hollow. Check your connection.');
      throw e;
    } finally { clearTimeout(timer); }
  }
  const unwrap = x => Array.isArray(x) ? x.map(i=>i?.data ? {...i.data,_id:i._id,_createdAt:i._createdAt,_updatedAt:i._updatedAt}:i) : (Array.isArray(x?.items) ? x.items.map(i=>i?.data ? {...i.data,_id:i._id,_createdAt:i._createdAt,_updatedAt:i._updatedAt}:i) : (x?.data ? [{...x.data,_id:x._id}] : []));
  async function list(endpoint, filters={}) {
    const q = new URLSearchParams({limit:'100', ...Object.fromEntries(Object.entries(filters).filter(([,v])=>v!==undefined && v!==null && v!==''))});
    return unwrap(await request(`${CONFIG.endpoints[endpoint]}?${q}`));
  }
  async function find(endpoint, field, value) { const rows=await list(endpoint,{[field]:value}); return rows.find(r=>String(r[field]??'')===String(value))||null; }
  async function upsert(endpoint, field, payload) {
    const old=await find(endpoint,field,payload[field]);
    if (old?._id) return request(`${CONFIG.endpoints[endpoint]}/${encodeURIComponent(old._id)}`,{method:'PATCH',body:JSON.stringify(payload)});
    return request(CONFIG.endpoints[endpoint],{method:'POST',body:JSON.stringify(payload)});
  }
  const current = () => local('studentPlug.user', null);
  function toBase64(bytes){let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s);}
  async function derivePasswordHash(password,saltText){const salt=Uint8Array.from(atob(saltText),c=>c.charCodeAt(0));const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:160000,hash:'SHA-256'},material,256);return toBase64(new Uint8Array(bits));}
  function constantTimeEqual(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0;}
  function extractRecord(x){if(!x)return null;if(Array.isArray(x))return x[0]?.data?{...x[0].data,_id:x[0]._id}:x[0]||null;if(x.data&&typeof x.data==='object')return {...x.data,_id:x._id||x.data._id};return x;}
  const userKey = () => current()?.id || current()?.userId || current()?.email || localStorage.getItem('studentPlug.guestId');
  window.StudentPlugAPI = {
    isConfigured: () => Boolean(CONFIG.projectId && CONFIG.projectId !== 'REPLACE_PROJECT_ID'),
    getConfig: () => ({configured:Boolean(CONFIG.projectId),projectId:CONFIG.projectId, baseUrl:CONFIG.baseUrl, collections:{...CONFIG.endpoints}}),
    config: () => ({projectId:CONFIG.projectId, baseUrl:CONFIG.baseUrl, endpoints:{...CONFIG.endpoints}}),
    // MVP account records use ordinary Hollow CRUD, as requested. This is a prototype
    // pattern only: public CRUD cannot provide private authentication or protect records.
    async createProfile(profile) { const payload={...profile, email:String(profile.email||'').trim().toLowerCase(), updatedAt:new Date().toISOString()}; return request(CONFIG.endpoints.profiles,{method:'POST',body:JSON.stringify(payload)}); },
    async findProfile(email) { return find('profiles','email',String(email||'').trim().toLowerCase()); },
    async updateProfile(id, patch) { return request(`${CONFIG.endpoints.profiles}/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify({...patch,updatedAt:new Date().toISOString()})}); },
    async signUp(payload) {
      const email=String(payload.email||'').trim().toLowerCase();
      if(!email || !payload.password || String(payload.password).length<8) throw new Error('Enter a valid email and a password of at least 8 characters.');
      const existing=await find('users','email',email);
      if(existing) throw new Error('An account with this email already exists. Please sign in.');
      if(!crypto?.subtle) throw new Error('Secure browser cryptography is unavailable. Open the app over HTTPS.');
      const salt=toBase64(crypto.getRandomValues(new Uint8Array(16)));
      const passwordHash=await derivePasswordHash(String(payload.password),salt);
      const safe={name:String(payload.name||'Student').trim().slice(0,60),email,institutionId:payload.institutionId||'ui',departmentId:payload.departmentId||'',level:String(payload.level||'100'),semester:payload.semester||'both',studyGoal:payload.studyGoal||'understand-courses',passwordSalt:salt,passwordHash,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
      const response=await request(CONFIG.endpoints.users,{method:'POST',body:JSON.stringify(safe)});
      const found=await find('users','email',email).catch(()=>null); const record=extractRecord(found)||extractRecord(response)||safe; const id=record._id||record.id||response?._id||response?.id||response?.data?._id||response?.data?.id||'';
      const user={id,name:safe.name,email,institutionId:safe.institutionId,departmentId:safe.departmentId,level:safe.level,semester:safe.semester,studyGoal:safe.studyGoal};
      const session=`mvp_${toBase64(crypto.getRandomValues(new Uint8Array(24)))}`;
      return {token:session,user};
    },
    async signIn(payload) {
      const email=String(payload.email||'').trim().toLowerCase();
      const record=await find('users','email',email);
      if(!record || !record.passwordSalt || !record.passwordHash) throw new Error('Account not found or its credentials are unavailable.');
      const actual=await derivePasswordHash(String(payload.password||''),record.passwordSalt);
      if(!constantTimeEqual(actual,record.passwordHash)) throw new Error('Email or password is incorrect.');
      const id=record._id||record.id||record.userId||`email_${btoa(email).replace(/[^a-z0-9]/gi,'').slice(0,24)}`;
      const user={id,name:record.name||record.displayName||'Student',email,institutionId:record.institutionId||'ui',departmentId:record.departmentId||'',level:String(record.level||'100'),semester:record.semester||'both',studyGoal:record.studyGoal||'understand-courses'};
      return {token:`mvp_${toBase64(crypto.getRandomValues(new Uint8Array(24)))}`,user};
    },
    async getMe() {
      const user=local('studentPlug.user',null); if(!user) throw new Error('No signed-in account on this device.');
      const record=user.id ? await request(`${CONFIG.endpoints.users}/${encodeURIComponent(user.id)}`) : await find('users','email',user.email);
      const r=extractRecord(record)||record||user;
      return {user:{id:r._id||r.id||user.id,name:r.name||r.displayName||user.name,email:r.email||user.email,institutionId:r.institutionId||user.institutionId,departmentId:r.departmentId||user.departmentId,level:String(r.level||user.level||'100'),semester:r.semester||user.semester||'both',studyGoal:r.studyGoal||user.studyGoal||'understand-courses'}};
    },
    async updateMe(payload) {
      const user=local('studentPlug.user',null); if(!user) throw new Error('No signed-in account on this device.');
      let record=user.id ? await request(`${CONFIG.endpoints.users}/${encodeURIComponent(user.id)}`) : await find('users','email',user.email);
      const r=extractRecord(record)||record; const id=r?._id||r?.id||user.id; if(!id) throw new Error('Could not locate your account record in Hollow.');
      const allowed={}; for(const k of ['name','institutionId','departmentId','level','semester','studyGoal']) if(payload[k]!==undefined) allowed[k]=payload[k];
      const updated=await request(`${CONFIG.endpoints.users}/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify({...allowed,updatedAt:new Date().toISOString()})});
      return {user:{...user,...allowed},record:updated};
    },
    async logout() { localStorage.removeItem('studentPlug.session'); localStorage.removeItem('studentPlug.user'); },
    async listCommunity() { return list('community',{sort:'-createdAt'}); },
    async createCommunityPost(post) { return request(CONFIG.endpoints.community,{method:'POST',body:JSON.stringify({...post,createdAt:new Date().toISOString()})}); },
    async listResourceSubmissions() { return list('resources',{sort:'-createdAt'}); },
    async createResourceSubmission(item) { return request(CONFIG.endpoints.resources,{method:'POST',body:JSON.stringify({...item,createdAt:new Date().toISOString()})}); },
    async getProgress(explicitKey) { const k=explicitKey || userKey(); if(!k) return null; return (await find('progress','userKey',k)) || (await find('progress','userId',k)); },
    async saveProgress(progress) { const k=progress?.userKey || userKey(); if(!k) throw new Error('Sign in or create a guest profile before syncing progress.'); const payload={...progress,userKey:k,updatedAt:new Date().toISOString()}; const old=(await find('progress','userKey',k)) || (await find('progress','userId',k)); if(old?._id) return request(`${CONFIG.endpoints.progress}/${encodeURIComponent(old._id)}`,{method:'PATCH',body:JSON.stringify(payload)}); return request(CONFIG.endpoints.progress,{method:'POST',body:JSON.stringify(payload)}); },
    async saveAttempt(attempt) { const k=userKey(); if(!k) throw new Error('No active learner profile.'); return request(CONFIG.endpoints.attempts,{method:'POST',body:JSON.stringify({...attempt,userId:k,createdAt:new Date().toISOString()})}); },
    async listAttempts() { const k=userKey(); return k ? list('attempts',{userId:k,sort:'-createdAt'}) : []; },
    async saveCourse(courseId) { const k=userKey(); if(!k) throw new Error('No active learner profile.'); return upsert('saved','key',{key:`${k}:${courseId}`,userId:k,courseId,createdAt:new Date().toISOString()}); },
    async listSavedCourses() { const k=userKey(); return k ? list('saved',{userId:k}) : []; },
    async healthCheck() { const out={}; for(const [name,path] of Object.entries(CONFIG.endpoints)){try{await request(`${path}?limit=1`);out[name]={ok:true};}catch(e){out[name]={ok:false,error:e.message};}} return out; }
  };
})();
