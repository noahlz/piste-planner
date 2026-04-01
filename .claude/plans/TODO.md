# TODOs

- Methodology cleanup: 
  - Find contradictory / inconsistent rules.
  - Consolidate rules that redundant. 
  - Reorganize sections for more fluid reading experience.
  - Move all numeric penalties to an end appendix. Prose should only use qualitative for penalties / polices
  - Revise "example entry counts" to match integration test examples

- Load Real Tournaments into the UI
  - All integration tests tournaments should be available in the UI - "Load tournament"
  - We probably should add more tournaments from the current and past season
  - i.e. All NACs, SYCs, SJCCs and some mega ROC/RJCC/RYC events

- All constants should be configuration JSON file with defaults.
  - Allow user to tweak all settings / preferences per events, i.e. weights, earliest start time offset.
  - But not hard policies (i.e. no Vet Team and Vet Indv on same day) - they can adjust those through manual drag-n-drop if they really want to.
  - UI will have "Advanced" screen where user can tweak all the values, and if adjusted the changed values are saved with the tournament configuration to be saved into the serialized base64 value when saved/shared.


