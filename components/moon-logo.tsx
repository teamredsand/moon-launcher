import { cn } from "@/lib/utils";

/** Moon mark: a plain crescent. Fill follows text color. */
export function MoonLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={cn("size-5", className)}
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79Z" />
    </svg>
  );
}

export function MoonWordMark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <MoonLogo className="size-5 text-primary" />
      <span className="font-semibold tracking-tight">MoonLauncher</span>
    </span>
  );
}
