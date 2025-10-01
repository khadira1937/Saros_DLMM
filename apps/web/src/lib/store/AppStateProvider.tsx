"use client";

import { ReactNode } from 'react';

interface AppStateProviderProps {
  children: ReactNode;
}

export default function AppStateProvider({ children }: AppStateProviderProps): JSX.Element {
  return <>{children}</>;
}
