---
tags: [frontend-ui-architecture]
max_turns: 20
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

can you review the architecture of this before I merge? it's Next.js 16.4, App Router, Drizzle on Postgres directly from Next (no separate backend)

```tsx
// src/app/settings/page.tsx
'use client';
import { useEffect, useState } from 'react';
import { db } from '@/lib/db';
import { ProfileForm } from './profile-form';

export default function SettingsPage({ params }: { params: { orgId: string } }) {
  const [user, setUser] = useState<any>(null);
  useEffect(() => {
    fetch(`/api/users/me?org=${params.orgId}`).then(r => r.json()).then(setUser);
  }, []);
  if (!user) return <p>Loading…</p>;
  return <ProfileForm user={user} />;
}
```

```ts
// src/app/settings/actions.ts
'use server';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';

export async function updateProfile(user: { id: string; name: string; email: string; role: string }) {
  try {
    await db.update(users).set(user).where(eq(users.id, user.id));
    redirect('/settings?saved=1');
  } catch (e) {
    return { error: 'failed' };
  }
}
```

```ts
// src/middleware.ts
export { auth as middleware } from '@/lib/auth';
```
