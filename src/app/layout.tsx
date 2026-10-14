import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';
import { Providers } from '@/components/app/Providers';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Synovra Battery Intelligence', template: '%s · Synovra Battery Intelligence' },
  description:
    'A verifiable operational history for every lead-acid battery: intake, testing, restoration, qualification, deployment, monitoring and recycling. Demonstration build with synthetic data.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#112B40' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // The inline script marks script-capable pages before paint, so entrance motion never hides content without it.
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
      </head>
      <body className="min-h-screen antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-navy focus:shadow-pop"
        >
          Skip to main content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
