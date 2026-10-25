# code2video

A local web app that turns a **script** into a finished **video** — narration, word-synced
captions and an MP4 export — without opening a video editor.

It is the OSI explainer pipeline, generalised: the same Remotion composition that rendered
`osi-video/out/osi-model.mp4` is now driven from a browser UI.

---

## Run it

```powershell
cd C:\dev\video-lab\code2video
npm run dev
```

Open <http://localhost:3000>. The header shows **engine ready** when Piper, whisper, ffmpeg
and the Remotion entry are all found. `Engine checks` at the bottom lists every probe.

No model downloads are needed on this machine: the app reuses
`voice-caption\voices\en_US-lessac-medium.onnx`, `voice-caption\models\faster-whisper-base`
and `tools\ffmpeg-9.0.2\bin`.

---

## How it works

```
prose / YAML ──▶ scenes + blocks ──▶ narration.json ──▶ Remotion ──▶ MP4 + SRT
                       │                  (Piper +                 (browser
                       │                   faster-whisper)          preview)
                       └── live preview in the browser
```

1. **Write** — the studio has two synced panes. Type prose on the left; it is split into
   scenes at markdown headings and blank lines, and a visual block is inferred for each.
   The right pane is the YAML the app actually renders from, blocks and all.
2. **Or let the app write it** — the **Write** panel takes pasted notes or a **PDF** and
   produces the whole script locally with Ollama. No API key, nothing leaves the machine.
3. **Narrate** — Piper synthesises one wav per scene, faster-whisper returns word timings,
   and `narration.json` lands next to the project. Scenes are cached by text hash, so
   editing one scene only re-runs that one. Each scene can use its own voice, so a
   two-hander genuinely sounds like two people.
4. **Stage** — a scene is a `board` (blocks only), a `character` (one figure beside the
   blocks) or a `dialogue` (two figures facing each other). Characters are flat vector
   people whose mouths are driven by the **real word timings**, so the lips move on the
   syllable actually being spoken, not on a loop.
5. **Preview** — `@remotion/player` renders the real composition in the page. Editing the
   script updates the preview immediately; no render required.
6. **Export** — `@remotion/renderer` renders server-side, one job at a time, with live
   progress. **Draft** is half resolution and quick; **Full** is 1920×1080. Subtitles come
   from the same timings the renderer used.

---

## Notes → script, fully local

The **Write** panel (`POST /api/write`) turns notes into a script with `qwen2.5:7b` over
Ollama. Two steps: one call plans the whole script as a list of lines to say, then one call
per scene writes the narration alongside its blocks. Everything is validated against the
same zod schema the editor uses, and it falls back to deterministic `proseToScenes` if the
model returns something unusable.

**PDF upload** (`POST /api/pdf`) extracts the text layer with `pypdf` and keeps the file in
`data/uploads/` so the same notes can be re-written later. A scanned PDF with no text layer
is rejected with a clear message rather than producing an empty script.

> **This machine is CPU-only** (i5-8265U). `qwen2.5:7b` generates at roughly 0.4–2 tok/s, so
> a 3-minute script takes **~15–30 minutes**. The panel shows the estimate before you start.
> That is the deliberate trade for keeping everything offline.

---

## Voices

Three Piper voices ship with the app:

| id | voice | sounds like |
|---|---|---|
| `lessac` | en_US Lessac medium | default narrator, neutral |
| `amy` | en_US Amy medium | US female |
| `alan` | en_GB Alan medium | GB male |

Set a project-wide default with `voice:` and override per scene with a scene-level `voice:`.
Any value containing `/` or ending `.onnx` is treated as a literal path to your own model.
Download the packs with `npm run voices`.

---

## Characters

A character is **data** — a few colours and a hair style — so it travels inside the YAML and
renders identically in the browser preview and in the render. Four presets are built in:
`narrator`, `teacher`, `expert`, `student`.

```yaml
cast:
  - id: teacher
    name: Ada
    shirt: "#1ABC9C"
    hairStyle: bun
    accessory: glasses

scenes:
  - id: 1
    mode: character          # board | character | dialogue
    speaker: teacher
    voice: amy               # the voice and the mouth are the same character
    narration: Let us look at the layers one at a time.
    blocks: [...]
```

