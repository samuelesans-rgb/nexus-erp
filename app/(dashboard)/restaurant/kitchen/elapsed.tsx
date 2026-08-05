"use client";

import { useEffect, useState } from "react";

export default function ElapsedSince({ since }: { since: Date }) {
  const [minutes, setMinutes] = useState(0);

  useEffect(() => {
    const updateMinutes = () => {
      setMinutes(Math.max(0, Math.floor((Date.now() - since.getTime()) / 60000)));
    };

    updateMinutes();
    const interval = window.setInterval(updateMinutes, 30000);

    return () => {
      window.clearInterval(interval);
    };
  }, [since]);

  return <p className="text-sm">Inviato {minutes} minuti fa</p>;
}
