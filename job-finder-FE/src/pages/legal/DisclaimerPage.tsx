import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function DisclaimerPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-3xl font-bold">Disclaimer</CardTitle>
          <p className="text-muted-foreground">Last updated: {new Date().toLocaleDateString()}</p>
        </CardHeader>
        <CardContent className="space-y-6">
          <section>
            <h2 className="text-2xl font-semibold mb-4">1. General Information</h2>
            <p className="text-muted-foreground leading-relaxed">
              The information on this website is provided on an "as is" basis. To the fullest extent
              permitted by law, Job Finder App Manager excludes all representations, warranties,
              conditions and terms relating to our website and the use of this website.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">2. No Warranty</h2>
            <p className="text-muted-foreground leading-relaxed">
              We make no warranties, expressed or implied, and hereby disclaim and negate all other
              warranties including, without limitation, implied warranties or conditions of
              merchantability, fitness for a particular purpose, or non-infringement of intellectual
              property or other violation of rights.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">3. Accuracy of Information</h2>
            <p className="text-muted-foreground leading-relaxed">
              While we strive to provide accurate and up-to-date information, we make no
              representations or warranties of any kind, express or implied, about the completeness,
              accuracy, reliability, suitability, or availability of the website or the information,
              products, services, or related graphics contained on the website.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">4. Job Search Results</h2>
            <p className="text-muted-foreground leading-relaxed">
              Our service provides job search assistance and application management tools. We do not
              guarantee:
            </p>
            <ul className="list-disc list-inside text-muted-foreground mt-4 space-y-2">
              <li>Job availability or accuracy of job postings</li>
              <li>Success in job applications or interviews</li>
              <li>Employment opportunities or job offers</li>
              <li>Compatibility with specific employers or positions</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">5. Third-Party Content</h2>
            <p className="text-muted-foreground leading-relaxed">
              Our website may contain links to third-party websites or services. We are not
              responsible for the content, privacy policies, or practices of any third-party
              websites or services. The inclusion of any link does not imply endorsement by us.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">6. Limitation of Liability</h2>
            <p className="text-muted-foreground leading-relaxed">
              In no event shall Job Finder App Manager, nor its directors, employees, partners,
              agents, suppliers, or affiliates, be liable for any indirect, incidental, special,
              consequential, or punitive damages, including without limitation, loss of profits,
              data, use, goodwill, or other intangible losses, resulting from your use of the
              Service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">7. Professional Advice</h2>
            <p className="text-muted-foreground leading-relaxed">
              The information provided on this website is for general informational purposes only
              and should not be considered as professional career advice, legal advice, or any other
              type of professional advice. You should consult with appropriate professionals for
              advice specific to your situation.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">8. Service Availability</h2>
            <p className="text-muted-foreground leading-relaxed">
              We do not guarantee that our service will be available at all times. The service may
              be temporarily unavailable due to maintenance, updates, or technical issues. We are
              not liable for any inconvenience or loss resulting from service unavailability.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">9. User Responsibility</h2>
            <p className="text-muted-foreground leading-relaxed">Users are responsible for:</p>
            <ul className="list-disc list-inside text-muted-foreground mt-4 space-y-2">
              <li>Verifying the accuracy of information before acting on it</li>
              <li>Conducting their own research and due diligence</li>
              <li>Making informed decisions about their career and job search</li>
              <li>Complying with applicable laws and regulations</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">10. Changes to Disclaimer</h2>
            <p className="text-muted-foreground leading-relaxed">
              We reserve the right to modify this disclaimer at any time. Changes will be effective
              immediately upon posting on the website. Your continued use of the service after any
              changes constitutes acceptance of the new disclaimer.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">11. Contact Information</h2>
            <p className="text-muted-foreground leading-relaxed">
              If you have any questions about this disclaimer, please contact us through our support
              channels.
            </p>
          </section>
        </CardContent>
      </Card>
    </div>
  )
}
