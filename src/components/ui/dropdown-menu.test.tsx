import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from './dropdown-menu';

describe('DropdownMenu', () => {
  test('renders every part of an open menu', () => {
    render(
      <DropdownMenu open>
        <DropdownMenuTrigger>Aktionen</DropdownMenuTrigger>
        <DropdownMenuPortal />
        <DropdownMenuContent>
          <DropdownMenuLabel inset>Artikel</DropdownMenuLabel>
          <DropdownMenuGroup>
            <DropdownMenuItem inset>
              Bearbeiten <DropdownMenuShortcut>⌘E</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive">Löschen</DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem checked>Rabatt erlaubt</DropdownMenuCheckboxItem>
          <DropdownMenuRadioGroup value="small">
            <DropdownMenuRadioItem value="small">Kleine Etiketten</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="standard">Große Etiketten</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSub open>
            <DropdownMenuSubTrigger inset>Mehr</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem>Duplizieren</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>
    );
    expect(screen.getByRole('menuitem', { name: 'Löschen' })).toHaveAttribute(
      'data-variant',
      'destructive'
    );
    expect(screen.getByRole('menuitemcheckbox', { name: 'Rabatt erlaubt' })).toBeChecked();
    expect(screen.getByRole('menuitemradio', { name: 'Kleine Etiketten' })).toBeChecked();
    expect(screen.getByText('⌘E')).toHaveAttribute('data-slot', 'dropdown-menu-shortcut');
    expect(screen.getByRole('menuitem', { name: 'Duplizieren' })).toBeInTheDocument();
  });
});
