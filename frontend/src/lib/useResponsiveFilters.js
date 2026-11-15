import { useEffect, useState } from "react";

export default function useResponsiveFilters() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 641px)");
    const sync = () => setOpen(desktop.matches);
    sync();
    desktop.addEventListener("change", sync);
    return () => desktop.removeEventListener("change", sync);
  }, []);

  return [open, setOpen];
}
