"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

/**
 * Redirect /app/packs to /app/feed?view=catchup
 * The catch-up functionality has been integrated into the Feed page.
 */
export default function PacksRedirectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const topic = searchParams.get("topic");

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("view", "catchup");
    if (topic) params.set("topic", topic);
    router.replace(`/app/feed?${params.toString()}`);
  }, [router, topic]);

  return (
    <div style={{ padding: "2rem", textAlign: "center" }}>
      <p>Redirecting to Feed...</p>
    </div>
  );
}
