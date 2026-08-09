# Graph Report - .  (2026-08-08)

## Corpus Check
- 90 files · ~127,671 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 553 nodes · 1058 edges · 43 communities (34 shown, 9 thin omitted)
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 70 edges (avg confidence: 0.58)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6
- Community 7
- Community 8
- Community 9
- Community 10
- Community 11
- Community 12
- Community 13
- Community 14
- Community 15
- Community 16
- Community 17
- Community 18
- Community 19
- Community 20
- Community 21
- Community 22
- Community 23
- Community 24
- Community 25
- Community 26
- Community 27
- Community 28
- Community 29
- Community 30
- Community 31
- Community 32
- Community 41
- Community 42

## God Nodes (most connected - your core abstractions)
1. `p()` - 42 edges
2. `constructor()` - 30 edges
3. `_debug()` - 22 edges
4. `w()` - 19 edges
5. `_useSession()` - 18 edges
6. `_acquireLock()` - 17 edges
7. `_notifyAllSubscribers()` - 17 edges
8. `i()` - 15 edges
9. `initialize()` - 14 edges
10. `_saveSession()` - 13 edges

## Surprising Connections (you probably didn't know these)
- `#authLogin login modal / #loginForm (role tabs cliente/profesional, email+password)` --calls--> `Auth`  [EXTRACTED]
  index.html → scripts/01-auth.js
- `client-solicitud.html — single request detail view for a client, shows request info + received quotes list` --semantically_similar_to--> `pro-cotizar.html — single request detail + quote submission form (monto, descripción, plazo) for a professional`  [INFERRED] [semantically similar]
  client-solicitud.html → pro-cotizar.html
- `data-field=rubro chip-grid on solicitud-obra.html — 'Rubros afectados' category taxonomy (albanileria, plomeria, electricidad, gas, terminaciones, exteriores, limpieza-transporte, diseno-planificacion)` --semantically_similar_to--> `data-field=rubro chip-grid on solicitud-refaccion.html — same 8-value trade taxonomy`  [INFERRED] [semantically similar]
  solicitud-obra.html → solicitud-refaccion.html
- `#authRegister register modal / #registerForm (role tabs, pro-only fields: username, rubros, DNI, avatar, DNI photos, address)` --calls--> `Auth`  [EXTRACTED]
  index.html → scripts/01-auth.js
- `index.html — Brickø landing page (marketing sections + auth modals + theme toggle)` --calls--> `Auth`  [EXTRACTED]
  index.html → scripts/01-auth.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Shared 8-value trade rubro taxonomy (plomeria/gas/electricidad/albanileria/pintura/carpinteria/herreria/jardineria)** — pro_page_rubro_filter, properfil_rubros_chips, solicitud_refaccion_rubro_chips, index_reg_rubros_taxonomy [INFERRED 0.90]
- **Sequential Supabase RLS/security hardening migration series (documented in order in SupaBase/README.md)** — supabase_readme_fix_requests_rls, supabase_readme_dedupe_rls_policies, supabase_readme_protect_columns, supabase_readme_harden_functions_and_merge_policy [EXTRACTED 1.00]
- **Client-side request lifecycle flow: dashboard hub → list of obras → obra detail/quotes → new obra request** — client_page, mis_obras_page, client_solicitud_page, solicitud_obra_page [INFERRED 0.85]

## Communities (43 total, 9 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.03
Nodes (10): Ar(), delete(), _deleteFactor(), Er(), _isImplicitGrantCallback(), _isPKCECallback(), jr(), listUsers() (+2 more)

### Community 1 - "Community 1"
Cohesion: 0.08
Nodes (63): _acquireLock(), _autoRefreshTokenTick(), _callRefreshToken(), ce(), _challenge(), _challengeAndVerify(), createUser(), Ct() (+55 more)

### Community 2 - "Community 2"
Cohesion: 0.08
Nodes (45): a(), c(), copy(), Cr(), createBucket(), createSignedUploadUrl(), createSignedUrl(), createSignedUrls() (+37 more)

### Community 3 - "Community 3"
Cohesion: 0.06
Nodes (30): @capacitor/android, @capacitor/assets, @capacitor/cli, @capacitor/core, @capacitor/ios, graphify, author, bugs (+22 more)

### Community 4 - "Community 4"
Cohesion: 0.09
Nodes (20): Any, Bool, Capacitor, AppDelegate, UIScene, UISceneSession, UIWindow, SceneDelegate (+12 more)

### Community 5 - "Community 5"
Cohesion: 0.16
Nodes (22): escapeHTML(), fetchClientObras(), getSession(), handleAcceptQuote(), handleRejectQuote(), initToolbarEvents(), MODO_PAGO_LABELS, normalizeObra() (+14 more)

### Community 6 - "Community 6"
Cohesion: 0.10
Nodes (25): br(), cloneDeep(), constructor(), _handleTokenChanged(), _initRealtimeClient(), _initSupabaseAuthClient(), inPendingSyncState(), _isClosed() (+17 more)

### Community 7 - "Community 7"
Cohesion: 0.14
Nodes (23): client.html — client dashboard hub with two action cards: Mis Obras / Obra Nueva, client-solicitud.html — single request detail view for a client, shows request info + received quotes list, #authLogin login modal / #loginForm (role tabs cliente/profesional, email+password), #authRegister register modal / #registerForm (role tabs, pro-only fields: username, rubros, DNI, avatar, DNI photos, address), #authReset password reset modal / #resetForm, index.html — Brickø landing page (marketing sections + auth modals + theme toggle), #regRubrosSelect — 8-value rubro checkbox taxonomy (plomeria, gas, electricidad, albanileria, pintura, carpinteria, herreria, jardineria) for professional signup, mis-obras.html — client's list of requests/obras with search, status filters, sort (+15 more)

