import { request } from '@playwright/test';
import { demoAdminSession, demoLeftovers, DEMO_ADMIN_EMAIL, DEMO_PASSWORD, DEMO_SUBDOMAIN } from './demo';
import { API_URL, tenantOrigin } from './urls';

/**
 * DX-337: al terminar la suite, la clínica demo debe seguir como la sembró
 * `seed:demo`. Si queda una sede activa o una persona del equipo que no son
 * las sembradas, algún spec dejó estado que leen otros (así se rompió
 * «Comparar sedes» en DX-014) y la ejecución termina en rojo nombrándolas.
 *
 * Sin clínica demo en la base (no se sembró) no hay nada que comprobar.
 */
export default async function globalTeardown(): Promise<void> {
  const api = await request.newContext();
  try {
    const login = await api.post(`${API_URL}/auth/login`, {
      headers: { 'X-Tenant-Host': new URL(tenantOrigin(DEMO_SUBDOMAIN)).host },
      data: { email: DEMO_ADMIN_EMAIL, password: DEMO_PASSWORD },
    });
    if (!login.ok()) {
      console.warn(`[e2e] Sin clínica demo (login ${login.status()}): no se comprueba que quedara como se sembró.`);
      return;
    }
    const { locations, staff } = await demoLeftovers(api, await demoAdminSession(api));
    const problems = [
      ...(locations.length ? [`sedes activas no sembradas: ${locations.join(', ')}`] : []),
      ...(staff.length ? [`personal no sembrado: ${staff.join(', ')}`] : []),
    ];
    if (problems.length) {
      throw new Error(
        `La suite dejó estado en la clínica demo (${problems.join('; ')}). ` +
          'Cada spec debe retirar en afterAll/afterEach lo que crea en ella (ver e2e/support/demo.ts).',
      );
    }
  } finally {
    await api.dispose();
  }
}
