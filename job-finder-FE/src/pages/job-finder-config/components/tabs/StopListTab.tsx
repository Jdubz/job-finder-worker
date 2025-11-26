import { TabsContent } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Plus, X } from "lucide-react"
import { TabCard } from "../shared"
import type { ConfigState } from "../../hooks/useConfigState"

type StopListTabProps = Pick<
  ConfigState,
  | "isSaving"
  | "stopList"
  | "newCompany"
  | "setNewCompany"
  | "newKeyword"
  | "setNewKeyword"
  | "newDomain"
  | "setNewDomain"
  | "hasStopListChanges"
  | "handleAddCompany"
  | "handleRemoveCompany"
  | "handleAddKeyword"
  | "handleRemoveKeyword"
  | "handleAddDomain"
  | "handleRemoveDomain"
  | "handleSaveStopList"
  | "handleResetStopList"
>

export function StopListTab({
  isSaving,
  stopList,
  newCompany,
  setNewCompany,
  newKeyword,
  setNewKeyword,
  newDomain,
  setNewDomain,
  hasStopListChanges,
  handleAddCompany,
  handleRemoveCompany,
  handleAddKeyword,
  handleRemoveKeyword,
  handleAddDomain,
  handleRemoveDomain,
  handleSaveStopList,
  handleResetStopList,
}: StopListTabProps) {
  return (
    <TabsContent value="stop-list" className="space-y-4 mt-4">
      <TabCard
        title="Excluded Companies"
        description="Companies to exclude from job matching and processing"
        hasChanges={hasStopListChanges}
        isSaving={isSaving}
        onSave={handleSaveStopList}
        onReset={handleResetStopList}
      >
        {/* Companies */}
        <div className="space-y-3">
          <Label>Companies</Label>
          <div className="flex gap-2">
            <Input
              data-testid="stoplist-company-input"
              placeholder="Enter company name..."
              value={newCompany}
              onChange={(e) => setNewCompany(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleAddCompany()}
            />
            <Button data-testid="stoplist-company-add" onClick={handleAddCompany} size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {(stopList?.excludedCompanies || []).map((company) => (
              <Badge key={company} variant="secondary" className="pl-3 pr-1 py-1">
                {company}
                <button
                  onClick={() => handleRemoveCompany(company)}
                  className="ml-2 hover:bg-gray-300 rounded-full p-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            {(!stopList?.excludedCompanies || stopList.excludedCompanies.length === 0) && (
              <p className="text-sm text-gray-500">No excluded companies</p>
            )}
          </div>
        </div>

        {/* Keywords */}
        <div className="space-y-3">
          <Label>Keywords</Label>
          <div className="flex gap-2">
            <Input
              data-testid="stoplist-keyword-input"
              placeholder="Enter keyword..."
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleAddKeyword()}
            />
            <Button data-testid="stoplist-keyword-add" onClick={handleAddKeyword} size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {(stopList?.excludedKeywords || []).map((keyword) => (
              <Badge key={keyword} variant="secondary" className="pl-3 pr-1 py-1">
                {keyword}
                <button
                  onClick={() => handleRemoveKeyword(keyword)}
                  className="ml-2 hover:bg-gray-300 rounded-full p-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            {(!stopList?.excludedKeywords || stopList.excludedKeywords.length === 0) && (
              <p className="text-sm text-gray-500">No excluded keywords</p>
            )}
          </div>
        </div>

        {/* Domains */}
        <div className="space-y-3">
          <Label>Domains</Label>
          <div className="flex gap-2">
            <Input
              data-testid="stoplist-domain-input"
              placeholder="Enter domain (e.g., example.com)..."
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleAddDomain()}
            />
            <Button data-testid="stoplist-domain-add" onClick={handleAddDomain} size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {(stopList?.excludedDomains || []).map((domain) => (
              <Badge key={domain} variant="secondary" className="pl-3 pr-1 py-1">
                {domain}
                <button
                  onClick={() => handleRemoveDomain(domain)}
                  className="ml-2 hover:bg-gray-300 rounded-full p-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            {(!stopList?.excludedDomains || stopList.excludedDomains.length === 0) && (
              <p className="text-sm text-gray-500">No excluded domains</p>
            )}
          </div>
        </div>
      </TabCard>
    </TabsContent>
  )
}
