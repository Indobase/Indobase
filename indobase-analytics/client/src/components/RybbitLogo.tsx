import Image from "next/image";
import { useEffect, useState } from "react";
import { useWhiteLabel } from "../hooks/useIsWhiteLabel";
import { Skeleton } from "./ui/skeleton";

const HORIZONTAL_LOGO_ASPECT_RATIO = 500 / 100.27;

function getTextLogoHeight(width: number, height?: number) {
  return height && height > 0 ? height : Math.round(width / HORIZONTAL_LOGO_ASPECT_RATIO);
}

export function RybbitLogo({ width = 32, height = 32 }: { width?: number; height?: number }) {
  const { whiteLabelImage, isPending } = useWhiteLabel();
  const [mounted, setMounted] = useState(false);
  const imageStyle = { width, height, objectFit: "contain" as const };

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || isPending) {
    return <Skeleton style={{ width, height }} />;
  }

  if (whiteLabelImage) {
    return <Image src={whiteLabelImage} alt="Indobase Analytics" width={width} height={height} style={imageStyle} />;
  }

  return (
    <Image
      src="/indobase/logo.svg"
      alt="Indobase Analytics"
      width={width}
      height={height}
      style={imageStyle}
    />
  );
}

export function RybbitTextLogo({ width = 150, height }: { width?: number; height?: number }) {
  const { whiteLabelImage, isPending } = useWhiteLabel();
  const [mounted, setMounted] = useState(false);
  const resolvedHeight = getTextLogoHeight(width, height);
  const imageStyle = { width, height: resolvedHeight, objectFit: "contain" as const };

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || isPending) {
    return <Skeleton style={{ width, height: resolvedHeight }} />;
  }

  if (whiteLabelImage) {
    return (
      <Image
        src={whiteLabelImage}
        alt="Indobase Analytics"
        width={width}
        height={resolvedHeight}
        style={imageStyle}
        loading="eager"
      />
    );
  }

  // Prefer mark + text over dark-washed wordmark SVG paths.
  return (
    <span
      className="inline-flex items-center gap-2 text-neutral-900 dark:text-neutral-50 font-semibold tracking-tight"
      style={{ height: resolvedHeight }}
    >
      <Image
        src="/indobase/logo.svg"
        alt=""
        width={Math.round(resolvedHeight)}
        height={Math.round(resolvedHeight)}
        style={{ width: resolvedHeight, height: resolvedHeight }}
        loading="eager"
      />
      <span style={{ fontSize: Math.max(12, Math.round(resolvedHeight * 0.55)) }}>Indobase Analytics</span>
    </span>
  );
}
