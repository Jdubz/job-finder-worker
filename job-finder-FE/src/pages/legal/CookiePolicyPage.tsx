import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function CookiePolicyPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-3xl font-bold">Cookie Policy</CardTitle>
          <p className="text-muted-foreground">Last updated: {new Date().toLocaleDateString()}</p>
        </CardHeader>
        <CardContent className="space-y-6">
          <section>
            <h2 className="text-2xl font-semibold mb-4">1. What Are Cookies</h2>
            <p className="text-muted-foreground leading-relaxed">
              Cookies are small text files that are placed on your computer or mobile device when
              you visit a website. They are widely used to make websites work more efficiently and
              to provide information to website owners.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">2. How We Use Cookies</h2>
            <p className="text-muted-foreground leading-relaxed">We use cookies to:</p>
            <ul className="list-disc list-inside text-muted-foreground mt-4 space-y-2">
              <li>Remember your preferences and settings</li>
              <li>Keep you signed in to your account</li>
              <li>Understand how you use our website</li>
              <li>Improve our services and user experience</li>
              <li>Provide personalized content and features</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">3. Types of Cookies We Use</h2>

            <div className="space-y-4">
              <div>
                <h3 className="text-xl font-semibold mb-2">Essential Cookies</h3>
                <p className="text-muted-foreground leading-relaxed">
                  These cookies are necessary for the website to function properly. They enable
                  basic functions like page navigation, access to secure areas, and remembering your
                  login status.
                </p>
              </div>

              <div>
                <h3 className="text-xl font-semibold mb-2">Performance Cookies</h3>
                <p className="text-muted-foreground leading-relaxed">
                  These cookies collect information about how visitors use our website, such as
                  which pages are visited most often. This helps us improve how our website works.
                </p>
              </div>

              <div>
                <h3 className="text-xl font-semibold mb-2">Functionality Cookies</h3>
                <p className="text-muted-foreground leading-relaxed">
                  These cookies allow the website to remember choices you make and provide enhanced,
                  more personal features.
                </p>
              </div>

              <div>
                <h3 className="text-xl font-semibold mb-2">Analytics Cookies</h3>
                <p className="text-muted-foreground leading-relaxed">
                  These cookies help us understand how our website is being used and how we can
                  improve it. They may track your activity across different websites.
                </p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">4. Third-Party Cookies</h2>
            <p className="text-muted-foreground leading-relaxed">
              Some cookies on our website are set by third-party services that appear on our pages.
              These may include:
            </p>
            <ul className="list-disc list-inside text-muted-foreground mt-4 space-y-2">
              <li>Analytics providers (Google Analytics, etc.)</li>
              <li>Social media platforms</li>
              <li>Advertising networks</li>
              <li>Content delivery networks</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">5. Managing Cookies</h2>
            <p className="text-muted-foreground leading-relaxed">
              You can control and manage cookies in several ways:
            </p>
            <ul className="list-disc list-inside text-muted-foreground mt-4 space-y-2">
              <li>Browser settings: Most browsers allow you to refuse or accept cookies</li>
              <li>Cookie preferences: Use our cookie preference center to manage your choices</li>
              <li>Opt-out tools: Use industry opt-out tools for advertising cookies</li>
              <li>Delete cookies: You can delete cookies that are already on your device</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">6. Impact of Disabling Cookies</h2>
            <p className="text-muted-foreground leading-relaxed">
              If you choose to disable cookies, some features of our website may not function
              properly. This may include:
            </p>
            <ul className="list-disc list-inside text-muted-foreground mt-4 space-y-2">
              <li>Inability to stay logged in</li>
              <li>Loss of personalized settings</li>
              <li>Reduced functionality of interactive features</li>
              <li>Inability to remember your preferences</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">7. Cookie Duration</h2>
            <p className="text-muted-foreground leading-relaxed">
              Cookies may be either "session" cookies or "persistent" cookies. Session cookies are
              temporary and are deleted when you close your browser. Persistent cookies remain on
              your device for a set period or until you delete them.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">8. Updates to This Policy</h2>
            <p className="text-muted-foreground leading-relaxed">
              We may update this cookie policy from time to time to reflect changes in our practices
              or for other operational, legal, or regulatory reasons. We will notify you of any
              material changes by posting the updated policy on our website.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">9. Contact Us</h2>
            <p className="text-muted-foreground leading-relaxed">
              If you have any questions about our use of cookies, please contact us through our
              support channels.
            </p>
          </section>
        </CardContent>
      </Card>
    </div>
  )
}
