import { ShoppingBag } from 'lucide-react';
import { Link } from 'react-router-dom';

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="py-12 border-t">
      <div className="container mx-auto px-4">
        <div className="grid md:grid-cols-4 gap-8">
          <div>
            <Link
              to="/"
              className="flex items-center gap-2 mb-4 hover:opacity-80 transition-opacity"
            >
              <ShoppingBag className="h-6 w-6 text-primary" />
              <span className="text-xl">BazarPro</span>
            </Link>
            <p className="text-sm text-muted-foreground">
              Die moderne Plattform für Marktplatz-Veranstaltungen
            </p>
          </div>
          <div>
            <h4 className="mb-4">Produkt</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link to="/features" className="hover:text-primary">
                  Features
                </Link>
              </li>
              <li>
                <Link to="/pricing" className="hover:text-primary">
                  Preise
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="mb-4">Unternehmen</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link to="/about" className="hover:text-primary">
                  Über uns
                </Link>
              </li>
              <li>
                <Link to="/contact" className="hover:text-primary">
                  Kontakt
                </Link>
              </li>
              <li>
                <a
                  href="https://github.com/BazarPro/core"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary"
                >
                  GitHub
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="mb-4">Rechtliches</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link to="/privacy" className="hover:text-primary">
                  Datenschutz
                </Link>
              </li>
              <li>
                <Link to="/terms" className="hover:text-primary">
                  AGB
                </Link>
              </li>
              <li>
                <Link to="/imprint" className="hover:text-primary">
                  Impressum
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-12 pt-8 border-t text-center text-sm text-muted-foreground">
          <p>© {currentYear} BazarPro. Alle Rechte vorbehalten.</p>
          {import.meta.env.VITE_APP_VERSION && (
            <p className="mt-1 text-xs opacity-50">Version {import.meta.env.VITE_APP_VERSION}</p>
          )}
        </div>
      </div>
    </footer>
  );
}
