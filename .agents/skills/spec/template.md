# Template for a useful spec

This file is the reference the `/spec` skill consults when generating specs. Each section includes its purpose and a minimal example. **It is not text to be copied verbatim** — it is the shape the skill must respect.

---

## Header

Every spec starts with metadata in a blockquote (no tables, no blocks, simple as shown below) format:

```markdown
# SPEC NN — Short, descriptive title

> **Status:** Draft
> **Depends on:** SPEC 01, SPEC 02
> **Version bump:** Minor
> **Date:** YYYY-MM-DD
> **Objective:** A single sentence. If you need two sentences, the feature is too big.
```

**Valid states:** `Draft`, `In review`, `Approved`, `Implemented`, `Obsolete`.

> The labels above are the English defaults. The skills also accept equivalents in any language (e.g. Spanish `Borrador` / `En revisión` / `Aprobado` / `Implementado` / `Obsoleto`). Pick one set per repo and stay consistent.

**Objective rule:** one sentence that a human reads in 5 seconds and understands what is going to be built. If it doesn't fit in one sentence, split the feature.

**Valid version bumps:** `Major`, `Minor`, `Fix` (Spanish: `Mayor` / `Menor` / `Fix`). Every spec declares exactly one, judged against the project's current version (read it from `package.json` or wherever the repo tracks it):

- **Major** — a milestone or a breaking change to how the product behaves.
- **Minor** — new functionality, additive, nothing existing breaks.
- **Fix** — a correction with no new functionality.

This field is not decorative: the implementation plan's last step and one acceptance-criteria item must always cover bumping the version (see Sections 4 and 5 below).

**Fix bumps publish no post.** Only `Major` and `Minor` get a changelog entry. A `Fix` still bumps the version number, but silently — no post. When the next `Major`/`Minor` publishes, its post must roll up every `Fix` bumped since the previous published post (scan `specs/` for `Implemented` specs with `Fix` numbered after the spec that produced that previous post, pull each one's Objective into a short "also includes" list in the new post). If no Fixes happened since, omit that list.

---

## Section 1 — Why this spec exists (optional)

For specs that take non-obvious decisions or break project patterns, a brief section explaining the **why** of the work. Not the what — the what comes later.

For simple specs, omit it.

---

## Section 2 — Scope

Two explicit sub-blocks. **Both are mandatory.**

```markdown
## Scope

**In:**

- Concrete thing one.
- Concrete thing two.

**Out of scope (for future specs):**

- Something that could be done but not now.
- Something that came up in the conversation but is not in.
```

**Why "out" matters:** it captures the things the user mentioned during the question phase but were decided to be deferred. Without that record, during implementation there will be a temptation to slip them in "while we're at it".

---

## Section 3 — Data model

The concrete structures that appear or change. Use real code, not abstract pseudocode.

```markdown
## Data model

\`\`\`js
// Game state
const state = {
level: 1,
score: 0,
highScores: [/* { score, level, date } */],
};
\`\`\`

Conventions:

- Coordinates: origin top-left.
- Velocities in pixels/frame.
```

If the feature introduces no new data, write it explicitly: _"This feature introduces no new data structures. It reuses the model from SPEC 01."_

---

## Section 4 — Implementation plan

Numbered steps. Each step must leave the system in a **functional and runnable** state. No "implement half and continue tomorrow".

```markdown
## Implementation plan

1. Create file X with an empty skeleton.
2. Implement function A in X. Manual test: run Y, see Z.
3. Wire X to existing module W.
4. ...
```

**Rules:**

- Each step must be commitable on its own.
- If a step requires more than 30–50 lines of code, split it.
- The last step of the plan is **not** "test everything" — that is the acceptance criteria.
- **Standing closing step:** every plan's last step is "bump the version per the header's **Version bump** field; if it is `Major` or `Minor`, also publish a changelog post about this spec (and any unpublished `Fix`es since the last post) at `/blog/vX.Y.Z`; if it is `Fix`, only bump — no post." (or the repo's equivalent route/mechanism). This happens during implementation, not while writing the spec — the step just needs to exist in the plan so `/spec-impl` executes it.

---

## Section 5 — Acceptance criteria

Boolean checklist. Each item can be verified with yes or no.

```markdown
## Acceptance criteria

- [ ] The game loads without errors in the console.
- [ ] Breaking a brick adds exactly 10 points.
- [ ] Reloading the page preserves the high-scores.
```

**Anti-patterns to avoid:**

- ❌ "That it works well." → not verifiable.
- ❌ "Good UX." → subjective.
- ❌ "No bugs." → not operational.
- ✅ "Pressing Esc pauses the game and shows the menu." → verifiable, boolean.

**Standing item:** always include one checking that the version was bumped as declared. For `Major`/`Minor`, add one checking the changelog post exists, renders, and rolls up any unpublished `Fix`es since the previous post (e.g. "`/blog/vX.Y.Z` renders a post summarizing this spec's changes"). For `Fix`, add one explicitly confirming no post was created.

---

## Section 6 — Decisions taken and discarded

The section that has the most value 3 months from now. Capture **what you considered**, not just what you chose.

```markdown
## Decisions

- **Yes:** localStorage for persistence. Fits in <5MB and we don't need queries.
- **No:** IndexedDB. Overengineering for this case.
- **Yes:** versioned key (`save:v1`). Lets us migrate the schema later without breaking.
- **No:** cloud sync. Goes in another spec if it ever lands.
```

Each decision ideally has a brief reason. Decisions without a reason are the first ones to be questioned later.

---

## Section 7 — Identified risks (optional)

Only when there are non-obvious risks. Simple table:

```markdown
## Risks

| Risk                                  | Mitigation                                                                  |
| ------------------------------------- | --------------------------------------------------------------------------- |
| localStorage disabled in private mode | Fallback to in-memory object. The game still runs, it just doesn't persist. |
| Future incompatible schema            | Key includes `:v1`. Migration documented in `persistence.js`.               |
```

For small specs or very contained features, omit it.

---

## Final section — What is NOT in (reinforcement)

Repeat explicitly at the end what **will not** be done in this spec. This repetition is deliberate — the Scope section already says it, but at the end of the document it serves as a reminder when someone reads only the last lines.

```markdown
## What is **not** in this spec

- Visual editor (another spec if it ever lands).
- Multiplayer.
- Mobile version.

Each one of those, if it lands, goes in its own spec.
```

---

## Global rules about the whole document

- **One sentence per idea.** If a sentence has two commas and a semicolon, split it.
- **Concrete names.** If you say "the levels module", say `src/levels.js`. If you say "a key", give the exact string.
- **No TODOs.** A TODO in a spec means the decision was not made. Make it or note it as a pending decision with a reason.
- **No long executable code.** The spec describes; the code is written afterwards. Short snippets to illustrate data structures are fine; full functions are not.
- **Standard markdown.** No weird extensions. It must render on GitHub without surprises.