`mode: dialogue` takes a `listener:` as well; the speaker is lit and animating while the
listener dims and holds still. The **Staging** panel in the studio edits all of this without
touching YAML.

---

## Blocks

A scene is narration plus any number of blocks. The full vocabulary:

| `type` | fields | looks like |
|---|---|---|
| `title` | `text`, `sub?` | word-by-word headline |
| `bullets` | `heading?`, `items[]` | panel rows with coloured dots |
| `cards` | `heading?`, `items[{label, value?, hint?}]` | glowing badges |
| `stack` | `heading?`, `layers[{label, color?}]`, `highlight?` | stacked bars rising |
| `steps` | `heading?`, `items[]` | numbered circles on a rail |
| `compare` | `heading?`, `left{title, items[]}`, `right{...}` | two-column versus |
| `code` | `heading?`, `language?`, `code` | monospace panel that types itself |
| `mnemonic` | `phrase`, `expansion[]` | phrase + letter chips |
| `outro` | `text`, `sub?` | closing card with a pulsing pill |
| `quote` | `text`, `who?`, `source?` | pull-quote with a quote mark |
| `callout` | `kind?` (`note\|tip\|warning\|danger\|key`), `title?`, `text` | tinted callout box |
| `timeline` | `heading?`, `entries[{when, what, note?}]` | dates descending a rail |
| `table` | `heading?`, `data{columns[], rows[][]}`, `highlight?` | table that reveals row by row |
| `diagram` | `heading?`, `nodes[{id, label, color?, sub?}]`, `edges[{from, to, label?}]` | node graph |
| `chapter` | `number?`, `title`, `sub?` | chapter divider card |
| `stat` | `heading?`, `items[{label, value?, hint?}]`, `note?` | oversized number card |
| `keypoints` | `heading?`, `items[]` | checklist with tick marks |

When you type prose, `inferBlocks` picks the shape that fits: a percentage becomes a `stat`,
two or more years a `timeline`, `Term: meaning` lines a `table`, a lone quoted line a `quote`,
a comma list a `cards`, ordinals a `steps`, and anything else `bullets`.

Minimal document:

```yaml
name: My video
theme: midnight
scenes:
  - id: 1
    title: Cold open
    narration: Every second, millions of messages cross the world.
    blocks:
      - type: title
        text: How does data travel?
      - type: bullets
        items: ["Invisible messages", "Seven layers", "We walk all seven"]
```

Themes: `midnight` (the OSI look), `nebula`, `carbon`, `daylight`.

---

## Layout

```
code2video/
  src/app/                    dashboard + /studio/[id] + API routes
  src/components/             StudioEditor, Preview, SceneInspector, ScriptWriter,
                              VoicePanel, NewProject, ProjectList, ui
  src/lib/engine/             types, themes, paths, store, jobs, narrate, render, script
  src/lib/engine/writer.ts    local Ollama writer (plan → per-scene narration)
  src/lib/engine/voices.ts    pure voice registry (safe in the browser bundle)
  src/lib/engine/voice-files.ts  the disk half: resolving .onnx paths, install status
  src/lib/engine/cast.ts      character presets + resolveCast
  src/lib/video/timeline.ts   pure timing + caption + SRT maths (shared by all three)
  src/remotion/               the composition: Studio, blocks, chrome, anim, characters, Root
  src/lib/templates/          osi.json, demo.json, cast-demo.json - the built-in examples
  engine/narrate.py           Piper + faster-whisper (unchanged logic from osi-video)
  engine/pdftext.py           PDF text-layer extraction
  scripts/make-osi-template.mjs   regenerates osi.json from the approved OSI narration
  scripts/test-infer.ts           prose → blocks inference checks
  scripts/fetch-voices.mjs        downloads the Piper voice packs
  public/projects/<id>/       project.json, narration.json, voice/*.wav, out/*.mp4
  data/jobs/                  job records + logs
  data/uploads/               PDFs you uploaded, kept for re-writing
```

