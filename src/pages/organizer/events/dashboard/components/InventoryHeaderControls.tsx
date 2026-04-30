import { CheckCircle2, QrCode, Search } from 'lucide-react';
import { Badge } from '../../../../../components/ui/badge';
import { Button } from '../../../../../components/ui/button';
import { Input } from '../../../../../components/ui/input';

interface InventoryHeaderControlsProps {
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  onOpenScanner: () => void;
}

export function InventoryHeaderControls({
  searchTerm,
  onSearchTermChange,
  onOpenScanner,
}: InventoryHeaderControlsProps) {
  return (
    <div className="bg-card rounded-lg border shadow-sm p-4 md:p-6 mb-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        <div className="space-y-4">
          <Button
            size="lg"
            className="w-full h-24 text-xl gap-4 rounded-lg"
            onClick={onOpenScanner}
          >
            <QrCode className="h-8 w-8" />
            QR-Code Scannen
          </Button>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-10 h-12 text-base rounded-lg"
              placeholder="Manuelle Suche nach Produktname..."
              value={searchTerm}
              onChange={(e) => onSearchTermChange(e.target.value)}
            />
          </div>
        </div>

        <div className="bg-muted/50 rounded-lg p-6 border border-dashed border-muted-foreground/20">
          <h3 className="font-semibold mb-2 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            Schnellzugriff
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            Nutze den Scanner für die schnellste Bearbeitung. Du kannst sowohl Produkt-URLs als auch
            Nutzer-Tokens verarbeiten.
          </p>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="bg-background">
              Warenannahme
            </Badge>
            <Badge variant="outline" className="bg-background">
              Direktverkauf
            </Badge>
            <Badge variant="outline" className="bg-background">
              Rückgabe
            </Badge>
          </div>
        </div>
      </div>
    </div>
  );
}