### Community 8 - "Community 8"
Cohesion: 0.14
Nodes (21): ALL_REQUESTS, cardHTML(), escapeHTML(), FILTERS, generateTitle(), getSession(), initEditProfileModal(), initFilters() (+13 more)

### Community 9 - "Community 9"
Cohesion: 0.13
Nodes (20): addFiles(), compressImage(), escapeHTML(), ETAPA_VALUES, getSession(), handleConfirmPublish(), handleFormSubmit(), initAddressMap() (+12 more)

### Community 10 - "Community 10"
Cohesion: 0.17
Nodes (18): acceptQuote(), escapeHTML(), generateTitle(), getSession(), loadQuotes(), loadRequest(), normalize(), quoteCardHTML() (+10 more)

### Community 11 - "Community 11"
Cohesion: 0.18
Nodes (19): cardHTML(), escapeHTML(), generateTitle(), getSession(), initActionCards(), initCursorGlow(), initDashboard(), initFilters() (+11 more)

### Community 12 - "Community 12"
Cohesion: 0.14
Nodes (14): escapeHTML(), generateTitle(), initForm(), loadRequest(), normalize(), renderDetail(), RUBRO_LABELS, showExistingQuote() (+6 more)

### Community 13 - "Community 13"
Cohesion: 0.18
Nodes (13): bindFile(), getSelectedRubros(), initFilePickers(), initLogout(), loadProfile(), pending, RUBRO_LABELS, save() (+5 more)

### Community 14 - "Community 14"
Cohesion: 0.22
Nodes (15): connectionState(), flushSendBuffer(), isConnected(), _isMember(), log(), _onConnClose(), _onConnError(), _onConnMessage() (+7 more)

### Community 15 - "Community 15"
Cohesion: 0.20
Nodes (14): _canPush(), disconnect(), _fetchWithTimeout(), _hasReceived(), _isJoined(), _isJoining(), _leaveOpenTopic(), receive() (+6 more)

### Community 16 - "Community 16"
Cohesion: 0.24
Nodes (13): Main flow: client registers → picks Refacción/Obra → request pending → pro quotes → client accepts (active), Session storage convention: bricko-session (full) and bricko-user (simple), set/cleared by 01-auth.js, Request status convention: pending/quoted/active/done/cancelled (English in DB, Spanish in UI), professionals table (id, rubro, years_experience, verified, rating, jobs_completed, bio), profiles table (id, first_name, last_name, phone, role, city), quotes table (id, request_id, pro_id, amount, description, features[], status, created_at), requests table (id, user_id, ticket_id, tipo, rubros[], titulo, descripcion, urgencia, direccion, status, etapa, tipo_construccion, superficie, created_at), dedupe_rls_policies migration — removes duplicate EN/ES RLS policies on profiles/professionals/quotes, unifies on (select auth.uid()), restricts professionals reads to authenticated users (+5 more)

### Community 17 - "Community 17"
Cohesion: 0.18
Nodes (12): _cancelRefEvent(), _cancelTimeout(), destroy(), _getPayloadRecords(), _joinRef(), _makeRef(), _matchReceive(), _onMessage() (+4 more)

### Community 18 - "Community 18"
Cohesion: 0.36
Nodes (4): ExampleInstrumentedTest, ExampleUnitTest, org.junit.runner.RunWith, org.junit.Test

### Community 19 - "Community 19"
Cohesion: 0.29
Nodes (5): { chromium }, fs, OUT, path, svgs

### Community 20 - "Community 20"
Cohesion: 0.40
Nodes (6): _appendParams(), at(), connect(), endpointURL(), match(), then()

### Community 21 - "Community 21"
Cohesion: 0.83
Nodes (3): gradlew script, die(), warn()

### Community 22 - "Community 22"
Cohesion: 0.50
Nodes (4): Mobile app icon/splash assets generated from the Brickø isometric cube logo, @capacitor/assets — generates native iOS/Android icon and splash sizes from source PNGs via `npx capacitor-assets generate` + `npx cap sync`, scripts/gen-app-icons.cjs — Node+Playwright/Chromium script that rasterizes source PNGs from the cube SVG, CapApp-SPM — Swift Package Manager dependency host package for the Capacitor iOS project (do not modify)

### Community 24 - "Community 24"
Cohesion: 0.67
Nodes (3): Brickø — construction services marketplace (Argentina), Stack: vanilla HTML/CSS/JS + Supabase (Auth+Postgres+RLS) + GitHub Pages + Hostinger DNS, Supabase production project wkyqetwyswocrohayiss

### Community 25 - "Community 25"
Cohesion: 1.00
Nodes (3): _binaryDecode(), decode(), _decodeBroadcast()

### Community 26 - "Community 26"
Cohesion: 0.67
Nodes (3): Cs(), Ps(), $s()

## Knowledge Gaps
- **69 isolated node(s):** `fs`, `path`, `{ chromium }`, `OUT`, `svgs` (+64 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Auth` connect `Community 7` to `Community 8`, `Community 11`, `Community 13`?**
  _High betweenness centrality (0.087) - this node is a cross-community bridge._
- **Why does `initLogout()` connect `Community 7` to `Community 5`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **Why does `initLogout()` connect `Community 7` to `Community 9`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **What connects `fs`, `path`, `{ chromium }` to the rest of the system?**
  _69 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.029850746268656716 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.08499743983614952 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.07575757575757576 - nodes in this community are weakly interconnected._