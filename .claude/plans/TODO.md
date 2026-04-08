# TODOs

- Load Real Tournaments into the UI
  - All integration tests tournaments should be available in the UI - "Load tournament"
  - We will have more tournaments from the current and past season. Start with ones from integration tests.
  - i.e. All NACs, SYCs, SJCCs and some mega ROC/RJCC/RYC events

- UI Workflow improvement: touranment setup screen
  - User selects tournament event composition and entries per event on one screen.
  - When the click an event it gets an entries text field next to it.
  - "Auto-populate" button (wand icon) adds event entry suggestions based on tournament type (NAC/ROC/SYC etc) from real data
    - In future versions, we let the user select the Region for ROC/RYC/RJCC and set entries based on real data.
  - "Suggest referees and strips" is on same screen. Populates Strip count and referee count, both fields on same screen.
  - "Advanced" panel (accordion in single-page, pop-up dialog in Wizard) allows user to customize:
    - Referee count: default 2 for NAC, SJCC, SYC. Default 1 for all others
    - Video strips: Required for certain NAC events, default count 8. Optional for all others, user can enable and set count.
    - DE Mode: NAC default staged. "Single stage" for all others.
    - When panel is minimized / hidden the "Advanced" button / link has dim text with the above defaults
  - This is separate from the "Gears" button that lets users fiddle with global weights and penalties.

- Global Settings: All constants should be configuration JSON file with defaults. "Gears" button in upper corner of app, next to Wizard / single page.
  - Allow user to tweak all settings / preferences per events, i.e. weights, earliest start time offset.
  - But NOT hard policies (i.e. no Vet Team and Vet Indv on same day) - they can adjust those through manual drag-n-drop if they really want to.
  - When serializing the tournament config, only the overrides are saved. If not overriden, defaults from constants persist.
