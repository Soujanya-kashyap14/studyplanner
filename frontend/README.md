# Orbit — study in your own universe

Orbit is an intelligent study planner and progress tracker. Each subject is a **constellation**, each topic is a **star**, and finishing a topic lights its star. The scheduler fits your topics into the hours you have available and **re-plans live** when you miss a session, finish early, drag a block, or tell it you're drained.

This folder is the **frontend**. By default it talks to the Express + MongoDB API in `../backend` (`VITE_USE_MOCK=false` in `.env.local`). Set `VITE_USE_MOCK=true` to run it entirely on in-browser mock data instead.

---

## Quick start

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

* **New here?** Register an account. You'll go through a 2-minute **guided setup** (subjects → topics → exams → study hours) and land on a ready-made plan.
* **Just exploring?** Click **"Explore the demo account"** (`demo@orbit.app` / `orbit123`), which comes pre-loaded with a sample universe.

## How the app flows

```
Register ─▶ Guided setup ─▶ Study Plan (first plan built automatically)
              1 Subjects       │
              2 Topics + hours │  daily: Dashboard ▸ Up next ▸ Focus ▸ Done / Can't make it
              3 Exams (opt.)   │  changes: miss / finish early / drag ▸ plan reflows ▸ "What changed"
              4 Study hours    ▼
                             Edit Subjects / Exams / Study hours ▸ "Plan out of date" ▸ Update plan
```

* The sidebar (icon + label, collapsible) is grouped in the same order: **Today** (Home, Study Plan) · **Set up** (Subjects & Topics → Exams & Deadlines → My Study Hours) · **Insights** (Progress, Achievements) · **Account** (Settings). Phones get a 5-item labelled bottom bar (Home, Plan, Focus, Subjects, More).
* **Home** answers "what should I do today?": one next-best-action, today's plan (Start / Done / Skip), deadlines · progress · streak, the constellation, a 3-line briefing, and more insights. Until setup is complete it shows a **Getting started** checklist instead.
* **Study Plan** opens on the Day list; Week/Month are tabs. Click a session for Start · Mark done · Skip · Reschedule. **Plan updates (n)** opens a drawer explaining every re-plan in plain language. Demo tools live behind a small *Demo* button and in Settings → Demo tools.
* Every change toast offers **Undo**; the avatar menu holds streak, energy check-in, theme, *How Orbit works* (4-step tour) and demo tools.
* Every page shows a **next-step banner** when something is missing, when the plan hasn't been built yet, or when it is out of date.
* **Settings → Your data** has *Start fresh* (wipe and re-run setup) and *Load sample data*.

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | Type-check (`tsc -b`) and production build to `dist/` |
| `npm run preview` | Serve the production build |
| `npm run typecheck` | TypeScript only |

### Configuration

Copy `.env.example` to `.env.local`:

```ini
VITE_USE_MOCK=true                          # false = call the real API
VITE_API_BASE_URL=http://localhost:8000/api
```

---

## Demo script (≈2 minutes)

1. **Dashboard**: the constellation hero. Hover a star to see topic, difficulty and deadline; click it to Focus, Start or Mark done. Amber pulsing stars are overdue or at risk. The sky brightens as overall progress rises.
2. **Mood check-in** pops up once a day. Pick *Drained*: today shrinks to 60%, hard topics move later, and the dialog explains why in plain language.
3. **Study Plan → Demo → "Miss next session"**: this is the **Living Schedule**. Blocks slide to new slots with a spring animation, touched blocks glow cyan, a toast summarises the change (e.g. *"Plan updated: 9 sessions moved, 1 at risk"*), and the **What changed** panel lists every move as *from → to → why*. Hover an entry to spotlight that block.
4. **"Fast-forward 1 day"** advances the app clock. Yesterday's unfinished sessions become missed and the plan reflows around them.
5. **Drag a block** to another day or time. It gets pinned there, its neighbours reflow, and you get a warning if it now lands after its deadline.
6. **Focus Mode** (center dock button, top-bar *Focus*, or `Ctrl/⌘+K → "focus"`): Pomodoro, breathing orbit, ambient sound. In demo mode, the ⏩ button runs the timer 60× faster. Finishing ignites the topic's star. Completing today's first session takes the streak from 4 to 5.
7. **Ctrl/⌘+K** opens the command palette: navigation, *Add exam*, *Mark done*, *Generate plan*, topic search, and demo actions.
8. **Settings**: Midnight/Dawn theme, reduce motion, session length, **Reset demo data**.

---

## Tech stack

React 18 · Vite 5 · TypeScript (strict) · Tailwind CSS 3 (custom tokens) · React Router 6 · Framer Motion 11 · Recharts 2 · Zustand 4 · Lucide · date-fns.

Fonts: **Sora** (display), **Inter** (body), **JetBrains Mono** (numbers and countdowns).

