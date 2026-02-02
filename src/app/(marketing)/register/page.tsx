'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useRouter } from "next/navigation";


export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();


  return (
    <div className="mx-auto flex min-h-screen max-w-md items-center px-4">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Registrieren</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input
            placeholder="Password (min 8)"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {msg && <p className="text-sm text-slate-300">{msg}</p>}
          <Button
            className="w-full"
            onClick={async () => {
              setMsg(null);
              const res = await fetch('/api/register', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ email, password, name: name || undefined }),
              });
              if (res.ok) {
                router.replace("/login");
                return;
              }
              setMsg("Fehler beim Erstellen.");
            }}
          >
            Account erstellen
          </Button>
          <a className="block text-center text-sm underline" href="/login">
            Zurück zum Login
          </a>
        </CardContent>
      </Card>
    </div>
  );
}
