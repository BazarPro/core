import { Search } from 'lucide-react';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Checkbox } from '../ui/checkbox';
import { Label } from '../ui/label';

interface EventFiltersProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  sortBy: string;
  onSortChange: (value: string) => void;
  showOnlyRegistered: boolean;
  onShowOnlyRegisteredChange: (value: boolean) => void;
  includePast: boolean;
  onIncludePastChange: (value: boolean) => void;
}

export function EventFilters({
  searchTerm,
  onSearchChange,
  sortBy,
  onSortChange,
  showOnlyRegistered,
  onShowOnlyRegisteredChange,
  includePast,
  onIncludePastChange,
}: EventFiltersProps) {
  return (
    <div className="bg-card rounded-lg border p-6 mb-6">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-10"
              placeholder="Events suchen..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>

          <Select value={sortBy} onValueChange={onSortChange}>
            <SelectTrigger className="justify-start">
              <span className="mr-1 text-xs text-muted-foreground">Sortieren nach:</span>
              <SelectValue placeholder="Bitte auswählen" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date-asc">Datum aufsteigend</SelectItem>
              <SelectItem value="date-desc">Datum absteigend</SelectItem>
              <SelectItem value="name">Name</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="only-registered"
              checked={showOnlyRegistered}
              onCheckedChange={(checked) => onShowOnlyRegisteredChange(checked === true)}
            />
            <Label
              htmlFor="only-registered"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
            >
              Nur meine Anmeldungen
            </Label>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="include-past"
              checked={includePast}
              onCheckedChange={(checked) => onIncludePastChange(checked === true)}
            />
            <Label
              htmlFor="include-past"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
            >
              Vergangene Veranstaltungen anzeigen
            </Label>
          </div>
        </div>
      </div>
    </div>
  );
}