> **Calendar note:** the brief allowed FullCalendar or react-big-calendar. Neither can animate sessions *sliding between slots* when the plan changes, and that animation is the Living Schedule's key moment. The calendar is therefore custom (`components/schedule/`). It uses a Framer Motion `layoutId` per session, so a rescheduled block physically travels to its new day and time. Drag-and-drop uses the native HTML5 API, and every drag action also has a keyboard equivalent (open the block → *Move to…*).

---

## Architecture

```
UI (pages/components)
   │  read: useDerived()  ← memoized selectors over the snapshot
   │  write: useDataStore actions (optimistic where it matters)
   ▼
Zustand stores ── useDataStore (snapshot, change log, highlights)
   │             useAuthStore (session), useUIStore (theme, motion, demo clock, toasts)
   ▼
services/*  ── USE_MOCK ? mock/db (localStorage "server") : http(BASE_URL)
   ▼
utils/scheduler.ts  ── pure functions; in production these run on the backend
```

* **Every service function is `async`** and starts with `if (!USE_MOCK) return http(...)`. The real endpoint is written right there, and the mock branch below it is what the backend should do.
* **Mutations return `MutationResponse`** = `{ snapshot, result?, log?, explanation? }`. The full snapshot keeps the client trivially consistent. The backend can switch to deltas later without changing call sites.
* **`utils/scheduler.ts` is pure and deterministic** (no React, no I/O). It can move to a Node backend unchanged, or be ported to another language function by function.
* **AI placeholders**, clearly marked `⚡ AI INTEGRATION PLACEHOLDER`:
  * `scheduleService.generateAIStudyPlan()`: currently falls back to the rule-based scheduler.
  * `briefingService.generateDailyBriefing()`: currently built from rules (`buildRuleBriefing`).
* **App clock** (`lib/clock.ts`): every "today" goes through `now()`, which Demo Mode can shift by whole days.

### Scheduling logic (`src/utils/scheduler.ts`)

| Function | Behaviour |
|---|---|
| `priorityScore(topic)` | 0–100 = 40% urgency (days to deadline) + 25% remaining work + 20% subject weakness + 15% difficulty |
| `generatePlan()` | Fills availability highest-priority first. Honours session length, breaks, and max 2 sessions per topic per day; interleaves subjects. A load factor balances days, and an **earliest-deadline guard** reserves capacity for the tightest deadline. |
| `rescheduleMissed()` | Keeps the missed slot as history, then moves the session to the next free slot **before its deadline**. If none exists, it bumps lower-priority work (cascading). If still nothing fits, it places the session after the deadline and **flags it at risk**. |
| `rescheduleAfterCompletion()` | Early finish or finished topic: later sessions close the gap and upcoming work is pulled forward. Remaining sessions of a finished topic are removed. |
| `moveSession()` | Manual drag: pins the session, reflows both days, re-validates the deadline. |
| `applyMood()` | *Drained*: 60% capacity, hard topics (difficulty ≥ 4) move later. *Energized*: +20% capacity and a hard topic is pulled forward. *Okay*: no change. |
| `rolloverPastSessions()` | Day change or fast-forward: past planned sessions become missed and are rescheduled. |
| `predictReadiness()` | Coverage now, plus planned hours before the exam scaled by your historic completion rate, minus recent misses. Returns a risk level and message. |
| `smartSuggestions()` | Flags subjects with high weakness (low progress or many misses) and recommends extra minutes per week. |
| `projectProgress()` | Data for the analytics forecast: actual, plan-if-followed, and recent-pace curves. |

Every reflow returns `ScheduleResult { sessions, changes[], warnings[], summary }`. Each `ScheduleChange` records *what moved, from where, to where, and why*. These power the **What changed** panel and the toasts.

---

## Folder structure

