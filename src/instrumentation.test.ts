/**
 * @jest-environment node
 */
import { register } from './instrumentation';

describe('instrumentation (OPS-024: la web no arranca en producción sin API_URL)', () => {
  const saved = { ...process.env };
  let exit: jest.SpyInstance;
  let error: jest.SpyInstance;
  let warn: jest.SpyInstance;

  beforeEach(() => {
    exit = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    Object.assign(process.env, { NODE_ENV: 'production', NEXT_RUNTIME: 'nodejs' });
    delete process.env.API_URL;
    delete process.env.NEXT_PHASE;
    delete process.env.NEXT_PUBLIC_API_URL;
    delete process.env.NEXT_PUBLIC_FILES_ORIGIN;
  });
  afterEach(() => {
    process.env = { ...saved };
    exit.mockRestore();
    error.mockRestore();
    warn.mockRestore();
  });

  it('sin API_URL sale con código 1 y dice por qué', async () => {
    await register();
    expect(exit).toHaveBeenCalledWith(1);
    expect(String(error.mock.calls[0][0])).toMatch(/API_URL/);
  });

  it('con API_URL válida arranca', async () => {
    process.env.API_URL = 'https://api.dentalix.app/api/v1';
    await register();
    expect(exit).not.toHaveBeenCalled();
  });

  it('no comprueba nada durante `next build` ni en el runtime edge', async () => {
    process.env.NEXT_PHASE = 'phase-production-build';
    await register();
    delete process.env.NEXT_PHASE;
    process.env.NEXT_RUNTIME = 'edge';
    await register();
    expect(exit).not.toHaveBeenCalled();
  });

  it('DX-083: avisa (sin salir, fuera de producción) si sigue configurada la antigua NEXT_PUBLIC_API_URL', async () => {
    Object.assign(process.env, { NODE_ENV: 'development' });
    process.env.NEXT_PUBLIC_API_URL = 'http://localhost:3100/api/v1';
    await register();
    expect(exit).not.toHaveBeenCalled();
    expect(String(warn.mock.calls[0][0])).toMatch(/NEXT_PUBLIC_API_URL.*API_URL/);
  });
});
