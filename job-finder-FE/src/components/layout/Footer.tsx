import { Link } from "react-router-dom"
import { ROUTES } from "@/types/routes"

export function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer data-testid="footer" className="bg-muted/50 border-t">
      <div className="container mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Company Info */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Job Finder App Manager</h3>
            <p className="text-sm text-muted-foreground">
              Streamline your job search with intelligent application management and automated
              tools.
            </p>
          </div>

          {/* Quick Links */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Quick Links</h3>
            <ul className="space-y-2">
              <li>
                <Link
                  to={ROUTES.HOME}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Home
                </Link>
              </li>
              <li>
                <Link
                  to={ROUTES.HOW_IT_WORKS}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  How It Works
                </Link>
              </li>
              <li>
                <Link
                  to={ROUTES.CONTENT_ITEMS}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Content Items
                </Link>
              </li>
              <li>
                <Link
                  to={ROUTES.DOCUMENT_BUILDER}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Document Builder
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Legal</h3>
            <ul className="space-y-2">
              <li>
                <Link
                  to={ROUTES.TERMS_OF_USE}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Terms of Use
                </Link>
              </li>
              <li>
                <Link
                  to={ROUTES.PRIVACY_POLICY}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link
                  to={ROUTES.COOKIE_POLICY}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cookie Policy
                </Link>
              </li>
              <li>
                <Link
                  to={ROUTES.DISCLAIMER}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Disclaimer
                </Link>
              </li>
            </ul>
          </div>

          {/* Support */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Support</h3>
            <ul className="space-y-2">
              <li>
                <a
                  href="mailto:support@jobfinderapp.com"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Contact Support
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/your-org/job-finder-app"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  GitHub
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-8 pt-6 border-t border-border">
          <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
            <p className="text-sm text-muted-foreground">
              © {currentYear} Job Finder App Manager. All rights reserved.
            </p>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-muted-foreground">Made with ❤️ for job seekers</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
