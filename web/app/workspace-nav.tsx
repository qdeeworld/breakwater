'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Waves,
  SlidersHorizontal,
  ArrowLeftRight,
  BookOpen,
  ArrowUpRight,
} from 'lucide-react';
export function WorkspaceNav() {
  const path = usePathname();
  return (
    <aside className="workspace-rail">
      <Link href="/" className="rail-brand" aria-label="Breakwater home">
        <Waves size={32} aria-hidden="true" />
        <span>
          Breakwater<small>Treasury liquidity</small>
        </span>
      </Link>
      <nav aria-label="Workspace">
        <Link href="/" aria-current={path === '/' ? 'page' : undefined}>
          <SlidersHorizontal size={19} aria-hidden="true" />
          Treasury
        </Link>
        <Link
          href="/positions"
          aria-current={path === '/positions' ? 'page' : undefined}
        >
          <ArrowLeftRight size={19} aria-hidden="true" />
          Find liquidity
        </Link>
        <a
          href="https://github.com/qdeeworld/breakwater"
          target="_blank"
          rel="noreferrer"
          aria-label="Documentation (opens in new tab)"
        >
          <BookOpen size={19} aria-hidden="true" />
          Documentation
          <ArrowUpRight size={15} aria-hidden="true" />
        </a>
      </nav>
      <div className="rail-bottom">
        <span className="eyebrow">Aqua / SwapVM</span>
        <p>
          Your tokens.
          <br />
          Your trading limits.
        </p>
        <span className="rail-network">
          Sepolia test environment
          <br />
          No-value tokens
        </span>
      </div>
    </aside>
  );
}
