import type { RefRequirementsByDay } from '../../engine/types.ts'
import { formatMinutes } from '../../lib/time.ts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface RefRequirementsReportProps {
  requirements: RefRequirementsByDay[] | undefined
}

export function RefRequirementsReport({ requirements }: RefRequirementsReportProps) {
  // Demand derives from placements, so a row exists per day whether or not
  // anything is placed. All-zero peaks mean nothing is placed, not "no data".
  const hasDemand = requirements?.some((req) => req.peak_total_refs > 0) ?? false

  if (!requirements || requirements.length === 0 || !hasDemand) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-muted-foreground">Referee Requirements</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No referee demand — nothing is placed yet.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Referee Requirements</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Day</TableHead>
                <TableHead className="text-right">Peak Total Refs</TableHead>
                <TableHead className="text-right">Peak Saber-Capable</TableHead>
                <TableHead className="text-right">FE-Only Refs</TableHead>
                <TableHead className="text-right">Peak Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requirements.map((req) => (
                <TableRow key={req.day}>
                  <TableCell className="font-medium">Day {req.day + 1}</TableCell>
                  <TableCell className="text-right">{req.peak_total_refs}</TableCell>
                  <TableCell className="text-right">{req.peak_saber_refs}</TableCell>
                  <TableCell className="text-right">
                    {req.peak_total_refs - req.peak_saber_refs}
                  </TableCell>
                  <TableCell className="text-right">{formatMinutes(req.peak_time)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
