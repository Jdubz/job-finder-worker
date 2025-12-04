import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function TermsOfUsePage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-3xl font-bold">Terms of Use</CardTitle>
          <p className="text-muted-foreground">Last updated: {new Date().toLocaleDateString()}</p>
        </CardHeader>
        <CardContent className="space-y-6">
          <section>
            <h2 className="text-2xl font-semibold mb-4">1. Acceptance of Terms</h2>
            <p className="text-muted-foreground leading-relaxed">
              By accessing and using the Job Finder App Manager ("Service"), you accept and agree to
              be bound by the terms and provision of this agreement. If you do not agree to abide by
              the above, please do not use this service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">2. Use License</h2>
            <p className="text-muted-foreground leading-relaxed">
              Permission is granted to temporarily download one copy of the materials on Job Finder
              App Manager for personal, non-commercial transitory viewing only. This is the grant of
              a license, not a transfer of title, and under this license you may not:
            </p>
            <ul className="list-disc list-inside text-muted-foreground mt-4 space-y-2">
              <li>modify or copy the materials</li>
              <li>use the materials for any commercial purpose or for any public display</li>
              <li>attempt to reverse engineer any software contained on the website</li>
              <li>remove any copyright or other proprietary notations from the materials</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">3. User Accounts</h2>
            <p className="text-muted-foreground leading-relaxed">
              When you create an account with us, you must provide information that is accurate,
              complete, and current at all times. You are responsible for safeguarding the password
              and for all activities that occur under your account.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">4. Prohibited Uses</h2>
            <p className="text-muted-foreground leading-relaxed">You may not use our service:</p>
            <ul className="list-disc list-inside text-muted-foreground mt-4 space-y-2">
              <li>For any unlawful purpose or to solicit others to perform unlawful acts</li>
              <li>
                To violate any international, federal, provincial, or state regulations, rules,
                laws, or local ordinances
              </li>
              <li>
                To infringe upon or violate our intellectual property rights or the intellectual
                property rights of others
              </li>
              <li>
                To harass, abuse, insult, harm, defame, slander, disparage, intimidate, or
                discriminate
              </li>
              <li>To submit false or misleading information</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">5. Content</h2>
            <p className="text-muted-foreground leading-relaxed">
              Our service allows you to post, link, store, share and otherwise make available
              certain information, text, graphics, videos, or other material ("Content"). You are
              responsible for the Content that you post to the Service, including its legality,
              reliability, and appropriateness.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">6. Termination</h2>
            <p className="text-muted-foreground leading-relaxed">
              We may terminate or suspend your account and bar access to the Service immediately,
              without prior notice or liability, under our sole discretion, for any reason
              whatsoever and without limitation, including but not limited to a breach of the Terms.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">7. Disclaimer</h2>
            <p className="text-muted-foreground leading-relaxed">
              The information on this website is provided on an "as is" basis. To the fullest extent
              permitted by law, this Company excludes all representations, warranties, conditions
              and terms relating to our website and the use of this website.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">8. Limitation of Liability</h2>
            <p className="text-muted-foreground leading-relaxed">
              In no event shall Job Finder App Manager, nor its directors, employees, partners,
              agents, suppliers, or affiliates, be liable for any indirect, incidental, special,
              consequential, or punitive damages, including without limitation, loss of profits,
              data, use, goodwill, or other intangible losses, resulting from your use of the
              Service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">9. Governing Law</h2>
            <p className="text-muted-foreground leading-relaxed">
              These Terms shall be interpreted and governed by the laws of the United States,
              without regard to its conflict of law provisions. Our failure to enforce any right or
              provision of these Terms will not be considered a waiver of those rights.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">10. Changes to Terms</h2>
            <p className="text-muted-foreground leading-relaxed">
              We reserve the right, at our sole discretion, to modify or replace these Terms at any
              time. If a revision is material, we will provide at least 30 days notice prior to any
              new terms taking effect.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">11. Contact Information</h2>
            <p className="text-muted-foreground leading-relaxed">
              If you have any questions about these Terms of Use, please contact us through our
              support channels.
            </p>
          </section>
        </CardContent>
      </Card>
    </div>
  )
}
