import { useEffect, useState } from "react";

type Orientation = "portrait" | "landscape";

export type ViewportSize = {
  width: number;
  height: number;
  orientation: Orientation;
};

const getViewportSize = (): ViewportSize => {
  if (typeof window === "undefined") {
    return { width: 0, height: 0, orientation: "landscape" };
  }

  const { innerWidth, innerHeight } = window;
  const orientation: Orientation = innerWidth < innerHeight ? "portrait" : "landscape";

  return { width: innerWidth, height: innerHeight, orientation };
};

export default function useViewportSize(): ViewportSize {
  const [viewportSize, setViewportSize] = useState<ViewportSize>(() => getViewportSize());

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const handleResize = () => setViewportSize(getViewportSize());

    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
    };
  }, []);

  return viewportSize;
}
