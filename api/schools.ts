import type { IncomingMessage, ServerResponse } from 'node:http';

type Request = IncomingMessage & { body?: unknown };
type Response = ServerResponse & {
  status: (code: number) => Response;
  json: (body: unknown) => void;
};

type AdminUser = { id: string; email?: string };

const json = (res: Response, status: number, body: unknown) => res.status(status).json(body);

const parseBody = (req: Request): Record<string, unknown> | null => {
  if (typeof req.body === 'object' && req.body !== null && !Array.isArray(req.body)) {
    return req.body as Record<string, unknown>;
  }
  if (typeof req.body === 'string') {
    try {
      const parsed: unknown = JSON.parse(req.body);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }
  return null;
};

const getConfig = () => {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, '');
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) throw new Error('Server configuration is incomplete');
  return { url, anonKey, serviceKey };
};

const requestJson = async <T>(url: string, key: string, method: string, body?: unknown): Promise<T> => {
  const response = await fetch(url, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json().catch(() => null) as T | { message?: string } | null;
  if (!response.ok) {
    const message = result && typeof result === 'object' && 'message' in result
      ? result.message
      : 'Supabase admin request failed';
    throw new Error(typeof message === 'string' ? message : 'Supabase admin request failed');
  }
  return result as T;
};

const verifyAdmin = async (req: Request, config: ReturnType<typeof getConfig>) => {
  const authorization = req.headers.authorization;
  if (!authorization?.startsWith('Bearer ')) return null;
  const token = authorization.slice('Bearer '.length);
  const response = await fetch(`${config.url}/auth/v1/user`, {
    headers: { apikey: config.anonKey, Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return null;
  const user = await response.json() as AdminUser;
  const profiles = await requestJson<Array<{ role: string }>>(
    `${config.url}/rest/v1/users?id=eq.${encodeURIComponent(user.id)}&select=role`,
    config.serviceKey,
    'GET',
  );
  return profiles[0]?.role === 'admin' ? user : null;
};

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  try {
    const config = getConfig();
    if (!await verifyAdmin(req, config)) return json(res, 403, { error: 'Administrator access is required.' });

    const body = parseBody(req);
    if (!body) return json(res, 400, { error: 'Invalid request body.' });

    if (body.action === 'create-school') {
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name || name.length > 120) return json(res, 400, { error: 'Enter a school name up to 120 characters.' });
      const schools = await requestJson<Array<{ id: string; name: string }>>(
        `${config.url}/rest/v1/schools`, config.serviceKey, 'POST', { name },
      );
      return json(res, 201, { school: schools[0] });
    }

    if (body.action === 'create-leader') {
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : '';
      const password = typeof body.password === 'string' ? body.password : '';
      const schoolId = typeof body.schoolId === 'string' ? body.schoolId : '';
      if (!/^\S+@\S+\.\S+$/.test(email) || !fullName || fullName.length > 120 || password.length < 12
        || !/^[\da-f-]{36}$/i.test(schoolId)) {
        return json(res, 400, { error: 'Provide a valid email, name, school, and password of at least 12 characters.' });
      }
      const schools = await requestJson<Array<{ id: string }>>(
        `${config.url}/rest/v1/schools?id=eq.${encodeURIComponent(schoolId)}&select=id`,
        config.serviceKey,
        'GET',
      );
      if (!schools.length) return json(res, 400, { error: 'Choose an existing school.' });

      const created = await requestJson<{ id: string }>(
        `${config.url}/auth/v1/admin/users`,
        config.serviceKey,
        'POST',
        { email, password, email_confirm: true, user_metadata: { full_name: fullName } },
      );
      try {
        const profiles = await requestJson<Array<{ id: string }>>(
          `${config.url}/rest/v1/users?id=eq.${encodeURIComponent(created.id)}&select=id`,
          config.serviceKey,
          'PATCH',
          { school_id: schoolId, role: 'leader' },
        );
        if (!profiles.some(profile => profile.id === created.id)) {
          throw new Error('The leader profile was not assigned to the selected school.');
        }
      } catch (error) {
        try {
          await requestJson<unknown>(
            `${config.url}/auth/v1/admin/users/${encodeURIComponent(created.id)}`,
            config.serviceKey,
            'DELETE',
          );
        } catch (cleanupError) {
          console.error('Unable to remove the unassigned leader account:', cleanupError);
        }
        throw error;
      }
      return json(res, 201, { leader: { id: created.id, email } });
    }

    return json(res, 400, { error: 'Unknown action.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request failed';
    console.error('School administration request failed:', message);
    return json(res, 500, { error: 'Unable to complete the administration request. Check server configuration and logs.' });
  }
}
