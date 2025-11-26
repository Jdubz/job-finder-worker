import { TabsContent } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Plus, X } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { TabCard } from "../shared"
import type { TechnologyRank } from "@shared/types"
import type { ConfigState } from "../../hooks/useConfigState"

type TechnologyRanksTabProps = Pick<
  ConfigState,
  | "isSaving"
  | "currentTechRanks"
  | "newTechName"
  | "setNewTechName"
  | "newTechRank"
  | "setNewTechRank"
  | "newTechPoints"
  | "setNewTechPoints"
  | "hasTechRankChanges"
  | "updateTechRanksState"
  | "handleAddTechnology"
  | "handleSaveTechRanks"
  | "handleResetTechRanks"
>

export function TechnologyRanksTab({
  isSaving,
  currentTechRanks,
  newTechName,
  setNewTechName,
  newTechRank,
  setNewTechRank,
  newTechPoints,
  setNewTechPoints,
  hasTechRankChanges,
  updateTechRanksState,
  handleAddTechnology,
  handleSaveTechRanks,
  handleResetTechRanks,
}: TechnologyRanksTabProps) {
  return (
    <TabsContent value="tech" className="space-y-4 mt-4">
      <TabCard
        title="Technology Ranks"
        description="Weighting for technology importance in filtering"
        hasChanges={hasTechRankChanges}
        isSaving={isSaving}
        onSave={handleSaveTechRanks}
        onReset={handleResetTechRanks}
      >
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="missing-required">Missing Required Strike Points</Label>
            <Input
              id="missing-required"
              type="number"
              min="0"
              value={currentTechRanks.strikes?.missingAllRequired ?? 0}
              onChange={(e) =>
                updateTechRanksState((current) => ({
                  ...current,
                  strikes: {
                    ...current.strikes,
                    missingAllRequired: parseInt(e.target.value) || 0,
                  },
                }))
              }
            />
            <p className="text-xs text-gray-500">
              Points added when no required technologies are present in the job description.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="per-bad-tech">Per Strike Technology Points</Label>
            <Input
              id="per-bad-tech"
              type="number"
              min="0"
              value={currentTechRanks.strikes?.perBadTech ?? 0}
              onChange={(e) =>
                updateTechRanksState((current) => ({
                  ...current,
                  strikes: {
                    ...current.strikes,
                    perBadTech: parseInt(e.target.value) || 0,
                  },
                }))
              }
            />
            <p className="text-xs text-gray-500">
              Points added for each technology marked as &ldquo;strike&rdquo; that appears in
              the job post.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <Label>Technologies</Label>
            <p className="text-xs text-muted-foreground">
              Rank each technology and assign strike points.
            </p>
          </div>

          <div className="space-y-2">
            {Object.entries(currentTechRanks.technologies).sort(([a], [b]) =>
              a.localeCompare(b)
            ).map(([name, data]) => (
              <div key={name} className="grid grid-cols-8 gap-2 items-center">
                <div className="col-span-3 font-medium truncate" title={name}>
                  {name}
                </div>
                <div className="col-span-2">
                  <Select
                    value={data.rank}
                    onValueChange={(value) =>
                      updateTechRanksState((current) => ({
                        ...current,
                        technologies: {
                          ...current.technologies,
                          [name]: {
                            ...current.technologies[name],
                            rank: value as TechnologyRank["rank"],
                          },
                        },
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="required">Required</SelectItem>
                      <SelectItem value="ok">OK</SelectItem>
                      <SelectItem value="strike">Strike</SelectItem>
                      <SelectItem value="fail">Fail</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Input
                  type="number"
                  min="0"
                  value={data.points ?? 0}
                  onChange={(e) =>
                    updateTechRanksState((current) => ({
                      ...current,
                      technologies: {
                        ...current.technologies,
                        [name]: {
                          ...current.technologies[name],
                          points: parseInt(e.target.value) || 0,
                        },
                      },
                    }))
                  }
                />
                <Input
                  type="number"
                  min="0"
                  value={data.mentions ?? 0}
                  onChange={(e) =>
                    updateTechRanksState((current) => ({
                      ...current,
                      technologies: {
                        ...current.technologies,
                        [name]: {
                          ...current.technologies[name],
                          mentions: parseInt(e.target.value) || 0,
                        },
                      },
                    }))
                  }
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    updateTechRanksState((current) => {
                      const { [name]: _removed, ...rest } = current.technologies
                      return { ...current, technologies: rest }
                    })
                  }
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {Object.keys(currentTechRanks.technologies).length === 0 && (
              <p className="text-sm text-gray-500">No technologies configured yet.</p>
            )}
          </div>

          <div className="grid grid-cols-8 gap-2 items-center">
            <Input
              className="col-span-3"
              placeholder="Add technology..."
              value={newTechName}
              onChange={(e) => setNewTechName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddTechnology())}
            />
            <div className="col-span-2">
              <Select
                value={newTechRank}
                onValueChange={(value) => {
                  const rank = value as TechnologyRank["rank"]
                  setNewTechRank(rank)
                  if ((rank === "required" || rank === "ok") && newTechPoints !== 0) {
                    setNewTechPoints(0)
                  }
                  if (rank === "strike" && newTechPoints === 0) {
                    setNewTechPoints(2)
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="required">Required</SelectItem>
                  <SelectItem value="ok">OK</SelectItem>
                  <SelectItem value="strike">Strike</SelectItem>
                  <SelectItem value="fail">Fail</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Input
              type="number"
              min="0"
              value={newTechPoints}
              onChange={(e) => setNewTechPoints(parseInt(e.target.value) || 0)}
            />
            <div className="col-span-2 flex justify-end">
              <Button size="sm" onClick={handleAddTechnology}>
                <Plus className="h-4 w-4 mr-1" />
                Add Technology
              </Button>
            </div>
          </div>
        </div>
      </TabCard>
    </TabsContent>
  )
}
