import { useState, type ReactNode } from 'react';
import { SidebarContext } from './SidebarContext';

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [fixedSidebarOpen, setFixedSidebarOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  return (
    <SidebarContext.Provider
      value={{
        fixedSidebarOpen,
        mobileSidebarOpen,
        setMobileSidebarOpen,
        setFixedSidebarOpen,
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
}
