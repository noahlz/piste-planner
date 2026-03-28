import { useStore } from '../../store/store.ts'
import { findCompetition } from '../../engine/catalogue.ts'
import { DEFAULT_CUT_BY_CATEGORY, DEFAULT_VIDEO_POLICY_BY_CATEGORY } from '../../engine/constants.ts'
import { CutMode, DeMode, VideoPolicy } from '../../engine/types.ts'
import { competitionLabel } from '../competitionLabels.ts'
import { DefaultLabel } from '../common/DefaultLabel.tsx'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

const DE_MODE_OPTIONS: { value: DeMode; label: string }[] = [
  { value: DeMode.SINGLE_BLOCK, label: 'Single Block' },
  { value: DeMode.STAGED_DE_BLOCKS, label: 'Staged DE Blocks' },
]

const VIDEO_POLICY_OPTIONS: { value: VideoPolicy; label: string }[] = [
  { value: VideoPolicy.REQUIRED, label: 'Required' },
  { value: VideoPolicy.BEST_EFFORT, label: 'Best Effort' },
  { value: VideoPolicy.FINALS_ONLY, label: 'Finals Only' },
]

const CUT_MODE_OPTIONS: { value: CutMode; label: string }[] = [
  { value: CutMode.DISABLED, label: 'Disabled' },
  { value: CutMode.PERCENTAGE, label: 'Percentage' },
  { value: CutMode.COUNT, label: 'Count' },
]

const DEFAULT_DE_MODE: DeMode = DeMode.SINGLE_BLOCK

export function CompetitionOverrides() {
  const selectedCompetitions = useStore((s) => s.selectedCompetitions)
  const updateCompetition = useStore((s) => s.updateCompetition)

  const sortedIds = Object.keys(selectedCompetitions).sort()

  if (sortedIds.length === 0) {
    return (
      <Card className="pt-0 gap-0">
        <CardHeader className="bg-foreground/10 rounded-t-xl py-2">
          <CardTitle>Competition Overrides</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Select competitions above to configure overrides.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Competition Overrides</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Competition</TableHead>
              <TableHead>DE Mode</TableHead>
              <TableHead>Video Policy</TableHead>
              <TableHead>Cut Mode</TableHead>
              <TableHead>Cut Value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedIds.map((id) => {
              const entry = findCompetition(id)
              const label = entry ? competitionLabel(entry) : id
              const config = selectedCompetitions[id]
              const defaultVideoPolicy = entry
                ? DEFAULT_VIDEO_POLICY_BY_CATEGORY[entry.category]
                : undefined

              return (
                <TableRow key={id}>
                  <TableCell className="text-foreground">{label}</TableCell>
                  <TableCell>
                    <Select
                      value={config.de_mode}
                      onValueChange={(value) =>
                        updateCompetition(id, { de_mode: value as DeMode })
                      }
                    >
                      <SelectTrigger className="h-8 w-[140px]" aria-label={`DE mode for ${label}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DE_MODE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <DefaultLabel isDefault={config.de_mode === DEFAULT_DE_MODE} />
                  </TableCell>
                  <TableCell>
                    <Select
                      value={config.de_video_policy}
                      onValueChange={(value) =>
                        updateCompetition(id, { de_video_policy: value as VideoPolicy })
                      }
                    >
                      <SelectTrigger className="h-8 w-[130px]" aria-label={`Video policy for ${label}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {VIDEO_POLICY_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <DefaultLabel
                      isDefault={defaultVideoPolicy === config.de_video_policy}
                    />
                  </TableCell>
                  <TableCell>
                    <Select
                      value={config.cut_mode}
                      onValueChange={(value) =>
                        updateCompetition(id, { cut_mode: value as CutMode })
                      }
                    >
                      <SelectTrigger className="h-8 w-[120px]" aria-label={`Cut mode for ${label}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CUT_MODE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <DefaultLabel
                      isDefault={
                        entry
                          ? config.cut_mode === DEFAULT_CUT_BY_CATEGORY[entry.category].mode
                          : false
                      }
                    />
                  </TableCell>
                  <TableCell>
                    {config.cut_mode !== CutMode.DISABLED && (
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          min={1}
                          max={config.cut_mode === CutMode.PERCENTAGE ? 100 : undefined}
                          className="h-8 w-16 text-right"
                          value={config.cut_value}
                          onChange={(e) => {
                            const raw = Number(e.target.value)
                            if (!Number.isFinite(raw) || raw < 1) return
                            updateCompetition(id, { cut_value: raw })
                          }}
                          aria-label={`Cut value for ${label}`}
                        />
                        <span className="text-xs text-muted-foreground">
                          {config.cut_mode === CutMode.PERCENTAGE ? '%' : 'fencers'}
                        </span>
                        <DefaultLabel
                          isDefault={
                            entry
                              ? config.cut_mode === DEFAULT_CUT_BY_CATEGORY[entry.category].mode &&
                                config.cut_value === DEFAULT_CUT_BY_CATEGORY[entry.category].value
                              : false
                          }
                        />
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