```
frontend/
├── index.html                 fonts, theme pre-paint script
├── tailwind.config.js         design tokens → CSS variables (both themes)
├── vite.config.ts             @ alias, vendor chunking
├── .env.example
└── src/
    ├── main.tsx · App.tsx     router, lazy routes, MotionConfig
    ├── index.css              Midnight & Dawn tokens, glass, focus rings, reduced motion
    ├── config/api.ts          BASE_URL, USE_MOCK, mock latency
    ├── types/index.ts         User, Subject, Topic, Exam, Assignment, StudySession,
    │                          DailyAvailability, MoodCheckIn, Achievement, ScheduleChange…
    ├── utils/
    │   ├── scheduler.ts       ★ pure scheduling engine (backend-portable)
    │   └── achievements.ts    achievement categories, quick-add templates, best streak
    ├── services/
    │   ├── authService.ts     login / register / me / profile (mock JWT)
    │   ├── subjectService.ts  subjects + topics CRUD, topic status
    │   ├── examService.ts     exams + assignments CRUD
    │   ├── taskService.ts     session status → reschedule on miss / early finish
    │   ├── scheduleService.ts availability, generate (+AI placeholder), move, mood, rollover
    │   ├── progressService.ts snapshot, readiness, suggestions, undo/restore, demo reset
    │   ├── briefingService.ts daily briefing (+AI placeholder)
    │   └── mock/              localStorage "server" (delete when the API is live)
    ├── store/                 useDataStore · useAuthStore · useUIStore (Zustand)
    ├── hooks/                 useDerived · useMotion · useHotkeys · useThemeColors
    ├── lib/                   clock · date · http · utils
    ├── data/seed.ts           realistic demo universe, relative to today
    ├── components/
    │   ├── ui/                Button, GlassCard, Form (Field/Input/Select/Toggle/Segmented/
    │   │                      DifficultyPicker/ColorPicker), Modal, Toaster, Feedback
    │   │                      (Badge/ProgressRing/ProgressBar/AnimatedNumber/Skeleton),
    │   │                      EmptyState (custom SVG art), ErrorState, PageSkeleton
    │   ├── background/        Starfield (canvas, parallax, reduced-motion aware)
    │   ├── layout/            AppShell, IconRail, TopBar, MobileDock, ProtectedRoute
    │   ├── constellation/     ConstellationMap (home hero)
    │   ├── schedule/          WeekView, MonthView, SessionBlock, WhatChangedPanel,
    │   │                      SessionDetailModal, DemoControls
    │   ├── focus/             FocusMode (Pomodoro, breathing orbit), ambient (Web Audio)
    │   ├── mood/              MoodCheckIn
    │   ├── readiness/         ReadinessGauge, Countdown
    │   ├── achievements/      StreakFlame, CategoryIcon
    │   ├── briefing/          DailyBriefing
    │   ├── suggestions/       SmartSuggestions
    │   ├── sessions/          SessionRow
    │   └── command/           CommandPalette (Ctrl/⌘+K)
    └── pages/                 Dashboard, StudyPlan, Subjects, Exams, Availability,
                               Analytics, Achievements, Settings, NotFound, auth/*
```

---

## API contract for the backend

All endpoints except `/auth/*` need `Authorization: Bearer <JWT>`. Types refer to `src/types/index.ts`. Errors return a non-2xx status with `{ "message": string }`.

`MutationResponse` = `{ snapshot: Snapshot, result?: ScheduleResult, log?: ChangeLog, explanation?: string[] }`

### Auth & profile

| Method | Path | Request body | Response |
|---|---|---|---|
| POST | `/auth/register` | `{ name, email, password }` | `AuthResponse { token, user }` |
| POST | `/auth/login` | `{ email, password }` | `AuthResponse { token, user }` |
| POST | `/auth/logout` | — | `204` |
| GET | `/me` | — | `User` |
| PATCH | `/me` | `Partial<{ name, email, preferredSessionMinutes, breakMinutes }>` | `User` |

### Guided setup

| Method | Path | Request body | Response |
|---|---|---|---|
| POST | `/setup` | `SetupPayload { subjects: [{ name, color, difficulty, topics: [{ name, estimatedHours, difficulty }] }], deadlines: [{ subjectIndex, kind: 'exam' \| 'assignment', title, date }], availability }` | `MutationResponse` (data saved and first plan generated) |
| DELETE | `/me/data` | — | `Snapshot` (empty; used by *Start fresh*) |
| PUT | `/me/snapshot` | `Snapshot` | `Snapshot` — restores an earlier state; powers **Undo** on toasts (a backend may replace this with per-action undo) |

`Snapshot.planStale` must be set to `true` by any subject, topic, exam, assignment or availability change, and reset to `false` by plan generation. It drives the "plan out of date" banner.

### Data snapshot

| Method | Path | Request body | Response |
|---|---|---|---|
| GET | `/me/snapshot` | — | `Snapshot` (subjects, topics, exams, assignments, sessions, availability, moods, changeLog, unlockedAchievements) |

### Subjects & topics

| Method | Path | Request body | Response |
|---|---|---|---|
| POST | `/subjects` | `{ name, color, difficulty }` | `MutationResponse` |
| PATCH | `/subjects/:id` | `Partial<{ name, color, difficulty }>` | `MutationResponse` |
| DELETE | `/subjects/:id` | — (cascades topics, exams, assignments, sessions) | `MutationResponse` |
| POST | `/subjects/:subjectId/topics` | `{ name, difficulty, estimatedHours, status?, deadline? }` | `MutationResponse` |
| PATCH | `/topics/:id` | `Partial<TopicInput>` | `MutationResponse` |
| DELETE | `/topics/:id` | — (removes its sessions and exam links) | `MutationResponse` |
| PUT | `/topics/:id/status` | `{ status: 'not_started' \| 'in_progress' \| 'completed' }` | `MutationResponse` (completing runs `rescheduleTopicCompleted`) |

