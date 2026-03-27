import { useStore } from '../../store/store.ts'
import { findCompetition } from '../../engine/catalogue.ts'
import { DEFAULT_VIDEO_POLICY_BY_CATEGORY } from '../../engine/constants.ts'
import { DeMode, VideoPolicy } from '../../engine/types.ts'
import { competitionLabel } from '../competitionLabels.ts'
import { DefaultLabel } from '../common/DefaultLabel.tsx'

const DE_MODE_OPTIONS: { value: DeMode; label: string }[] = [
  { value: DeMode.SINGLE_BLOCK, label: 'Single Block' },
  { value: DeMode.STAGED_DE_BLOCKS, label: 'Staged DE Blocks' },
]

const VIDEO_POLICY_OPTIONS: { value: VideoPolicy; label: string }[] = [
  { value: VideoPolicy.REQUIRED, label: 'Required' },
  { value: VideoPolicy.BEST_EFFORT, label: 'Best Effort' },
  { value: VideoPolicy.FINALS_ONLY, label: 'Finals Only' },
]

const DEFAULT_DE_MODE: DeMode = DeMode.SINGLE_BLOCK

const INLINE_SELECT = 'rounded-md border border-slate-200 px-2 py-0.5 text-sm text-body focus:ring-2 focus:ring-accent focus:outline-none'

export function CompetitionOverrides() {
  const selectedCompetitions = useStore((s) => s.selectedCompetitions)
  const updateCompetition = useStore((s) => s.updateCompetition)

  const sortedIds = Object.keys(selectedCompetitions).sort()

  if (sortedIds.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-card p-5 shadow-sm">
        <h2 className="mb-2 text-lg font-semibold text-header">Competition Overrides</h2>
        <p className="text-sm text-muted">Select competitions above to configure overrides.</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-card p-5 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-header">Competition Overrides</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-xs text-muted">
            <th className="pb-2 text-left font-medium">Competition</th>
            <th className="pb-2 text-left font-medium">DE Mode</th>
            <th className="pb-2 text-left font-medium">Video Policy</th>
          </tr>
        </thead>
        <tbody>
          {sortedIds.map((id) => {
            const entry = findCompetition(id)
            const label = entry ? competitionLabel(entry) : id
            const config = selectedCompetitions[id]
            const defaultVideoPolicy = entry
              ? DEFAULT_VIDEO_POLICY_BY_CATEGORY[entry.category]
              : undefined

            return (
              <tr key={id} className="border-b border-slate-100 even:bg-slate-50">
                <td className="py-1.5 text-body">{label}</td>
                <td className="py-1.5">
                  <select
                    className={INLINE_SELECT}
                    value={config.de_mode}
                    onChange={(e) =>
                      updateCompetition(id, { de_mode: e.target.value as DeMode })
                    }
                    aria-label={`DE mode for ${label}`}
                  >
                    {DE_MODE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <DefaultLabel isDefault={config.de_mode === DEFAULT_DE_MODE} />
                </td>
                <td className="py-1.5">
                  <select
                    className={INLINE_SELECT}
                    value={config.de_video_policy}
                    onChange={(e) =>
                      updateCompetition(id, {
                        de_video_policy: e.target.value as VideoPolicy,
                      })
                    }
                    aria-label={`Video policy for ${label}`}
                  >
                    {VIDEO_POLICY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <DefaultLabel
                    isDefault={defaultVideoPolicy === config.de_video_policy}
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
