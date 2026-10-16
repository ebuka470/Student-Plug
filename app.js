(function () {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const KEY = 'studentPlug.v1';
  const state = loadState();
  let courses = [], institutions = [], departments = [], resources = [];
  const app = $('#page-content') || $('#app');
  const page = document.body.dataset.page || 'home';
  const params = new URLSearchParams(location.search);

  function loadState() {
    const defaults = { name: '', email: '', institutionId: 'ui', departmentId: 'computer-science', level: '100', semester: 'both', studyGoal: 'understand-courses', onboardingComplete: false, selectedCourses: ['cis-104','cis-103','psy-101'], saved: [], completedTopics: [], practiceHistory: [], theme: 'light', communityDrafts: [] };
    try { return { ...defaults, ...(JSON.parse(localStorage.getItem(KEY) || '{}')) }; } catch (_) { return defaults; }
  }
  let syncTimer = null;
  let syncInFlight = false;
  let syncQueued = false;
  function getSyncKey() {
    let key = '';
    try { key = localStorage.getItem('studentPlug.userKey') || ''; } catch (_) {}
    if (!key) {
      key = `guest_${(window.crypto && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;
      try { localStorage.setItem('studentPlug.userKey', key); } catch (_) {}
    }
    return key;
  }
  function progressPayload() {
    // Deliberately excludes email, full name, passwords, and institution/profile details.
    return {
      userKey: getSyncKey(), schemaVersion: 1,
      selectedCourses: state.selectedCourses || [], saved: state.saved || [],
      completedTopics: state.completedTopics || [],
      practiceHistory: (state.practiceHistory || []).slice(0, 40),
      updatedAt: new Date().toISOString()
    };
  }
  function queueProgressSync() {
    if (!window.StudentPlugAPI || !StudentPlugAPI.isConfigured() || !state.onboardingComplete) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(async () => {
      if (syncInFlight) { syncQueued = true; return; }
      syncInFlight = true;
      try {
        await StudentPlugAPI.saveProgress(progressPayload());
        try { localStorage.setItem('studentPlug.lastSync', new Date().toISOString()); localStorage.setItem('studentPlug.syncError', ''); } catch (_) {}
      } catch (error) {
        try { localStorage.setItem('studentPlug.syncError', error.message); } catch (_) {}
      } finally {
        syncInFlight = false;
        if (syncQueued) { syncQueued = false; queueProgressSync(); }
      }
    }, 650);
  }
  function saveState() {
    localStorage.setItem(KEY, JSON.stringify(state));
    queueProgressSync();
  }
  async function restoreAuthenticatedProfile() {
    if (!localStorage.getItem('studentPlug.session') || !window.StudentPlugAPI) return false;
    try {
      const result = await StudentPlugAPI.getMe();
      const user = result && (result.user || result.profile || result);
      if (user && (user.id || user._id)) localStorage.setItem('studentPlug.userKey', `account_${user.id || user._id}`);
      if (user && user.name) state.name = user.name;
      if (user && user.email) state.email = user.email;
      if (user && user.institutionId) state.institutionId = user.institutionId;
      if (user && user.departmentId) state.departmentId = user.departmentId;
      if (user && user.level) state.level = user.level;
      if (user && user.semester) state.semester = user.semester;
      if (user && user.studyGoal) state.studyGoal = user.studyGoal;
      localStorage.setItem(KEY, JSON.stringify(state));
      localStorage.setItem('studentPlug.user', JSON.stringify({id:user?.id || user?._id || '',name:user?.name || '',email:user?.email || ''}));
      return true;
    } catch (error) {
      try { localStorage.setItem('studentPlug.authError', error.message); } catch (_) {}
      return false;
    }
  }
  async function restoreRemoteProgress() {
    if (!window.StudentPlugAPI || !StudentPlugAPI.isConfigured()) return false;
    try {
      const remote = await StudentPlugAPI.getProgress(getSyncKey());
      if (!remote) return false;
      state.selectedCourses = [...new Set([...(state.selectedCourses || []), ...(Array.isArray(remote.selectedCourses) ? remote.selectedCourses : [])])];
      state.saved = [...new Set([...(state.saved || []), ...(Array.isArray(remote.saved) ? remote.saved : [])])];
      state.completedTopics = [...new Set([...(state.completedTopics || []), ...(Array.isArray(remote.completedTopics) ? remote.completedTopics : [])])];
      const histories = [...(Array.isArray(remote.practiceHistory) ? remote.practiceHistory : []), ...(state.practiceHistory || [])];
      const historySeen = new Set();
      state.practiceHistory = histories.filter(item => { const key = `${item.date || ''}:${item.score || 0}:${item.total || 0}`; if (historySeen.has(key)) return false; historySeen.add(key); return true; }).slice(0, 40);
      localStorage.setItem(KEY, JSON.stringify(state));
      try { localStorage.setItem('studentPlug.lastSync', remote.updatedAt || new Date().toISOString()); } catch (_) {}
      return true;
    } catch (error) {
      try { localStorage.setItem('studentPlug.syncError', error.message); } catch (_) {}
      return false;
    }
  }
  function escapeHTML(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function toast(message) {
    let node = $('.toast'); if (!node) { node = document.createElement('div'); node.className = 'toast'; node.setAttribute('role','status'); document.body.appendChild(node); }
    node.textContent = message; node.classList.remove('hidden'); clearTimeout(toast.timer); toast.timer = setTimeout(() => node.classList.add('hidden'), 3000);
  }
  async function json(path) { const res = await fetch(path); if (!res.ok) throw new Error(`Couldn't load ${path}`); return res.json(); }
  async function loadData() {
    const [c, i, d, r] = await Promise.all([
      json('data/courses.json'), json('data/institutions.json'), json('data/departments.json'), json('data/resources.json')
    ]);
    courses = c.courses; institutions = i.institutions; departments = d.departments; resources = r.resources;
  }
  const courseById = id => courses.find(c => c.id === id);
  function courseMatchesProfile(c) {
    const sameLevel = String(c.level) === String(state.level) || c.level === 'All';
    const sameDepartment = !c.departmentId || c.departmentId === state.departmentId || c.departmentId === 'general';
    const sameInstitution = !c.institutionId || c.institutionId === state.institutionId || c.institutionId === 'other';
    return sameLevel && (sameDepartment || sameInstitution);
  }
  function recommendedCourses() {
    const exact = courses.filter(c => String(c.level) === String(state.level) && (c.institutionId === state.institutionId || c.institutionId === 'other') && (c.departmentId === state.departmentId || c.departmentId === 'general' || !c.departmentId));
    if (exact.length) return exact;
    return courses.filter(c => String(c.level) === String(state.level));
  }
  function departmentsForInstitution(institutionId) { return departments.filter(d => d.institutionId === institutionId); }
  function refreshDepartmentSelect(select, institutionId, selectedId) {
    if (!select) return;
    const options = departmentsForInstitution(institutionId);
    select.innerHTML = options.map(d => `<option value="${escapeHTML(d.id)}" ${d.id===selectedId?'selected':''}>${escapeHTML(d.name)}</option>`).join('');
    if (!options.some(d=>d.id===selectedId) && options[0]) select.value=options[0].id;
  }
  const topicUrl = (courseId, topicId) => `topic.html?course=${encodeURIComponent(courseId)}&topic=${encodeURIComponent(topicId)}`;
  const courseUrl = id => `course.html?id=${encodeURIComponent(id)}`;
  const savedHas = id => state.saved.includes(id);
  function courseProgress(id) {
    const course = courseById(id); if (!course) return 0;
    const fileTopics = window.__lessonCache && window.__lessonCache[id] ? window.__lessonCache[id].topics : null;
    const topics = fileTopics || [];
    if (!topics.length) return 0;
    const done = topics.filter(t => state.completedTopics.includes(`${id}:${t.id}`)).length;
    return Math.round(done / topics.length * 100);
  }
  async function getLesson(course) {
    window.__lessonCache = window.__lessonCache || {};
    const cacheKey = course.lessonFile || course.id;
    if (window.__lessonCache[cacheKey]) {
      window.__lessonCache[course.id] = window.__lessonCache[cacheKey];
      return window.__lessonCache[cacheKey];
    }
    const data = await json(course.lessonFile);
    window.__lessonCache[cacheKey] = data;
    window.__lessonCache[course.id] = data;
    return data;
  }
  function navLink(href, label, icon, active) { return `<a class="nav-link ${active ? 'active' : ''}" href="${href}"><span class="nav-icon">${icon}</span><span>${label}</span></a>`; }
  function renderShell(content, active = 'home') {
    // The document owns the page shell and semantic structure; JS only fills the page's content region.
    app.innerHTML = content;
    const nav = [ ['index.html','home'], ['learn.html','learn'], ['practise.html','practise'], ['community.html','community'], ['my-learning.html','progress'] ];
    $$('.nav-link, .mobile-nav a').forEach(link => {
      const href = link.getAttribute('href') || '';
      const key = href.includes('learn.html') ? 'learn' : href.includes('practise.html') ? 'practise' : href.includes('community.html') ? 'community' : href.includes('my-learning.html') ? 'progress' : href.includes('index.html') ? 'home' : '';
      link.classList.toggle('active', key === active);
      if (key === active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    });
    const avatar = $('.avatar');
    if (avatar) avatar.textContent = (state.name || 'S').trim().charAt(0).toUpperCase();
    const title = document.querySelector('title');
    if (title) title.textContent = `${({home:'Home',learn:'Learn',practise:'Practise',community:'Community',progress:'My Learning'}[active] || 'Student Plug')} · Student Plug`;
  }
  function courseCard(c) {
    const progress = courseProgress(c.id);
    return `<article class="card course-card"><div class="course-top"><div class="course-icon">${c.icon || '📘'}</div><span class="tag">${escapeHTML(c.level)} level</span></div><div><div class="course-code">${escapeHTML(c.code)}</div><h3>${escapeHTML(c.title)}</h3><p>${escapeHTML(c.description)}</p></div><div class="card-foot"><span class="tag ${progress ? 'green':'blue'}">${progress}% explored</span><a class="text-link" href="${courseUrl(c.id)}">Open course →</a></div><div class="progress-track" aria-label="${progress}% complete"><div class="progress-fill" style="width:${progress}%"></div></div></article>`;
  }
  function topicRow(course, topic, index) {
    const done = state.completedTopics.includes(`${course.id}:${topic.id}`);
    return `<a class="list-row" href="${topicUrl(course.id, topic.id)}"><span class="list-icon">${done ? '✓' : String(index+1).padStart(2,'0')}</span><span class="list-content"><strong>${escapeHTML(topic.title)}</strong><small>${escapeHTML(topic.estimatedMinutes || 7)} min · ${done ? 'Completed' : 'Lesson and practice'}</small></span><span class="arrow">→</span></a>`;
  }
  async function homePage() {
    const chosen = courses.filter(c => state.selectedCourses.includes(c.id) && String(c.level) === String(state.level));
    const personalised = chosen.length ? chosen : recommendedCourses().slice(0,4);
    if (!chosen.length && personalised.length) state.selectedCourses = [...new Set([...(state.selectedCourses||[]), ...personalised.map(c=>c.id)])];
    let continueItem = null;
    for (const c of chosen) { try { const l = await getLesson(c); const t = l.topics.find(x => !state.completedTopics.includes(`${c.id}:${x.id}`)); if (t) { continueItem = {c,t}; break; } } catch (_) {} }
    const content = `<section class="hero"><span class="hero-chip">Your learning, one step at a time</span><h1>Make your learning count${state.name ? ', '+escapeHTML(state.name.split(' ')[0]) : ''}.</h1><p>Find your course materials, understand difficult topics, and practise with purpose — all in one place.</p><a class="btn btn-light" href="${continueItem ? topicUrl(continueItem.c.id,continueItem.t.id) : 'learn.html'}">${continueItem ? 'Continue learning →' : 'Explore your courses →'}</a></section>
      <label class="searchbar"><span aria-hidden="true">⌕</span><input id="global-search" type="search" placeholder="Search courses and topics…" aria-label="Search courses and topics"><span class="tag">Search</span></label>
      <section class="section"><div class="section-head"><div><h2>Continue learning</h2><p>Pick up where you left off.</p></div><a class="text-link" href="learn.html">All courses →</a></div>${continueItem ? `<a class="list-row" href="${topicUrl(continueItem.c.id,continueItem.t.id)}"><span class="list-icon">${continueItem.c.icon}</span><span class="list-content"><strong>${escapeHTML(continueItem.t.title)}</strong><small>${escapeHTML(continueItem.c.code)} · ${escapeHTML(continueItem.c.title)}</small></span><span class="arrow">→</span></a>` : `<div class="empty"><div class="empty-icon">🎉</div><h3>You're caught up</h3><p>Explore another course or practise a topic you have already studied.</p><a class="btn btn-secondary" href="learn.html">Explore courses</a></div>`}</section>
      <section class="section"><div class="section-head"><div><h2>Your courses</h2><p>A focused starting library, ready to explore.</p></div><a class="text-link" href="learn.html">Browse all →</a></div><div class="grid">${(personalised.length ? personalised : courses.slice(0,3)).map(courseCard).join('')}</div></section>
      <section class="section"><div class="section-head"><div><h2>Ready to practise?</h2><p>Check what you understand and review the explanations.</p></div></div><div class="card" style="display:flex;align-items:center;justify-content:space-between;gap:18px;flex-wrap:wrap"><div style="display:flex;align-items:center;gap:14px"><div class="course-icon" style="background:var(--soft-green)">✍️</div><div><h3>Quick practice</h3><p>Original questions with answer explanations.</p></div></div><a class="btn btn-primary" href="practise.html">Start a quiz →</a></div></section>
      <section class="section"><div class="section-head"><div><h2>Study resources</h2><p>Explore public catalogues and follow the original source.</p></div></div><div class="list">${resources.slice(0,2).map(r=>`<a class="list-row" href="${escapeHTML(r.url)}" target="_blank" rel="noopener noreferrer"><span class="list-icon">↗</span><span class="list-content"><strong>${escapeHTML(r.title)}</strong><small>${escapeHTML(r.description)}</small></span><span class="arrow">↗</span></a>`).join('')}</div></section>`;
    renderShell(content,'home'); bindSearch();
  }
  async function learnPage() {
    renderShell(`<div class="page-head"><div><p class="eyebrow">Learn</p><h1>Your courses</h1><p class="subhead">Showing courses matched to your ${escapeHTML(state.level)} level and study profile. Change your institution, programme, or level in Settings to personalise this list.</p></div></div><label class="searchbar"><span>⌕</span><input id="course-search" type="search" placeholder="Search by course code or title…" aria-label="Search courses"></label><div class="grid" id="course-grid">${recommendedCourses().map(courseCard).join('')}</div><div class="notice info" style="margin-top:22px">This is a starter catalogue. Course content is not a substitute for your current departmental course guide.</div>`,'learn');
    $('#course-search').addEventListener('input', e => { const q=e.target.value.toLowerCase(); $('#course-grid').innerHTML=recommendedCourses().filter(c=>`${c.code} ${c.title} ${c.category} ${c.level}`.toLowerCase().includes(q)).map(courseCard).join('') || `<div class="empty"><h3>No courses found</h3><p>Try a different course code or title.</p></div>`; });
  }
  async function coursePage() {
    const id = params.get('id') || 'cis-104'; const c = courseById(id);
    if (!c) { renderShell(`<div class="empty"><h3>Course not found</h3><p>This course isn't in the starter catalogue yet.</p><a class="btn btn-primary" href="learn.html">Browse courses</a></div>`,'learn'); return; }
    let lesson; try { lesson = await getLesson(c); } catch (_) { lesson = {topics:[]}; }
    const topics = lesson.topics || [];
    const saved = savedHas(c.id);
    const content = `<div class="breadcrumb"><a href="learn.html">Learn</a> / ${escapeHTML(c.code)}</div><div class="page-head"><div><p class="eyebrow">${escapeHTML(c.category)} · ${escapeHTML(c.level)} level</p><h1>${escapeHTML(c.title)}</h1><p class="subhead">${escapeHTML(c.description)}</p></div><button class="btn ${saved?'btn-green':'btn-secondary'}" id="save-course">${saved?'✓ Saved':'＋ Save course'}</button></div>
      <div class="stat-grid"><div class="stat"><div class="label">Topics</div><div class="number">${topics.length}</div><div class="label">In this demo course</div></div><div class="stat"><div class="label">Practice questions</div><div class="number">${topics.reduce((n,t)=>n+(t.practiceQuestions||[]).length,0)}</div><div class="label">Original questions</div></div><div class="stat"><div class="label">Progress</div><div class="number">${courseProgress(c.id)}%</div><div class="label">Topics completed</div></div></div>
      <section class="section"><div class="section-head"><div><h2>Course topics</h2><p>Learn a topic, then practise what you learned.</p></div></div><div class="list">${topics.map((t,i)=>topicRow(c,t,i)).join('') || `<div class="empty"><h3>Content is being prepared</h3><p>There are no published topics for this course yet.</p></div>`}</div></section>
      <section class="section"><div class="section-head"><div><h2>Past examination papers</h2><p>We only label papers as past questions when authenticity has been checked.</p></div></div><div class="notice info">${escapeHTML(c.pastQuestions.message)} The current catalogue does not contain a verified past paper for this course.</div></section>
      <section class="section"><div class="section-head"><div><h2>Source and content notes</h2></div></div><div class="list">${(c.sourceReferences||[]).map(s=>`<a class="list-row" href="${escapeHTML(s.url)}" target="_blank" rel="noopener noreferrer"><span class="list-icon">↗</span><span class="list-content"><strong>${escapeHTML(s.title)}</strong><small>${escapeHTML(s.note)}</small></span><span class="arrow">↗</span></a>`).join('')}</div><p class="helper" style="margin-top:12px">Content status: ${escapeHTML(c.contentStatus)}. Check the current course outline; draft content may need subject review.</p></section>`;
    renderShell(content,'learn'); $('#save-course').addEventListener('click',()=>{ if(savedHas(c.id)) state.saved=state.saved.filter(x=>x!==c.id); else state.saved.push(c.id); saveState(); toast(savedHas(c.id)?'Course saved.':'Course removed from saved.'); coursePage(); });
  }
  async function topicPage() {
    const id = params.get('course') || 'cis-104'; const topicId = params.get('topic'); const c=courseById(id);
    if(!c){renderShell(`<div class="empty"><h3>Course not found</h3><a class="btn btn-primary" href="learn.html">Browse courses</a></div>`,'learn');return;}
    let lesson; try{lesson=await getLesson(c);}catch(_){lesson={topics:[]};}
    const t=(lesson.topics||[]).find(x=>x.id===topicId) || (lesson.topics||[])[0];
    if(!t){renderShell(`<div class="empty"><h3>Topic not found</h3><a class="btn btn-primary" href="${courseUrl(c.id)}">Back to course</a></div>`,'learn');return;}
    const done=state.completedTopics.includes(`${c.id}:${t.id}`);
    let sections='';
    (t.sections||[]).forEach(s=>{sections+=`<h2>${escapeHTML(s.heading)}</h2>`; (s.paragraphs||[]).forEach(p=>sections+=`<p>${escapeHTML(p)}</p>`); if(s.bullets) sections+=`<ul>${s.bullets.map(b=>`<li>${escapeHTML(b)}</li>`).join('')}</ul>`;});
    const content=`<div class="breadcrumb"><a href="learn.html">Learn</a> / <a href="${courseUrl(c.id)}">${escapeHTML(c.code)}</a> / ${escapeHTML(t.title)}</div><div class="page-head"><div><p class="eyebrow">${escapeHTML(c.code)} · ${t.estimatedMinutes||7} minute lesson</p><h1>${escapeHTML(t.title)}</h1><p class="subhead">${escapeHTML(t.description)}</p></div><span class="tag ${done?'green':'blue'}">${done?'✓ Completed':'Lesson'}</span></div><article class="card topic-content">${sections}${(t.keyTerms||[]).length?`<h2>Key terms</h2>${t.keyTerms.map(k=>`<div class="definition"><strong>${escapeHTML(k.term)}</strong>${escapeHTML(k.definition)}</div>`).join('')}`:''}${(t.examples||[]).map(ex=>`<h2>${escapeHTML(ex.title)}</h2><ol>${ex.steps.map(s=>`<li>${escapeHTML(s)}</li>`).join('')}</ol><p class="helper">${escapeHTML(ex.note||'')}</p>`).join('')}</article><section class="section"><div class="section-head"><div><h2>Check your understanding</h2><p>Try original practice questions for this topic.</p></div></div><a class="card list-row" href="practise.html?course=${encodeURIComponent(c.id)}&topic=${encodeURIComponent(t.id)}"><span class="list-icon">✍️</span><span class="list-content"><strong>Practise: ${escapeHTML(t.title)}</strong><small>${(t.practiceQuestions||[]).length} original questions · answers explained</small></span><span class="arrow">→</span></a></section><div class="practice-actions"><a class="btn btn-quiet" href="${courseUrl(c.id)}">← Course topics</a><button class="btn ${done?'btn-green':'btn-primary'}" id="mark-done">${done?'✓ Marked complete':'Mark lesson complete'}</button></div><p class="helper" style="margin-top:12px">${escapeHTML(lesson.reviewStatus||'')} · This is learning support, not an official course handout.</p>`;
    renderShell(content,'learn'); $('#mark-done').addEventListener('click',()=>{const key=`${c.id}:${t.id}`; if(!state.completedTopics.includes(key))state.completedTopics.push(key);saveState();toast('Lesson marked complete.');topicPage();});
  }
  async function practisePage() {
    const wantedCourse=params.get('course'); const wantedTopic=params.get('topic');
    const selectedCourses=wantedCourse?courses.filter(c=>c.id===wantedCourse):courses.filter(c=>state.selectedCourses.includes(c.id));
    const pool=[];
    for(const c of (selectedCourses.length?selectedCourses:courses)){try{const l=await getLesson(c);for(const t of l.topics||[]){if(wantedTopic&&t.id!==wantedTopic)continue;for(const q of t.practiceQuestions||[])pool.push({...q,courseId:c.id,courseCode:c.code,courseTitle:c.title,topicId:t.id,topicTitle:t.title});}}catch(_){}}
    if(!pool.length){renderShell(`<div class="page-head"><div><p class="eyebrow">Practise</p><h1>Test your understanding</h1></div></div><div class="empty"><div class="empty-icon">✍️</div><h3>No questions available for this selection yet</h3><p>Choose another course or topic. We won't invent past examination papers to fill the gap.</p><a class="btn btn-primary" href="learn.html">Explore courses</a></div>`,'practise');return;}
    let current=0,answers={},submitted=false;
    function draw(){const q=pool[current]; const chosen=answers[current]; const explanation=submitted?`<div class="feedback ${chosen===q.answerIndex?'correct':'incorrect'}"><strong>${chosen===q.answerIndex?'Correct.':'Not quite.'}</strong> ${escapeHTML(q.explanation)}</div>`:'';
      renderShell(`<div class="page-head"><div><p class="eyebrow">Practise</p><h1>Test your understanding</h1><p class="subhead">These are original practice questions, not verified past examination questions.</p></div></div><div class="card question"><div class="question-meta"><span>${escapeHTML(q.courseCode)} · ${escapeHTML(q.topicTitle)}</span><span>Question ${current+1} of ${pool.length}</span></div><div class="progress-track" style="margin-bottom:22px"><div class="progress-fill" style="width:${(current+1)/pool.length*100}%"></div></div><h2>${escapeHTML(q.prompt)}</h2><div class="answers">${q.options.map((opt,i)=>`<button class="answer-option ${chosen===i?'selected':''} ${submitted&&i===q.answerIndex?'correct':''} ${submitted&&chosen===i&&chosen!==q.answerIndex?'incorrect':''}" data-answer="${i}" ${submitted?'disabled':''}><span class="option-letter">${String.fromCharCode(65+i)}</span><span>${escapeHTML(opt)}</span></button>`).join('')}</div>${explanation}<div class="practice-actions">${current>0?'<button class="btn btn-quiet" id="prev">← Previous</button>':'<a class="btn btn-quiet" href="learn.html">Exit practice</a>'}${!submitted?'<button class="btn btn-primary" id="check" '+(chosen===undefined?'disabled':'')+'>Check answer</button>':`<button class="btn btn-primary" id="next">${current===pool.length-1?'Finish practice':'Next question →'}</button>`}</div></div>`,'practise');
      $$('[data-answer]').forEach(b=>b.addEventListener('click',()=>{answers[current]=Number(b.dataset.answer);draw();}));
      const check=$('#check');if(check)check.addEventListener('click',()=>{submitted=true;draw();});
      const prev=$('#prev');if(prev)prev.addEventListener('click',()=>{current--;submitted=answers[current]!==undefined&&state.practiceHistory.some(x=>x.questionId===pool[current].id&&x.answerIndex===answers[current]);draw();});
      const next=$('#next');if(next)next.addEventListener('click',()=>{if(current<pool.length-1){current++;submitted=false;draw();}else finish();});
    }
    function finish(){const score=pool.reduce((n,q,i)=>n+(answers[i]===q.answerIndex?1:0),0);const entry={date:new Date().toISOString(),score,total:pool.length,courseId:wantedCourse||null};state.practiceHistory.unshift(entry);state.practiceHistory=state.practiceHistory.slice(0,40);saveState();renderShell(`<div class="empty"><div class="empty-icon">🎯</div><p class="eyebrow">Practice complete</p><h1>${score} / ${pool.length}</h1><p>You answered ${Math.round(score/pool.length*100)}% correctly. Use the explanations to decide what to review next.</p><div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap"><a class="btn btn-primary" href="practise.html">Practise again</a><a class="btn btn-secondary" href="my-learning.html">View my learning</a></div></div>`,'practise');}
    draw();
  }
  async function communityPage(){
    let posts=[],remote=false,error='';
    if(window.StudentPlugAPI&&StudentPlugAPI.isConfigured()) {try{posts=await StudentPlugAPI.listCommunity();remote=true;}catch(e){error=e.message;}}
    if(!remote){try{posts=JSON.parse(localStorage.getItem('studentPlug.community')||'[]');}catch(_){posts=[];}}
    posts=[...posts,...state.communityDrafts].sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
    const content=`<div class="page-head"><div><p class="eyebrow">Community</p><h1>Learn together</h1><p class="subhead">Ask course-related questions and share explanations. Keep personal information out of posts.</p></div></div>${!StudentPlugAPI.isConfigured()?'<div class="notice info" style="margin-bottom:18px">Community is in local demo mode. Add your Hollow project ID in <code>api.js</code> and create the community endpoint to share posts across devices.</div>':''}${error?`<div class="notice" style="margin-bottom:18px">Hollow could not load posts: ${escapeHTML(error)}. Showing locally saved posts where available.</div>`:''}<div class="grid two" style="align-items:start"><section class="card"><h3>Ask the community</h3><p style="margin-bottom:18px">Ask a specific question so other students can understand what you need.</p><form id="post-form" class="form"><div class="field"><label for="post-course">Course</label><select id="post-course" required>${courses.map(c=>`<option value="${c.id}">${escapeHTML(c.code)} — ${escapeHTML(c.title)}</option>`).join('')}</select></div><div class="field"><label for="post-title">Question title</label><input id="post-title" maxlength="100" required placeholder="e.g. Can someone explain algorithms?"></div><div class="field"><label for="post-body">Details</label><textarea id="post-body" maxlength="1500" required placeholder="What have you tried? Where are you stuck?"></textarea><span class="helper">Don't include phone numbers, private records, or personal information.</span></div><div class="field"><label for="post-name">Display name (optional)</label><input id="post-name" maxlength="40" placeholder="Student"></div><button class="btn btn-primary" type="submit">Post question</button></form></section><section><div class="section-head"><div><h2>Recent questions</h2><p>${remote?'Loaded from Hollow':'This browser’s demo posts'}</p></div><button class="btn btn-quiet btn-small" id="refresh-posts">Refresh</button></div><div class="list">${posts.length?posts.map(p=>`<article class="card"><div class="course-code">${escapeHTML(p.courseCode||courseById(p.courseId)?.code||'COURSE')}</div><h3 style="margin-top:6px">${escapeHTML(p.title||'Question')}</h3><p class="community-post" style="margin-top:9px">${escapeHTML(p.body||'')}</p><div class="card-foot"><span class="helper">${escapeHTML(p.displayName||'Student')} · ${p.createdAt?new Date(p.createdAt).toLocaleDateString():'Saved locally'}</span></div></article>`).join(''):`<div class="empty"><div class="empty-icon">💬</div><h3>Start the conversation</h3><p>There are no questions here yet. Be the first to ask something useful.</p></div>`}</div></section></div>`;
    renderShell(content,'community');
    $('#refresh-posts').addEventListener('click',()=>communityPage());
    $('#post-form').addEventListener('submit',async e=>{e.preventDefault();const c=courseById($('#post-course').value);const post={id:`post-${Date.now()}`,courseId:c.id,courseCode:c.code,title:$('#post-title').value.trim(),body:$('#post-body').value.trim(),displayName:$('#post-name').value.trim()||'Student',createdAt:new Date().toISOString()};if(!post.title||!post.body)return;
      if(StudentPlugAPI.isConfigured()){try{await StudentPlugAPI.createCommunityPost(post);toast('Question posted to the community.');communityPage();return;}catch(err){toast(`Could not post to Hollow: ${err.message}`);}}
      try{const local=JSON.parse(localStorage.getItem('studentPlug.community')||'[]');local.unshift(post);localStorage.setItem('studentPlug.community',JSON.stringify(local.slice(0,50)));}catch(_){state.communityDrafts.unshift(post);saveState();}
      toast('Question saved on this device.');communityPage();
    });
  }
  async function progressPage(){
    const allTopics=[];for(const c of courses){try{const l=await getLesson(c);(l.topics||[]).forEach(t=>allTopics.push({course:c,topic:t}));}catch(_){}}
    const completed=allTopics.filter(x=>state.completedTopics.includes(`${x.course.id}:${x.topic.id}`));const questionCount=state.practiceHistory.reduce((n,x)=>n+(x.total||0),0);const avg=state.practiceHistory.length?Math.round(state.practiceHistory.reduce((n,x)=>n+(x.score/(x.total||1)),0)/state.practiceHistory.length*100):0;
    const content=`<div class="page-head"><div><p class="eyebrow">My Learning</p><h1>Your progress, at a glance</h1><p class="subhead">Your completed lessons and practice results, synced when the Hollow progress endpoint is available.</p></div></div><div class="stat-grid"><div class="stat"><div class="label">Lessons completed</div><div class="number">${completed.length}</div><div class="label">Of ${allTopics.length} demo topics</div></div><div class="stat"><div class="label">Practice sessions</div><div class="number">${state.practiceHistory.length}</div><div class="label">Synced when configured</div></div><div class="stat"><div class="label">Average practice score</div><div class="number">${avg}%</div><div class="label">Across saved sessions</div></div></div><section class="section"><div class="section-head"><div><h2>Course progress</h2><p>Complete a topic to see your progress update.</p></div></div><div class="list">${courses.map(c=>`<div class="card"><div class="course-top"><div><div class="course-code">${escapeHTML(c.code)}</div><h3>${escapeHTML(c.title)}</h3></div><span class="tag green">${courseProgress(c.id)}%</span></div><div class="progress-track" style="margin-top:14px"><div class="progress-fill" style="width:${courseProgress(c.id)}%"></div></div></div>`).join('')}</div></section><section class="section"><div class="section-head"><div><h2>Recent practice</h2><p>${questionCount} questions attempted in recorded sessions.</p></div></div>${state.practiceHistory.length?`<div class="list">${state.practiceHistory.slice(0,8).map(h=>`<div class="list-row"><span class="list-icon">✓</span><span class="list-content"><strong>${h.score} / ${h.total} correct</strong><small>${new Date(h.date).toLocaleString()}</small></span><span class="tag">${Math.round(h.score/(h.total||1)*100)}%</span></div>`).join('')}</div>`:`<div class="empty"><div class="empty-icon">📈</div><h3>Your learning history starts here</h3><p>Complete a lesson or practice session and you'll see it here.</p><a class="btn btn-primary" href="practise.html">Try practice</a></div>`}</section><section class="section"><div class="section-head"><div><h2>Saved resources</h2><p>Courses you've bookmarked.</p></div></div>${state.saved.length?`<div class="list">${state.saved.map(id=>courseById(id)).filter(Boolean).map(c=>`<a class="list-row" href="${courseUrl(c.id)}"><span class="list-icon">${c.icon}</span><span class="list-content"><strong>${escapeHTML(c.title)}</strong><small>${escapeHTML(c.code)}</small></span><span class="arrow">→</span></a>`).join('')}</div>`:`<p class="subhead">You haven't saved anything yet. Open a course and choose Save course.</p>`}</section>`;
    renderShell(content,'progress');
  }
  function settingsPage(){
    const content=`<div class="page-head"><div><p class="eyebrow">Settings</p><h1>Your learning space</h1><p class="subhead">Personalise this browser's Student Plug experience.</p></div></div><section class="card"><h2 style="margin-top:0">Your details</h2><form id="settings-form" class="form"><div class="field"><label for="name">Display name</label><input id="name" maxlength="60" value="${escapeHTML(state.name)}" placeholder="What should we call you?"></div><div class="field"><label for="institution">Institution</label><select id="institution">${institutions.map(i=>`<option value="${i.id}" ${state.institutionId===i.id?'selected':''}>${escapeHTML(i.name)}</option>`).join('')}</select></div><div class="field"><label for="department">Department / programme</label><select id="department">${departmentsForInstitution(state.institutionId).map(d=>`<option value="${d.id}" ${state.departmentId===d.id?'selected':''}>${escapeHTML(d.name)}</option>`).join('')}</select></div><div class="field"><label for="level">Current level</label><select id="level">${['100','200','300','400','500','ND1','ND2','HND1','HND2','Other'].map(l=>`<option ${state.level===l?'selected':''}>${l}</option>`).join('')}</select></div><button class="btn btn-primary" type="submit">Save preferences</button></form></section><section class="card section"><h2 style="margin-top:0">Appearance</h2><div class="setting-row"><div><strong>Dark mode</strong><p>Switch to a darker colour scheme for this device.</p></div><button class="btn btn-secondary" id="theme-toggle">${state.theme==='dark'?'Turn off':'Turn on'}</button></div></section><section class="card section"><h2 style="margin-top:0">Data and privacy</h2><p>Progress is stored on this device and synced to the Hollow <code>student-progress</code> endpoint when it exists. That collection uses an opaque browser/account key and excludes your email, name, and password; Hollow dynamic endpoints are public unless separately protected, so do not store sensitive data there.</p><div class="setting-row"><div><strong>Hollow sync status</strong><p id="sync-status">Checking the last sync…</p></div><button class="btn btn-secondary" id="sync-now">Sync now</button></div><div class="setting-row"><div><strong>Account</strong><p>${localStorage.getItem('studentPlug.session')?'Signed in':'Using guest access'}</p></div>${localStorage.getItem('studentPlug.session')?'<button class="btn btn-quiet" id="sign-out">Sign out</button>':'<a class="btn btn-secondary" href="account.html">Sign in</a>'}</div><div class="setting-row"><div><strong>Export local data</strong><p>Download your current local preferences and progress as JSON.</p></div><button class="btn btn-secondary" id="export-data">Export</button></div><div class="setting-row"><div><strong>Reset local progress</strong><p>Clear saved progress and preferences from this browser.</p></div><button class="btn btn-quiet" id="reset-data">Reset</button></div></section>`;
    renderShell(content,'');
    const syncStatus = $('#sync-status');
    if (syncStatus) {
      const last = localStorage.getItem('studentPlug.lastSync');
      const syncError = localStorage.getItem('studentPlug.syncError');
      syncStatus.textContent = syncError ? `Not synced: ${syncError}` : last ? `Last synced ${new Date(last).toLocaleString()}` : 'Not synced yet. Ensure student-progress exists in Hollow.';
    }
    const syncNow = $('#sync-now');
    if (syncNow) syncNow.addEventListener('click', async () => {
      syncNow.disabled = true; syncNow.textContent = 'Syncing…';
      try { await StudentPlugAPI.saveProgress(progressPayload()); localStorage.setItem('studentPlug.lastSync', new Date().toISOString()); localStorage.setItem('studentPlug.syncError',''); toast('Progress synced to Hollow.'); }
      catch (err) { localStorage.setItem('studentPlug.syncError', err.message); toast(`Sync failed: ${err.message}`); }
      settingsPage();
    });
    const signOut = $('#sign-out');
    if (signOut) signOut.addEventListener('click', () => { if (confirm('Sign out of this account on this device? Local progress remains here.')) { localStorage.removeItem('studentPlug.session'); localStorage.removeItem('studentPlug.user'); localStorage.setItem('studentPlug.userKey', `guest_${Date.now()}_${Math.random().toString(36).slice(2)}`); toast('Signed out.'); settingsPage(); } });
    $('#institution').addEventListener('change',e=>refreshDepartmentSelect($('#department'),e.target.value,''));
    $('#settings-form').addEventListener('submit',async e=>{e.preventDefault();state.name=$('#name').value.trim();state.institutionId=$('#institution').value;state.departmentId=$('#department').value;state.level=$('#level').value;saveState();if(localStorage.getItem('studentPlug.session')){try{await StudentPlugAPI.updateMe({name:state.name,institutionId:state.institutionId,departmentId:state.departmentId,level:state.level,semester:state.semester,studyGoal:state.studyGoal});toast('Preferences saved to your account.');}catch(err){toast(`Saved on this device; account profile sync failed: ${err.message}`);} }else{toast('Preferences saved on this device.');}});
    $('#theme-toggle').addEventListener('click',()=>{state.theme=state.theme==='dark'?'light':'dark';saveState();applyTheme();settingsPage();});
    $('#export-data').addEventListener('click',()=>{const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='student-plug-local-data.json';a.click();URL.revokeObjectURL(url);});
    $('#reset-data').addEventListener('click',()=>{if(confirm('Reset saved courses, progress, and preferences on this browser? This cannot be undone.')){localStorage.removeItem(KEY);location.href='index.html';}});
  }
  function bindSearch(){const input=$('#global-search');if(!input)return;input.addEventListener('keydown',e=>{if(e.key==='Enter'){const q=input.value.toLowerCase().trim();const c=courses.find(x=>`${x.code} ${x.title}`.toLowerCase().includes(q));if(c)location.href=courseUrl(c.id);else location.href=`learn.html?q=${encodeURIComponent(q)}`;}});}
  function applyTheme(){document.body.classList.toggle('dark',state.theme==='dark');}
  function onboardingPage(){
    const content = `<div class="onboarding-wrap"><div class="onboarding-brand"><span class="brand-mark">sp</span><span><strong>Student Plug</strong><small>Your campus learning hub</small></span></div><div class="onboarding-progress"><span></span></div><div class="onboarding-intro"><p class="eyebrow">Let's set up your study space</p><h1>Make university feel a little more manageable.</h1><p>Choose your study details so we can put relevant courses, explanations and practice in front of you.</p></div><form id="onboarding-form" class="card form onboarding-form"><div class="field"><label for="onboard-name">What should we call you?</label><input id="onboard-name" required maxlength="60" autocomplete="given-name" value="${escapeHTML(state.name)}" placeholder="Your name"></div><div class="field"><label for="onboard-email">Email <span class="helper">(optional for guest mode)</span></label><input id="onboard-email" type="email" autocomplete="email" value="${escapeHTML(state.email)}" placeholder="you@example.com"></div><div class="field"><label for="onboard-institution">Institution</label><select id="onboard-institution" required>${institutions.map(i=>`<option value="${i.id}" ${state.institutionId===i.id?'selected':''}>${escapeHTML(i.name)}</option>`).join('')}</select></div><div class="field"><label for="onboard-department">Department or programme</label><select id="onboard-department" required>${departmentsForInstitution(state.institutionId).map(d=>`<option value="${d.id}" ${state.departmentId===d.id?'selected':''}>${escapeHTML(d.name)}</option>`).join('')}</select></div><div class="field"><label for="onboard-level">Current level</label><select id="onboard-level">${['100','200','300','400','500','ND1','ND2','HND1','HND2'].map(l=>`<option value="${l}" ${state.level===l?'selected':''}>${l} level</option>`).join('')}</select><span class="helper">Your level changes the depth of explanations and the courses we recommend.</span></div><div class="field"><label for="onboard-semester">Current semester</label><select id="onboard-semester"><option value="first" ${state.semester==='first'?'selected':''}>First semester</option><option value="second" ${state.semester==='second'?'selected':''}>Second semester</option><option value="both" ${(!state.semester||state.semester==='both')?'selected':''}>Show both / not sure yet</option></select></div><div class="field"><label for="onboard-goal">What's your main goal?</label><select id="onboard-goal"><option value="understand-courses" ${state.studyGoal==='understand-courses'?'selected':''}>Understand difficult course topics</option><option value="prepare-exams" ${state.studyGoal==='prepare-exams'?'selected':''}>Prepare for tests and exams</option><option value="find-materials" ${state.studyGoal==='find-materials'?'selected':''}>Find reliable study materials</option><option value="study-together" ${state.studyGoal==='study-together'?'selected':''}>Learn with other students</option></select></div><div class="onboarding-actions"><button class="btn btn-primary" type="submit">Set up my study space <span aria-hidden="true">→</span></button><a class="text-link" href="account.html">I already have an account</a></div><p class="helper">You can update these details later. Guest progress stays on this device and can sync using an opaque key when the Hollow progress endpoint is configured.</p></form></div>`;
    renderShell(content,'');
    $('#onboard-institution').addEventListener('change',e=>{refreshDepartmentSelect($('#onboard-department'),e.target.value,'');});
    $('#onboarding-form').addEventListener('submit',e=>{e.preventDefault();state.name=$('#onboard-name').value.trim();state.email=$('#onboard-email').value.trim();state.institutionId=$('#onboard-institution').value;state.departmentId=$('#onboard-department').value;state.level=$('#onboard-level').value;state.semester=$('#onboard-semester').value;state.studyGoal=$('#onboard-goal').value;state.selectedCourses=recommendedCourses().map(c=>c.id).slice(0,8);state.onboardingComplete=true;saveState();location.href='index.html';});
  }
  function accountPage(){
    const content=`<div class="account-wrap"><a class="brand account-brand" href="onboarding.html"><span class="brand-mark">sp</span><span>Student Plug<small>Your campus learning hub</small></span></a><section class="card account-card"><a class="breadcrumb" href="onboarding.html">← Back to setup</a><p class="eyebrow">Your account</p><h1>Welcome back.</h1><p class="subhead">Sign in or create an account to keep your learning connected across devices.</p><div class="auth-tabs"><button class="auth-tab active" data-auth-mode="signup" type="button">Create account</button><button class="auth-tab" data-auth-mode="login" type="button">Sign in</button></div><form id="account-form" class="form"><div class="field" id="account-name-field"><label for="account-name">Full name</label><input id="account-name" autocomplete="name" maxlength="60" placeholder="Your full name"></div><div class="field"><label for="account-email">Email address</label><input id="account-email" type="email" required autocomplete="email" value="${escapeHTML(state.email)}" placeholder="you@example.com"></div><div class="field"><label for="account-password">Password</label><input id="account-password" type="password" required minlength="8" autocomplete="new-password" placeholder="At least 8 characters"><span class="helper">Use a password you don't use elsewhere.</span></div><div id="account-message" class="notice info" role="status">MVP mode: account records use the Hollow users CRUD collection. Do not use a real or reused password; this prototype does not provide production-grade account privacy.</div><button class="btn btn-primary" id="account-submit" type="submit">Create account</button></form><div class="account-divider"><span>or</span></div><a class="btn btn-secondary" href="onboarding.html">Continue as guest</a><p class="helper" style="margin-top:15px">MVP accounts are stored through Hollow's ordinary users CRUD collection. This is a prototype: the collection may be publicly readable, and the browser-generated session is not server-verified. Use a unique test password only.</p></section></div>`;
    renderShell(content,'');let mode='signup';
    const update=()=>{ $$('.auth-tab').forEach(b=>b.classList.toggle('active',b.dataset.authMode===mode));$('#account-name-field').classList.toggle('hidden',mode==='login');$('#account-password').autocomplete=mode==='login'?'current-password':'new-password';$('#account-submit').textContent=mode==='login'?'Sign in':'Create account';};
    $$('.auth-tab').forEach(b=>b.addEventListener('click',()=>{mode=b.dataset.authMode;update();}));
    $('#account-form').addEventListener('submit',async e=>{e.preventDefault();const msg=$('#account-message');msg.className='notice';msg.textContent='Checking the account service…';try{if(!window.StudentPlugAPI)throw new Error('The account service is unavailable.');const result=mode==='signup'?await StudentPlugAPI.signUp({name:$('#account-name').value.trim(),email:$('#account-email').value.trim(),password:$('#account-password').value,institutionId:state.institutionId,departmentId:state.departmentId,level:state.level,semester:state.semester,studyGoal:state.studyGoal}):await StudentPlugAPI.signIn({email:$('#account-email').value.trim(),password:$('#account-password').value});if(!result||!result.token)throw new Error('The service did not return a session token. Account setup is not complete.');localStorage.setItem('studentPlug.session',result.token);if(result.user){localStorage.setItem('studentPlug.user',JSON.stringify({id:result.user.id||result.user._id||'',email:result.user.email||$('#account-email').value.trim(),name:result.user.name||$('#account-name').value.trim()}));localStorage.setItem('studentPlug.userKey',`account_${result.user.id||result.user._id||result.user.email}`);}state.name=result.user?.name||$('#account-name').value.trim()||state.name;state.email=$('#account-email').value.trim();state.onboardingComplete=true;saveState();location.href='index.html';}catch(err){msg.className='notice';msg.textContent=`${err.message} You can continue as a guest for now.`;}});update();
  }
  async function init(){
    applyTheme();
    if(page==='onboarding'||page==='account'){
      try{await loadData();}catch(_){}
      if(page==='onboarding')onboardingPage();else accountPage();
      return;
    }
    if(!state.onboardingComplete){location.replace('onboarding.html');return;}
    try{await loadData(); await restoreAuthenticatedProfile(); await restoreRemoteProgress(); await Promise.all([...new Map(recommendedCourses().map(c=>[c.lessonFile,c])).values()].slice(0,18).map(c => getLesson(c).catch(() => null))); }catch(error){app.innerHTML=`<main><div class="empty"><h2>Student Plug couldn't load its course data</h2><p>Run this app through a local web server or deploy it to HTTPS. Opening HTML directly as a file can prevent JSON fetches.</p><p class="helper">${escapeHTML(error.message)}</p></div></main>`;return;}
    if(page==='home')await homePage();else if(page==='learn')await learnPage();else if(page==='course')await coursePage();else if(page==='topic')await topicPage();else if(page==='practise')await practisePage();else if(page==='community')await communityPage();else if(page==='progress')await progressPage();else if(page==='settings')settingsPage();else await homePage();
    applyTheme();
    if('serviceWorker' in navigator && (location.protocol==='https:' || location.hostname==='localhost')) navigator.serviceWorker.register('sw.js').catch(()=>{});
  }
  init();
})();
