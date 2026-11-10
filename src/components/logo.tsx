import { cn } from "./ui";

/** Official FAABRA mark — used in shell, splash, and fallbacks. */
export function LogoMark({ className, size = 36 }: { className?: string; size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo.png"
      alt="FAABRA"
      width={size}
      height={size}
      className={cn("shrink-0 rounded-[22%] object-cover shadow-sm", className)}
      draggable={false}
    />
  );
}
