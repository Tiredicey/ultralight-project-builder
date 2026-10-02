# Design, motion and agent-skill sources

Checked 2026-10-02. Every link below answered HTTP 200 from the sandbox that day, and the ones marked **read** were opened and summarised from their own text. Nothing here is ranked by popularity; star counts and "best" claims from third-party listing sites were left out because they could not be checked.

How to use this list with `facts.txt`: the facts file sets the rules (verify, no invented numbers, reduced motion mandatory, transform/opacity only, one `<h1>`, real `<button>`). The sources below are where to look things up. Where a source disagrees with the facts file, the conflict is written next to it.

## 1. Agent skills and instruction files (give these to a model)

| Source | What it is | Use it for |
|---|---|---|
| [anthropics/skills, frontend-design SKILL.md](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md) (**read**) | Anthropic's design skill. Two-pass process: write a token plan (4-6 named hex colours, type roles, ASCII wireframe), review it against the brief, then build and critique with screenshots. Lists the current "AI default" looks to avoid | Any new page or redesign. Paste the "Process" section into the prompt |
| [Agent Skills overview](https://docs.anthropic.com/en/docs/agents-and-tools/agent-skills/overview), [Claude Code skills](https://code.claude.com/docs/en/skills), [agentskills.io](https://agentskills.io/) | The `SKILL.md` format: a folder with YAML front matter plus instructions | Writing your own skill so a model loads it only when needed |
| [pbakaus/impeccable](https://github.com/pbakaus/impeccable) (**read**, Apache 2.0) | One skill with 24 commands (`audit`, `polish`, `animate`, `harden`, `adapt`...) and a CLI with 61 deterministic detector rules; `npx impeccable detect <url>` scans a live page without an LLM | A repeatable check after every UI change. Section 7 of the facts file already quotes it |
| [Leonxlnx/taste-skill](https://github.com/leonxlnx/taste-skill) | The `design-taste-frontend` skill named in facts §22.2; v2 is marked experimental by its author | Landing pages and portfolios. Pin a version, since v2 can change |
| [emilkowalski/skills](https://github.com/emilkowalski/skills) (**read**) | Animation skills by Emil Kowalski (ex-Vercel, Linear): `animate`, `review-animations`, `improve-animations`, `find-animation-opportunities`, `animation-vocabulary`, `apple-design`, `mobile-native` | Motion. `review-animations` is a strict checklist; `mobile-native` covers tap highlight, 100vh, input zoom and safe areas |
| [vercel-labs/agent-skills, web-design-guidelines](https://github.com/vercel-labs/agent-skills/blob/main/skills/web-design-guidelines/SKILL.md) | Skill that audits UI code against Vercel's guidelines (below) | Code review of finished UI. An open issue notes it fetches the guidelines from `main` each run, so results can shift |
| [google-labs-code/design.md](https://github.com/google-labs-code/design.md) (**read**, format version `alpha`) | `DESIGN.md`: YAML design tokens plus prose rationale. `npx @google/design.md lint` checks broken token references and WCAG contrast; `export` writes Tailwind v4 `@theme` or W3C DTCG tokens | Giving any model the same colours, type and spacing every time. On Windows use `npx -p @google/design.md designmd lint DESIGN.md` |
| [AGENTS.md](https://agents.md/) | Plain-markdown file of project rules that many coding agents read | Repo conventions and test commands (facts §2.1 asks for one) |

## 2. Rules and checklists (cite these, they are primary)

| Source | Key points |
|---|---|
| [Vercel Web Interface Guidelines](https://vercel.com/design/guidelines) (**read**), [repo](https://github.com/vercel-labs/web-interface-guidelines) | Animation order of preference: CSS, then Web Animations API, then JS libraries. Animate `transform`/`opacity` only, never `transition: all`, animations interruptible, honour `prefers-reduced-motion`. Hit targets 24 px (44 px on mobile), 16 px inputs on mobile to stop iOS zoom, tabular numbers for comparisons, all states designed (empty, sparse, dense, error) |
| [WCAG 2.2: Animation from interactions (2.3.3)](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html) and [Pause, stop, hide (2.2.2)](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html) | Motion triggered by interaction can be turned off; anything moving on its own for more than 5 s needs a pause or stop control |
| [MDN `prefers-reduced-motion`](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion) | The media query behind facts §23.B |
| [web.dev animations guide](https://web.dev/articles/animations-guide), [INP](https://web.dev/articles/inp) | Which properties stay on the compositor; how slow interactions are measured |
| [APCA](https://apcacontrast.com/) | Perceptual contrast; Vercel prefers it to WCAG 2. The facts file asks for WCAG AA 4.5:1, so meet WCAG AA and use APCA as a second check |
| [Apple HIG: Motion](https://developer.apple.com/design/human-interface-guidelines/motion), [Material 3: Motion](https://m3.material.io/styles/motion/overview) | Platform motion principles (purpose, duration, easing families) |

## 3. Motion tools

| Tool | Status checked | Notes |
|---|---|---|
| [GSAP](https://gsap.com/pricing/) (**read**) | "GSAP is now 100% free for all users", including the former paid plugins, backed by Webflow | [ScrollTrigger](https://gsap.com/docs/v3/Plugins/ScrollTrigger/), [SplitText](https://gsap.com/docs/v3/Plugins/SplitText/). Use [`gsap.matchMedia()`](https://gsap.com/docs/v3/GSAP/gsap.matchMedia%28%29) to skip timelines under reduced motion (facts §23.B) |
| [Motion](https://motion.dev/docs) (formerly Framer Motion) | Docs live | [Accessibility page](https://motion.dev/docs/react-accessibility) covers `useReducedMotion` |
| [View Transitions API](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API), [Chrome guide](https://developer.chrome.com/docs/web-platform/view-transitions) | Native browser API | Page and state transitions without a library. Check [caniuse](https://caniuse.com/view-transitions) before relying on cross-document transitions |
| [CSS scroll-driven animations](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_scroll-driven_animations), [Chrome guide](https://developer.chrome.com/docs/css-ui/scroll-driven-animations) | Native CSS | Scroll progress effects with no JS, which is first choice under Vercel's CSS-first rule |
| [`@starting-style`](https://developer.mozilla.org/en-US/docs/Web/CSS/@starting-style) | Native CSS | Enter animations for elements that appear (dialogs, popovers) |
| [Lenis](https://lenis.darkroom.engineering/) | Site live | Smooth scrolling. Hijacking scroll can fight assistive tech, so keep it optional and off under reduced motion |
| [easings.net](https://easings.net/) | Site live | Curve reference. Impeccable advises against bounce and elastic curves |
| [HyperFrames](https://github.com/heygen-com/hyperframes) | Repo live | HTML-to-MP4 video, as in the facts file's video overlay |

Check browser support with [Baseline](https://web.dev/baseline) or [webstatus.dev](https://webstatus.dev/) before using any new CSS or API.

## 4. Learning and reference

- [animations.dev](https://animations.dev/) (Emil Kowalski, paid course) and [Interface Craft](https://www.interfacecraft.dev/) (Josh Puckett): craft-level motion and interface detail.
- [Utopia](https://utopia.fyi/): fluid type and space scales with `clamp()`.
- [Geist](https://fonts.google.com/specimen/Geist): the face this site uses (Google Fonts, open licence).
- [Refactoring UI](https://refactoringui.com/), [Smashing Magazine](https://www.smashingmagazine.com/): practical layout and hierarchy.
- Galleries for inspiration only, never as a source of facts: [Awwwards](https://www.awwwards.com/), [Godly](https://godly.website/), [Mobbin](https://mobbin.com/). Codrops (`tympanus.net/codrops`) returned HTTP 403 to the sandbox, so it is listed here unverified.

## 5. A prompt block that works with facts.txt

```
Follow facts.txt. Then, for this UI task:
1. Read DESIGN.md (tokens) and PRODUCT.md (audience, job) if they exist. If not, write a 4-6 colour, 2-face, one-layout plan first and check it against the brief (anthropics frontend-design, "Process").
2. Motion: CSS first, then WAAPI, then GSAP/Motion. Animate transform and opacity only. Every effect has a reduced-motion path. One orchestrated moment beats many small ones.
3. Quality floor: 390 px and 1440 px with no sideways scroll, visible focus, 44 px touch targets, 16 px inputs on mobile, one <h1>, real buttons, all states (empty, loading, error).
4. Verify with screenshots at both widths and `npx impeccable detect <url>`. Report what you could not check.
```

## 6. Conflicts to know about

- **Stack.** facts §20 defaults to React/Next.js + Tailwind + Motion. This project is Hono with plain ES modules, which facts §25 (redesign: preserve the existing system) and the Cloudflare Pages setup favour. Keep it unless the project is rebuilt.
- **"AI default" looks.** Anthropic's skill flags tracked all-caps eyebrow labels, middle-dot meta strings and small monospace data labels as generated-page tells. This site uses all three (for example the "RUN PACK" eyebrow and `P/2626 · LEARN-626`). They carry real data here (SAP codes and values), so they were kept; a future redesign pass should decide on purpose.
- **Contrast standard.** facts §23.C uses WCAG AA; Vercel prefers APCA. Meeting both is possible and avoids the conflict.
