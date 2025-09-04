
'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Loader2, ShieldAlert } from 'lucide-react';
import DualLanguageText from './dual-language-text';

export type LoggedInUser = {
  role: string;
};

interface AuthGuardProps {
  onAuthSuccess: (user: LoggedInUser) => void;
}

const AuthGuard: React.FC<AuthGuardProps> = ({ onAuthSuccess }) => {
  const router = useRouter();
  const pathname = usePathname();
  const [status, setStatus] = useState<'loading' | 'unauthenticated'>('loading');

  useEffect(() => {
    async function verifySession() {
        try {
            const res = await fetch('/api/session');
            if (res.ok) {
                const { user } = await res.json();
                if (user?.role) {
                    onAuthSuccess(user);
                    return;
                }
            }
        } catch (e) {
            // fail silently, user will be marked as unauthenticated
        }
        setStatus('unauthenticated');
    }
    verifySession();
  }, [onAuthSuccess]);
  
  const handleRedirectToLogin = () => {
    router.push(`/login?redirect=${encodeURIComponent(pathname)}`);
  };

  if (status === 'loading') {
    return (
        <div className="flex flex-col items-center justify-center p-10 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin mb-4" />
            <p className="text-lg">
                <DualLanguageText en="Verifying session..." zh="正在验证会话..." />
            </p>
        </div>
    );
  }

  return (
    <div className="flex justify-center items-center py-20">
      <Card className="w-full max-w-sm shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <ShieldAlert className="h-5 w-5" />
            <DualLanguageText en="Access Denied" zh="访问被拒绝" />
          </CardTitle>
        </CardHeader>
        <CardContent>
            <AlertDescription>
                <DualLanguageText 
                  en="You do not have an active session. Please log in to access this page." 
                  zh="您没有活动的会话。请登录以访问此页面。" 
                />
            </AlertDescription>
        </CardContent>
        <CardContent>
            <Button className="w-full" onClick={handleRedirectToLogin}>
               <DualLanguageText en="Go to Login Page" zh="前往登录页面" />
            </Button>
        </CardContent>
      </Card>
    </div>
  );
};

// Static method for logout
AuthGuard.logout = async () => {
  try {
    await fetch('/api/logout', { method: 'POST' });
  } catch (e) {
    console.error("Failed to logout:", e);
  } finally {
     window.location.href = '/login'; // Redirect to login page after logout
  }
};


export default AuthGuard;
