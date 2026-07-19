import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border">
      <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-4 text-xs text-muted-foreground">
        <span>Smash Ladder NA — an independent, fan-run community project. Not affiliated with Nintendo.</span>
        <nav className="flex items-center gap-4">
          <Link href="/privacy" className="hover:text-foreground hover:underline">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-foreground hover:underline">
            Terms
          </Link>
        </nav>
      </div>
    </footer>
  );
}
