# Student Plug — expanded academic learning build

## Run locally
Serve this directory over HTTP (for example `python -m http.server 8080`) and open `http://localhost:8080`.

## Content standard
The lessons now contain topic-specific explanatory notes, learning objectives, structured methods, worked applications, common errors, key terms, and original retrieval/application questions. Depth changes by academic level: 100-level lessons establish core definitions and guided application; 200-level lessons emphasise methods and comparison; 300-level lessons add assumptions, analysis, and interpretation; 400-level lessons require justification, evidence evaluation, alternatives, and limitations.

These are **original Student Plug teaching notes, not official university notes**. They have not been approved by UNILAG, UI, UNN, OAU, or any department. Codes and semester mapping are illustrative until checked against current departmental handbooks. The questions are original practice questions, not verified past papers. Before public academic launch, have subject specialists review accuracy, calculations, clinical content, references, and syllabus alignment.

## Institution personalisation
The catalogue includes UNILAG, UI, UNN, OAU, and Other. Student profile fields include institution, programme/department, level, semester, and study goals. Catalogue aliases that share a lesson file are not unique institution-authored course packs.

## Hollow configuration
Project: `https://hollow-3mbn.onrender.com/proj_7263khydhi`
See `hollow-setup.json` for endpoint names and schema fields. The client uses one `api.js` adapter, following the same centralised integration style used in ClearWords. It is configured for `profiles`, `progress`, `practice-attempts`, `saved-courses`, `community-posts`, and `resource-submissions`, with expected auth routes `auth/signup`, `auth/login`, and `auth/me`.

**MVP account mode:** account creation, sign-in, and profile updates use the ordinary Hollow `users` CRUD endpoint, as requested. Create `/users` alongside `/profiles`, `/progress`, `/practice-attempts`, `/saved-courses`, `/community-posts`, `/resource-submissions`, and `/notifications`. The browser never sends plaintext passwords to Hollow; it derives a salted PBKDF2-SHA256 hash. However, this is still prototype-only: if `/users` is publicly readable, email/profile data and password hashes can be read, and the browser session marker is not server-verified. Use only test accounts and unique test passwords. Do not use real/reused passwords or sensitive data. This does not provide production-grade authentication or per-user data privacy.

## Integration validation
The package includes a static validation report in `BUILD-REPORT.json`. Syntax and JSON/relationship checks are local checks; they do not prove that live Hollow endpoints, sign-in, or all browser interactions work in production.
