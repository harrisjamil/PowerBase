"use client"

type PageLoaderProps = {
  /** Visible helper text under the spinner */
  message?: string
}

export default function PageLoader({
  message = "Loading",
}: PageLoaderProps) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-5 bg-background px-4">
      <div
        className="size-9 rounded-full border-2 border-muted border-t-primary motion-reduce:border-primary motion-reduce:animate-none animate-spin"
        role="status"
        aria-busy="true"
        aria-label={message}
      />
      <p className="text-sm font-medium tracking-wide text-muted-foreground">
        {message}
      </p>
    </div>
  )
}
