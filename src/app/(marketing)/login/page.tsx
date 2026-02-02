'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useRouter } from "next/navigation";


export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div className="mx-auto flex min-h-screen max-w-md items-center px-4">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Login</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <Button
            className="w-full"
            onClick={async () => {
              setError(null);
              const res = await signIn("credentials", {
                email,
                password,
                redirect: false,
                callbackUrl: "/dashboard",
              });

              if (res?.error) {
                setError("Login fehlgeschlagen");
                return;
              }

              router.push(res?.url ?? "/dashboard");
              router.refresh();

              // (res?.) setError('Login fehlgeschlagen');
            }}
          >
            Anmelden
          </Button>

          <a className="block text-center text-sm underline" href="/register">
            Account erstellen
          </a>
        </CardContent>
      </Card>
    </div>
  );
}
