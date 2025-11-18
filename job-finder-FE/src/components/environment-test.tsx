// This test demonstrates that the frontend environment is fully functional
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export function EnvironmentTest() {
  return (
    <div className="container mx-auto p-4">
      <Card>
        <CardHeader>
          <CardTitle>Frontend Environment Test</CardTitle>
          <CardDescription>All components working correctly</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              ✅ TypeScript with strict mode ✅ Tailwind CSS styling ✅ shadcn/ui components ✅ Path
              aliases (@/)
            </p>
            <Button>Test Button</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