### Exams & assignments

| Method | Path | Request body | Response |
|---|---|---|---|
| POST | `/exams` | `{ subjectId, title, date, topicIds[], location? }` | `MutationResponse` |
| PATCH | `/exams/:id` | `Partial<ExamInput>` | `MutationResponse` |
| DELETE | `/exams/:id` | — | `MutationResponse` |
| POST | `/assignments` | `{ subjectId, title, dueDate, status, topicId? }` | `MutationResponse` |
| PATCH | `/assignments/:id` | `Partial<AssignmentInput>` (incl. `{ status }`) | `MutationResponse` |
| DELETE | `/assignments/:id` | — | `MutationResponse` |

### Availability & schedule

| Method | Path | Request body | Response |
|---|---|---|---|
| PUT | `/availability` | `Availability { weekly: DailyAvailability[], overrides: AvailabilityOverride[] }` | `MutationResponse` — saves and re-fits the existing plan into the new hours (`reflowForAvailability`), returning the moves |
| POST | `/schedule/generate` | — | `MutationResponse` (`result` from `generatePlan`) |
| POST | `/schedule/generate-ai` | — | `MutationResponse` (⚡ AI; must pass the same validation rules) |
| PUT | `/sessions/:id/move` | `SlotRef { date: 'YYYY-MM-DD', start: 'HH:mm' }` | `MutationResponse` (`result.warnings` if after deadline) |
| PUT | `/sessions/:id/status` | `{ status: 'planned' \| 'in_progress' \| 'completed' \| 'missed', actualMin? }` | `MutationResponse` (miss and early finish include `result` + `log`) |
| POST | `/mood` | `{ mood: 'energized' \| 'okay' \| 'drained' }` | `MutationResponse` + `explanation[]` |
| POST | `/schedule/rollover` | — | `MutationResponse` (call on day change) |
| POST | `/schedule/extra-session` | `{ subjectId, minutes? }` | `MutationResponse` |

### Progress, analytics, briefing

| Method | Path | Request body | Response |
|---|---|---|---|
| GET | `/analytics/readiness` | — | `ReadinessPrediction[]` |
| GET | `/analytics/suggestions` | — | `Suggestion[]` |
| GET | `/analytics/projection` | — | `{ points[], avgDailyHours, completionRate }` |
| GET | `/briefing/today` | — | `DailyBriefing { greeting, lines[], generatedBy }` (⚡ AI) |

### Achievements (recorded by the student)

| Method | Path | Request body | Response |
|---|---|---|---|
| POST | `/achievements` | `{ title, category: 'grades' \| 'exam' \| 'subjects' \| 'award' \| 'project' \| 'other', date, subjectId?, result?, note? }` | `MutationResponse` |
| PATCH | `/achievements/:id` | `Partial<AchievementInput>` | `MutationResponse` |
| DELETE | `/achievements/:id` | — | `MutationResponse` |

### Demo-only (optional)

| Method | Path | Request body | Response |
|---|---|---|---|
| POST | `/demo/reset` | — | `Snapshot` |
| POST | `/demo/simulate-miss` | — | `MutationResponse` |

> Analytics are also derived on the client from the snapshot with the same pure functions, so charts update instantly after every change. The analytics endpoints are there for parity and for heavier server-side analysis later.

---

## Design system

* **Midnight** (`#0B1020 → #141B34`) with violet, cyan and amber aurora accents. **Dawn** is a separately tuned palette: warm paper to lavender haze, with deeper accents so they stay AA-legible. It is not an inversion.
* Tokens are CSS variables holding `R G B` triplets (`index.css`), exposed to Tailwind as `ink`, `muted`, `faint`, `violet`, `cyan`, `amber`, `rose`, `mint`, `line`, `glass` and `canvas`. Theme switching only swaps variables.
* **Amber is reserved for urgency** (overdue, at risk, T-minus under 3 days). Subject signature colors are chosen from a set that excludes it.
* Chart marks use a per-theme darkened variant of each subject color (`chartColor()`). These variants were checked with a palette validator for lightness band, chroma, colorblind separation and contrast. Every chart also has a legend or direct labels and a **Table** view.
* Glass cards use a 1px translucent border and blur, with a violet glow on hover. Spacing is on an 8px scale, with 16–24px radii.
* **Motion:** UI transitions stay under 400 ms. The Living Schedule reflow spring is deliberately slower. Everything honours `prefers-reduced-motion` and the in-app *Reduce motion* toggle (canvas, Framer `MotionConfig` and CSS).
* **Accessibility:** skip link, visible focus rings, labelled controls, focus-trapped dialogs, `role="switch"`/`radiogroup`/`listbox`, live regions for toasts and countdowns, keyboard alternatives for drag-and-drop and constellation stars, and table views for charts.
