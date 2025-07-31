
import { OrthoDashboard } from "@/components/ortho-dashboard";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      <main className="flex-1 w-full p-4 mx-auto md:p-8 max-w-7xl">
        <OrthoDashboard />
      </main>
    </div>
  );
}
