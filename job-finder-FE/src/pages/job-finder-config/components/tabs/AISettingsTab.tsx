import { TabsContent } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { TabCard } from "../shared"
import type { AISettings } from "@shared/types"
import type { ConfigState } from "../../hooks/useConfigState"

type AISettingsTabProps = Pick<
  ConfigState,
  | "isSaving"
  | "aiSettings"
  | "setAISettings"
  | "hasAIChanges"
  | "handleSaveAISettings"
  | "handleResetAISettings"
>

export function AISettingsTab({
  isSaving,
  aiSettings,
  setAISettings,
  hasAIChanges,
  handleSaveAISettings,
  handleResetAISettings,
}: AISettingsTabProps) {
  return (
    <TabsContent value="ai" className="space-y-4 mt-4">
      <TabCard
        title="AI Configuration"
        description="Configure AI provider, model selection, and matching parameters"
        hasChanges={hasAIChanges}
        isSaving={isSaving}
        onSave={handleSaveAISettings}
        onReset={handleResetAISettings}
      >
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="provider">AI Provider</Label>
            <Select
              value={aiSettings?.provider || "claude"}
              onValueChange={(value) =>
                setAISettings((prev: AISettings | null) =>
                  prev ? { ...prev, provider: value as "claude" | "openai" | "gemini" } : null
                )
              }
            >
              <SelectTrigger id="provider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="claude">Claude (Anthropic)</SelectItem>
                <SelectItem value="openai">OpenAI (GPT)</SelectItem>
                <SelectItem value="gemini">Google Gemini</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500">
              AI provider for job matching and document generation
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="model">Model</Label>
            <Input
              id="model"
              value={aiSettings?.model || "claude-sonnet-4"}
              onChange={(e) =>
                setAISettings((prev: AISettings | null) =>
                  prev ? { ...prev, model: e.target.value } : null
                )
              }
              placeholder="e.g., claude-sonnet-4, gpt-4, gemini-pro"
            />
            <p className="text-xs text-gray-500">Specific model version to use</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="minMatchScore">Minimum Match Score</Label>
            <Input
              id="minMatchScore"
              type="number"
              min="0"
              max="100"
              value={aiSettings?.minMatchScore || 70}
              onChange={(e) =>
                setAISettings((prev: AISettings | null) =>
                  prev ? { ...prev, minMatchScore: parseInt(e.target.value) || 70 } : null
                )
              }
            />
            <p className="text-xs text-gray-500">
              Minimum score required to create a job match (0-100)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="generateIntake">Generate Intake Data</Label>
            <Select
              value={aiSettings?.generateIntakeData ? "yes" : "no"}
              onValueChange={(value) =>
                setAISettings((prev: AISettings | null) =>
                  prev ? { ...prev, generateIntakeData: value === "yes" } : null
                )
              }
            >
              <SelectTrigger id="generateIntake">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="yes">Yes</SelectItem>
                <SelectItem value="no">No</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500">Toggle AI resume intake generation</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="portlandBonus">Portland Office Bonus</Label>
            <Input
              id="portlandBonus"
              type="number"
              value={aiSettings?.portlandOfficeBonus ?? 15}
              onChange={(e) =>
                setAISettings((prev: AISettings | null) =>
                  prev
                    ? { ...prev, portlandOfficeBonus: parseInt(e.target.value) || 0 }
                    : null
                )
              }
            />
            <p className="text-xs text-gray-500">Bonus points for Portland offices</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="userTimezone">User Timezone Offset</Label>
            <Input
              id="userTimezone"
              type="number"
              step="0.5"
              value={aiSettings?.userTimezone ?? -8}
              onChange={(e) =>
                setAISettings((prev: AISettings | null) =>
                  prev
                    ? { ...prev, userTimezone: parseFloat(e.target.value) }
                    : null
                )
              }
            />
            <p className="text-xs text-gray-500">Offset from UTC (e.g., -8 for PT)</p>
          </div>
        </div>
      </TabCard>
    </TabsContent>
  )
}
