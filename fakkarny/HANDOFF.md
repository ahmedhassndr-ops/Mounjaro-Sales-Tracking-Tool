# فكرني (Fakkarny): handoff to local session

## What it is
A voice-first life organizer in Egyptian Arabic. You say "فكرني بكرة الساعة ٣ عندي ميعاد…" and it creates the tasks, reminds you, and turns follow-through into a game. The core pain point it targets is **procrastination**: buying supplements and not taking them, promising things and not doing them, leaving everything to the last minute.

- Live: https://fakkarny.vercel.app (Vercel project `fakkarny`, deployed from branch `fakkarny-v1`, root dir `fakkarny/`)
- Repo: `ahmedhassndr-ops/mounjaro-sales-tracking-tool`, folder `fakkarny/`
- It's a PWA, not an App Store app. Users open the link in Safari → Share → Add to Home Screen.

## About Ahmed (the owner)
- Pharmacy background (Mounjaro sales tool, Star Pharmacy dashboard). Egyptian. Plans to sell this for about 200 EGP/month.
- **Keep answers short.** He doesn't read long replies.
- Wants it **fun like a game**, smooth, and **not AI-looking**: no neon gradients, no glow, no generic AI fonts, and less emoji everywhere.
- Wants all copy in natural Egyptian Arabic that sounds like a real person.

## Do these first (in the local session)
1. **Run the humanizer skill** on every user-facing string. They're in `app.js` (`LINES` coach messages, onboarding, toasts, empty states, sheet labels) and `index.html`. Goal: it reads like an Egyptian friend wrote it, with no AI phrasing and fewer emoji.
2. **Run the UI/design skills** for a proper design pass. The current look is a first pass: warm paper background, one orange brand color (`#E8590C`), flat cards, chunky "3D" buttons (Duolingo-style), light and dark themes. Keep it flat and real-product-like. Design tokens live at the top of the `<style>` block in `index.html` (`:root`).
3. **Fonts:** currently self-hosted **Alexandria** (headings) and **IBM Plex Sans Arabic** (body) in `fonts/`. Thmanyah Sans was considered, but its license forbids self-hosting. If you change fonts, keep them self-hosted (the PWA must work offline) and add them to `SHELL` in `sw.js`.

## File map
| File | What |
|---|---|
| `index.html` | All CSS + static markup (nav, voice overlay, sheet, focus, toast). |
| `app.js` | All app logic: state, rendering, gestures, voice, gamification, notifications. Vanilla JS, no build step. |
| `parser.js` | Offline Egyptian Arabic parser: "فكرني…" text → tasks (day, time, repeat, person, category, big-task). Unit-testable in Node. |
| `api/parse.js` | Vercel function. Claude parses messy transcripts and breaks big tasks into steps. Needs `ANTHROPIC_API_KEY`. |
| `sw.js` | Service worker: offline cache + notification click/push handlers. Bump `CACHE` on every release. |
| `manifest.webmanifest`, `icons/` | PWA install metadata. |

Data is stored in `localStorage` key `fakkarny:v1`, on the device only, with export/import in the "أنا" tab.

## What works now (v1)
- Voice input (browser speech recognition `ar-EG`) with a fallback to typing or iOS keyboard dictation. A review screen lets you edit each parsed task before saving.
- Today view: day strip, overdue section, timed/anytime lists, swipe right = done, swipe left = snooze, tap = edit sheet.
- Gamification: XP, levels (مبتدئ → أسطورة), streaks, 12 badges, confetti, sounds, a level-up modal. Three coach personalities (صاحبك الرخم / ماما الحنينة / الشاويش).
- Anti-procrastination: snooze counter, overdue bonus XP, big-task breakdown (steps finish 1 day before the deadline), a 5-minute focus mode with "+20 minutes".
- Goals: daily/weekly counters with templates (water, gym, reading…).
- "ناسي": people you want to keep in touch with, a call-frequency "warmth" bar, birthdays, nudges on Today.
- Reminders: notifications fire **only while the app is open or recently backgrounded**, plus one-tap "add to Calendar" (.ics) for alarms that always work.

## Known gaps / next steps (priority order)
1. **Set `ANTHROPIC_API_KEY`** in Vercel → project `fakkarny` → Settings → Environment Variables, then redeploy. Without it, the on-device parser is used (fine for clear sentences, weaker on messy speech).
2. **Real background push** (the biggest gap on iPhone). Generate VAPID keys, add a `/api/subscribe` endpoint that stores the PushSubscription plus the task schedule (Vercel KV/Upstash or Supabase), and run a scheduler every minute (Upstash QStash or Supabase cron) that sends web-push. `sw.js` already handles `push` events.
3. **Better Egyptian speech-to-text.** Browser recognition is weak on Egyptian dialect. Record audio with MediaRecorder and send it to `/api/transcribe` (ElevenLabs Scribe or Whisper), then pass the text to `/api/parse`.
4. **Accounts + sync** (Supabase) so data survives a phone change; needed before charging money.
5. **Real squads/family sharing** (shared streaks, "who lost the week buys koshary"). This needs accounts first.
6. **WhatsApp reminders** as the fallback channel (WhatsApp Business API via a provider; budget for per-message cost).
7. **Supplement label scan:** photo → Claude vision → timing advice (magnesium at night, zinc with food, iron on an empty stomach away from tea/coffee, add up total zinc across products). Keep it to "how to take what you bought", never diagnosis.
8. **Payments:** 200 EGP/month via Paymob/Fawry/InstaPay.

## How to run locally
```
cd fakkarny && python3 -m http.server 8787   # open http://localhost:8787 (the /api parser falls back to on-device)
# or: npx vercel dev   (runs api/parse.js too, needs ANTHROPIC_API_KEY)
node -e "const P=require('./parser.js');console.log(P.parse('فكرني بكرة الساعة ٣ عندي ميعاد'))"
```
Deploy: push to `fakkarny-v1` (or merge to main and repoint the project), or redeploy from the Vercel dashboard.
