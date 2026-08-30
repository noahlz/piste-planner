import { TopBar } from './TopBar.tsx'
import { Rail } from './Rail.tsx'
import { UnplacedTray } from './UnplacedTray.tsx'
import { CenterView } from './CenterView.tsx'
import { Drawer } from './Drawer.tsx'

/**
 * The workbench: one full-bleed screen replacing the max-w-4xl card stack
 * (FR-002, S2-contract.md §Regions). Top bar across the top; below it the
 * rail (fixed width, its own scroll) beside a column holding the unplaced
 * tray docked above the center; the drawer along the bottom.
 *
 * Each region owns its own landmark element and accessible name — TopBar's
 * `<header>`, Rail's `<aside>`, UnplacedTray's and CenterView's own
 * `<section>`/`<main>`, Drawer's `<section>` — so a region composed here
 * renders identically whether mounted alone (as UnplacedTray.test.tsx does)
 * or inside the shell.
 */
export function WorkbenchShell() {
  return (
    <div className="flex h-screen flex-col bg-background">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <Rail />
        <div className="flex flex-1 flex-col overflow-hidden">
          <UnplacedTray />
          <CenterView />
        </div>
      </div>
      <Drawer />
    </div>
  )
}
