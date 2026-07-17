"use client";

import { TabBar } from "@/components/TabBar";
import { KitchenView } from "@/components/kitchen/KitchenView";
import { useKitchenData } from "@/components/kitchen/useKitchenData";

export default function KitchenPage() {
  const { loading, data, reload } = useKitchenData();

  if (loading || !data) {
    return (
      <main className="mx-auto w-full flex min-h-dvh max-w-md items-center justify-center bg-(--bg)">
        <p className="animate-pulse text-(--ink)">Loading your kitchen...</p>
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
