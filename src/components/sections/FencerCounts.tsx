import { useStore } from '../../store/store.ts'
import { findCompetition } from '../../engine/catalogue.ts'
import { competitionLabel } from '../competitionLabels.ts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export function FencerCounts() {
  const selectedCompetitions = useStore((s) => s.selectedCompetitions)
  const updateCompetition = useStore((s) => s.updateCompetition)

  const sortedIds = Object.keys(selectedCompetitions).sort()

  if (sortedIds.length === 0) {
    return (
      <Card className="pt-0 gap-0">
        <CardHeader className="bg-foreground/10 rounded-t-xl py-2">
          <CardTitle>Fencer Counts</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Select competitions above to enter fencer counts.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fencer Counts</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Competition</TableHead>
              <TableHead className="text-right">Fencer Count</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedIds.map((id) => {
              const entry = findCompetition(id)
              const label = entry ? competitionLabel(entry) : id
              return (
                <TableRow key={id}>
                  <TableCell>{label}</TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      min={0}
                      className="ml-auto w-20 text-right"
                      value={selectedCompetitions[id].fencer_count}
                      onChange={(e) =>
                        updateCompetition(id, { fencer_count: Number(e.target.value) })
                      }
                      aria-label={`Fencer count for ${label}`}
                    />
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
