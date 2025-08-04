"use client";

import { Inter } from "next/font/google";
import { Sidebar } from "@/components/layout/Sidebar";
import { ServerProvider, useServerContext } from "@/app/context/Servercontext";
import "../app/globals.css";

const inter = Inter({ subsets: ["latin"] });

function LayoutContent({ children }: { children: React.ReactNode }) {
  const { zones, activeServer, setActiveServer } = useServerContext();

  return (
    <div className="flex min-h-screen">
      <Sidebar
        zones={zones}
        activeServer={activeServer}
        onSelectServer={setActiveServer}
      />
      <main className="flex-1">
        {children}
      </main>
    </div>
  );
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${inter.className} font-sans bg-slate-950 text-slate-300`}>
        <ServerProvider>
          <LayoutContent>
            {children}
          </LayoutContent>
        </ServerProvider>
      </body>
    </html>
  );
}