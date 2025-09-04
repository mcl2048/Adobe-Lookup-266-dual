
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

// This page is a legacy route and now redirects to /check.
export default function ExpiredRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/check');
  }, [router]);

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-background text-foreground">
      <Loader2 className="mb-4 h-8 w-8 animate-spin" />
      <p>Redirecting to the current page for expired accounts...</p>
    </div>
  );
}