Everything a project needs lives in `public/projects/<id>/`, which is why the renderer and
the browser can both read the same audio.

---

## API

| Method | route | does |
|---|---|---|
| GET | `/api/health` | engine probes (`?force=1` re-probes) |
| GET | `/api/projects` | list |
| POST | `/api/projects` | create from `{name, template?}` / `{prose}` / `{yaml}` |
| GET | `/api/projects/[id]` | project + narration + current YAML |
| PATCH | `/api/projects/[id]` | save (`{yaml}` re-parses everything) |
| DELETE | `/api/projects/[id]` | delete project and its renders |
| POST | `/api/projects/[id]/narrate` | start narration job (`{yaml?, force?}`) |
| POST | `/api/projects/[id]/render` | start render job (`{yaml?, mode: draft\|full}`) |
| GET | `/api/projects/[id]/srt` | download subtitles |
| GET | `/api/jobs/[id]` | job status, progress and log (`all` for recent) |
| GET | `/api/write` | Ollama reachable? which writer model (`reachable`, `writer`, `models`) |
| POST | `/api/write` | notes → script (`{notes, topic?, audience?, targetMinutes?, previewOnly?}`) |
| PUT | `/api/write` | time estimate for a body of notes, without generating |
| POST | `/api/pdf` | upload a PDF of notes, get its text back (multipart `file`) |

Narration and render routes accept the current YAML, so they save and run in one step — the
thing you narrate is always what is on screen.

---

## Notes and gotchas

- **Renders queue.** This machine has 8 cores; two concurrent Remotion renders would fight.
  `runExclusive` in `lib/engine/jobs.ts` serialises them. Progress survives a dev-server
  restart because jobs are stored in `data/jobs/`.
- **First render is slower.** Remotion downloads a headless Chrome once, and the first
  bundle takes ~30–60s. The bundle is cached for the life of the server; saving a project
  invalidates it so edits are picked up.
- **Preview vs narration.** If you edit a scene's narration, its old audio is dropped from
  the preview (timings fall back to estimates) rather than showing a voice track that no
  longer matches the words. The header shows how many scenes are in that state. Press
  **Narrate** to re-sync — unchanged scenes are cached and skipped.
- **Paths are plain strings** in `lib/engine/paths.ts` on purpose: Turbopack tries to
  resolve `path.join(...)` chains as build assets and panics on `ffmpeg.exe`. Override with
  `C2V_FFMPEG`, `C2V_FFPROBE`, `C2V_VOICE`, `C2V_VOICES_DIR`, `C2V_WHISPER`, `C2V_PYTHON`,
  `C2V_OLLAMA`, `C2V_RENDER_PORT`, `C2V_WRITER_DEBUG`.
- **Tailwind** is wired through the first-party Turbopack loader
  (`@tailwindcss/turbopack`) in `next.config.ts`. Removing that rule silently disables
  every utility class — the page still renders, just unstyled.
- **The composition must stay free of `node:fs` / `node:child_process`.** Remotion bundles
  `src/remotion/**` for a browser, and `node:child_process` is not polyfilled, so a single
  import chain reaching `paths.ts` fails the bundle with `UnhandledSchemeError`. That is why
  the voice registry is split: `voices.ts` is pure, `voice-files.ts` touches the disk.
  Anything the composition imports must be pure data or pure functions.
- **Audio uses `staticFile()`, not the stored path.** Narration records site-relative paths
  (`/projects/<id>/voice/x.wav`) because Next serves `public/` at the root. Remotion's own
  bundle server keeps `public/` as a sub-directory, so the same string 404s there.
  `staticFile()` resolves against whichever server is serving the composition.
- Remotion is free for individuals and small teams; larger companies need a licence.

---

## Standalone Remotion

The composition runs without the app:

```powershell
npm run studio     # remotion studio, with demoProps
npm run render     # one 1080p mp4 of the demo composition
```

`npm run template` regenerates `src/lib/templates/osi.json` from
`..\osi-video\src\narration.json` — used when the OSI script changes.
