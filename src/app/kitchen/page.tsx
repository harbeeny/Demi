"use client";

import { TabBar } from "@/components/TabBar";
import { KitchenView } from "@/components/kitchen/KitchenView";
import { useKitchenData } from "@/components/kitchen/useKitchenData";

export default function KitchenPage() {
  const { loading, data, reload } = useKitchenData();

  if (loading || !data) {
    return (
      <main className="mx-auto w-full flex min-h-dvh max-w-md items-center justify-center bg-[#f4f6f2]">
        <p className="animate-pulse text-[#2c3a2e]">Loading your kitchen...</p>
        <TabBar />
      </main>
    );
  }

  return (
    <>
      <KitchenView data={data} onMutated={reload} />
      <TabBar />
    </>
  );
}
