
import { OrthoDashboard } from "@/components/ortho-dashboard";
import { Logo } from "@/components/icons/logo";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      <header className="sticky top-0 z-10 flex items-center justify-between h-16 px-4 md:px-8 border-b bg-background/80 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <Logo className="w-8 h-8 text-primary" />
          <h1 className="text-2xl font-bold font-headline text-primary">
            OrthoPrecision
          </h1>
        </div>
      </header>
      <main className="flex-1 w-full p-4 mx-auto md:p-8 max-w-7xl">
        <OrthoDashboard />
      </main>
      <footer className="px-8 py-4 text-sm text-center border-t text-muted-foreground">
        © {new Date().getFullYear()} OrthoPrecision. All Rights Reserved.
      </footer>
    </div>
  );
}

    