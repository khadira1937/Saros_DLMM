"use client";

import { ReactNode } from 'react';
import { Toaster } from 'react-hot-toast';

interface ToastProviderProps {
  children: ReactNode;
}

export default function ToastProvider({ children }: ToastProviderProps): JSX.Element {
  return (
    <>
      <Toaster position="bottom-right" toastOptions={{ duration: 4000 }} />
      {children}
    </>
  );
}
