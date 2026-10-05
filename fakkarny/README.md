# فكرني (Fakkarny) — v1 prototype

A voice-first life organizer PWA in Egyptian Arabic. Say "فكرني…" and it builds your day.

- **No App Store:** open the link in Safari → Share → Add to Home Screen.
- **Voice:** browser speech recognition (ar-EG). Falls back to typing / iOS keyboard dictation.
- **Understanding:** `api/parse.js` uses Claude when `ANTHROPIC_API_KEY` is set in Vercel; otherwise `parser.js` parses on-device.
- **Game layer:** XP, levels, streaks, badges, 3 coach personalities, confetti.
- **Anti-procrastination:** overdue section, snooze counter, big-task breakdown with a 1-day safety buffer, 5-minute focus mode.
- **Goals** (daily/weekly counters) and **My people** (call reminders, birthdays).
- **Reminders:** notifications while the app is open/backgrounded, plus one-tap "add to Calendar" (.ics) for reliable alarms. Server push is the next step.
- Data is stored on the device (localStorage) with export/import.
