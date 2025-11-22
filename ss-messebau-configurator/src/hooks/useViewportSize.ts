import { useEffect, useState } from "react";

type Orientation = "portrait" | "landscape";

type ViewportSize = {
  width: number;
  height: number;
  orientation: Orientation;
};

function getViewportSize(): ViewportSize {
  if (typeof window === "undefined") {
    return { width: 0, height: 0, orientation: "landscape" };
  }

  const width = window.innerWidth;
  const height = window.innerHeight;
  const orientation: Orientation = width < height ? "portrait" : "landscape";

  return { width, height, orientation };
}

export default function useViewportSize(): ViewportSize {
  const [viewport, setViewport] = useState<ViewportSize>(() => getViewportSize());

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleResize = () => {
      setViewport(getViewportSize());
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
    };
  }, []);

  return viewport;
}
