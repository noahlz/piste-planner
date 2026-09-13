# Workbench mockup – local reference

Copied from the Claude Design project *Piste Planner UI redesign* on
2026-09-07 so tasks can read the target look without a login:
<https://claude.ai/design/p/f4e0ca5c-b7ea-4d4a-a215-6341ad1179d4?file=Piste+Planner+Workbench.dc.html>

- `Piste Planner Workbench.dc.html` – the target design, one Claude Design
  canvas file. Inline styles on the regions are the look to match; its
  `<helmet>` links the design system below and the Figtree web font.
- `ds-styles.css` – the "Industry" design system's token sheet and component
  classes (`--color-*`, `--font-*`, `--space-*`, `--radius-*`, `--shadow-*`).
- `ds-readme.md` – that system's own guide: direction, color, type, states.
- `ds-manifest.json` – the machine-readable token list the system was built from.

The alignment record is `docs/design/workbench-design-alignment-2026-09-07.md`;
its §9 decisions win wherever the mockup and the app differ on structure.
Styling comes from here (tasks.md standing rule 13).

Type: the mockup body uses **Figtree** and the design system uses
**Barlow / Barlow Condensed**, both from Google Fonts. plan.md allows no new
dependency, and the product owner decided on 2026-09-07 (handoff.md
§Verdicts) that the app uses a **system-font stack** carrying the mockup's
sizes, weights, letter-spacing and line heights, with no font files vendored
or linked. Letterforms differ from the mockup by design.
