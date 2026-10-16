const CACHE_NAME = 'student-plug-shell-v3';
const APP_SHELL = [
  "./",
  "./index.html",
  "./learn.html",
  "./course.html",
  "./topic.html",
  "./practise.html",
  "./community.html",
  "./my-learning.html",
  "./settings.html",
  "./onboarding.html",
  "./account.html",
  "./styles.css",
  "./app.js",
  "./api.js",
  "./manifest.json",
  "./assets/icons/icon.svg",
  "./hollow-setup.json",
  "./data/institutions.json",
  "./data/departments.json",
  "./data/courses.json",
  "./data/resources.json",
  "./data/lessons/acc-101.json",
  "./data/lessons/acc-audit-301.json",
  "./data/lessons/acc-cost-201.json",
  "./data/lessons/acc-fin-401.json",
  "./data/lessons/bio-101.json",
  "./data/lessons/bus-101.json",
  "./data/lessons/bus-mkt-301.json",
  "./data/lessons/bus-org-201.json",
  "./data/lessons/bus-strat-401.json",
  "./data/lessons/chm-101.json",
  "./data/lessons/cis-103.json",
  "./data/lessons/cis-104.json",
  "./data/lessons/com-101.json",
  "./data/lessons/com-research-401.json",
  "./data/lessons/com-theory-201.json",
  "./data/lessons/cs-ai-401.json",
  "./data/lessons/cs-alg-201.json",
  "./data/lessons/cs-db-301.json",
  "./data/lessons/cs-dist-401.json",
  "./data/lessons/cs-net-301.json",
  "./data/lessons/cs-os-301.json",
  "./data/lessons/cs-project-401.json",
  "./data/lessons/cs-se-301.json",
  "./data/lessons/cs-sec-401.json",
  "./data/lessons/eco-101.json",
  "./data/lessons/eco-dev-401.json",
  "./data/lessons/eco-macro-301.json",
  "./data/lessons/eco-micro-201.json",
  "./data/lessons/eng-circuit-201.json",
  "./data/lessons/eng-control-301.json",
  "./data/lessons/eng-power-401.json",
  "./data/lessons/gst-101.json",
  "./data/lessons/gst-103.json",
  "./data/lessons/gst-research-201.json",
  "./data/lessons/ict-101.json",
  "./data/lessons/mth-101.json",
  "./data/lessons/nsg-217.json",
  "./data/lessons/nsg-community-401.json",
  "./data/lessons/nsg-research-301.json",
  "./data/lessons/phy-101.json",
  "./data/lessons/pol-101.json",
  "./data/lessons/pol-gov-401.json",
  "./data/lessons/pol-method-201.json",
  "./data/lessons/psy-101.json",
  "./data/lessons/psy-clin-401.json",
  "./data/lessons/psy-method-201.json",
  "./data/lessons/soc-101.json",
  "./data/lessons/soc-policy-401.json",
  "./data/lessons/soc-theory-201.json",
  "./data/lessons/sta-101.json",
  "./data/lessons/sta-data-401.json",
  "./data/lessons/sta-mult-301.json",
  "./data/lessons/sta-reg-201.json"
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('student-plug-') && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(caches.match(req).then(cached => cached || fetch(req).then(response => {
    if (response.ok) { const copy = response.clone(); caches.open(CACHE_NAME).then(cache => cache.put(req, copy)); }
    return response;
  }).catch(() => caches.match('./index.html'))));
});
