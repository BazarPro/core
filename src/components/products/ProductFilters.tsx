import { SlidersHorizontal, Search, CheckSquare } from 'lucide-react';
import { useMemo, useState, useEffect } from 'react';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

interface ProductFiltersProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  filterEvent?: string;
  onFilterEventChange?: (value: string) => void;
  events?: { _id: string; title: string }[];
  eventSelectionMode?: boolean;
  filterStatus?: string;
  onFilterStatusChange?: (value: string) => void;
  sortBy: string;
  onSortChange: (value: string) => void;
  showEventFilter?: boolean;
  showStatusFilter?: boolean;
  minPrice?: string;
  onMinPriceChange?: (value: string) => void;
  maxPrice?: string;
  onMaxPriceChange?: (value: string) => void;
  filterCategory?: string;
  onFilterCategoryChange?: (value: string) => void;
  categories?: { _id: string; label: string }[];
  showBulkSelection?: boolean;
  onToggleBulkSelection?: () => void;
}

export function ProductFilters({
  searchTerm,
  onSearchChange,
  filterEvent,
  onFilterEventChange,
  events = [],
  eventSelectionMode = false,
  filterStatus,
  onFilterStatusChange,
  sortBy,
  onSortChange,
  showEventFilter = true,
  showStatusFilter = true,
  minPrice,
  onMinPriceChange,
  maxPrice,
  onMaxPriceChange,
  filterCategory,
  onFilterCategoryChange,
  categories = [],
  showBulkSelection,
  onToggleBulkSelection,
}: ProductFiltersProps) {
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const isCompact = false;
  const hasAdvancedFilterSelection = useMemo(
    () =>
      (showEventFilter && filterEvent && filterEvent !== 'all') ||
      (showStatusFilter && filterStatus && filterStatus !== 'all') ||
      (filterCategory && filterCategory !== 'all') ||
      (sortBy && sortBy !== 'name' && sortBy !== 'discount') ||
      !!minPrice ||
      !!maxPrice,
    [
      showEventFilter,
      filterEvent,
      showStatusFilter,
      filterStatus,
      filterCategory,
      sortBy,
      minPrice,
      maxPrice,
    ]
  );

  useEffect(() => {
    if (eventSelectionMode || showBulkSelection) {
      setShowAdvancedFilters(false);
    }
  }, [eventSelectionMode, showBulkSelection]);

  return (
    <div className={`bg-card/95 rounded-lg border ${isCompact ? 'p-3 sm:p-4' : 'p-3 sm:p-4'} mb-4`}>
      <div className={`flex items-center gap-2 ${isCompact ? 'mb-3' : 'mb-4'}`}>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-10"
            placeholder="Suchen..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={showAdvancedFilters || hasAdvancedFilterSelection ? 'default' : 'outline'}
            className="h-9 w-9 p-0 sm:h-9 sm:w-auto sm:px-3"
            onClick={() => setShowAdvancedFilters((prev) => !prev)}
            aria-label={showAdvancedFilters ? 'Filter ausblenden' : 'Filter anzeigen'}
          >
            <SlidersHorizontal className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">
              {showAdvancedFilters ? 'Filter ausblenden' : 'Filter anzeigen'}
            </span>
          </Button>
          {onToggleBulkSelection && (
            <Button
              type="button"
              variant={showBulkSelection ? 'default' : 'outline'}
              className="h-9 w-9 p-0 sm:h-9 sm:w-auto sm:px-3"
              onClick={onToggleBulkSelection}
              aria-label="Mehrfachauswahl"
            >
              <CheckSquare className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Mehrfachauswahl</span>
            </Button>
          )}
        </div>
      </div>

      {showAdvancedFilters && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
          {showEventFilter && onFilterEventChange && (
            <Select value={filterEvent} onValueChange={onFilterEventChange}>
              <SelectTrigger>
                <SelectValue placeholder="Veranstaltung" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Veranstaltungen</SelectItem>
                {events.map((event) => (
                  <SelectItem key={event._id} value={event._id}>
                    {event.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {onFilterCategoryChange && (
            <Select value={filterCategory} onValueChange={onFilterCategoryChange}>
              <SelectTrigger>
                <SelectValue placeholder="Kategorie" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Kategorien</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category._id} value={category._id}>
                    {category.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {showStatusFilter && onFilterStatusChange && (
            <Select value={filterStatus} onValueChange={onFilterStatusChange}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Status</SelectItem>
                <SelectItem value="available">Verfügbar</SelectItem>
                <SelectItem value="sold">Verkauft</SelectItem>
              </SelectContent>
            </Select>
          )}

          <Select value={sortBy} onValueChange={onSortChange}>
            <SelectTrigger className="justify-start">
              <span className="mr-1 text-xs text-muted-foreground">Sortieren nach:</span>
              <SelectValue placeholder="Bitte auswählen" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="discount">Rabatt (höchster zuerst)</SelectItem>
              <SelectItem value="name">Name</SelectItem>
              <SelectItem value="price-asc">Preis aufsteigend</SelectItem>
              <SelectItem value="price-desc">Preis absteigend</SelectItem>
            </SelectContent>
          </Select>

          {onMinPriceChange && (
            <Input
              type="number"
              placeholder="Min. Preis"
              value={minPrice}
              onChange={(e) => onMinPriceChange(e.target.value)}
              min="0"
            />
          )}

          {onMaxPriceChange && (
            <Input
              type="number"
              placeholder="Max. Preis"
              value={maxPrice}
              onChange={(e) => onMaxPriceChange(e.target.value)}
              min="0"
            />
          )}
        </div>
      )}
    </div>
  );
}
