import { Camera, Keyboard } from 'lucide-react';
import { Button } from '../../../../../components/ui/button';
import { Input } from '../../../../../components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../../../components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../../../components/ui/tabs';
import { QRCodeScanner } from '../../../../../components/ui/QRCodeScanner';

interface InventoryScannerDialogProps {
  open: boolean;
  scanInput: string;
  onOpenChange: (open: boolean) => void;
  onScanInputChange: (value: string) => void;
  onProcessScan: (value: string) => void;
}

export function InventoryScannerDialog({
  open,
  scanInput,
  onOpenChange,
  onScanInputChange,
  onProcessScan,
}: InventoryScannerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>QR-Code Scanner</DialogTitle>
          <DialogDescription>Scanne einen Produkt- oder Nutzer-QR-Code.</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="camera" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="camera" className="gap-2">
              <Camera className="h-4 w-4" />
              Kamera
            </TabsTrigger>
            <TabsTrigger value="manual" className="gap-2">
              <Keyboard className="h-4 w-4" />
              Manuell
            </TabsTrigger>
          </TabsList>
          <TabsContent value="camera" className="py-4">
            <QRCodeScanner onScanSuccess={onProcessScan} active={open} />
          </TabsContent>
          <TabsContent value="manual" className="py-4 space-y-4">
            <div className="space-y-2">
              <Input
                placeholder="QR-Code Inhalt oder Token..."
                value={scanInput}
                onChange={(e) => onScanInputChange(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onProcessScan(scanInput)}
                autoFocus
              />
              <p className="text-[10px] text-muted-foreground">
                Beispiele:
                <br />
                - http://localhost:5173/products/view/ID
                <br />- bazarpro://user/TOKEN
              </p>
            </div>
            <Button className="w-full" onClick={() => onProcessScan(scanInput)}>
              Verarbeiten
            </Button>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="w-full sm:w-auto"
          >
            Abbrechen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
