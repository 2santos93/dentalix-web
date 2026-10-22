import { act, render, screen } from '@testing-library/react';
import { InClinicProvider, useInClinic } from './use-in-clinic';
import { SessionLocationsProvider, useSessionLocations } from '@/lib/locations/session-locations';
import { setActiveLocationId } from '@/lib/locations/location-store';
import { useEffect } from 'react';
import { notifyInClinicChanged } from '@/lib/appointments/patient-flow';

const empty = { date:'2026-10-22', locationId:'loc-1', timeZone:'America/Bogota', now:'2026-10-22T14:00:00Z', scope:'MINE', waiting:[], inChair:[], readyForCheckout:[] };
const response = (data: unknown) => ({ ok:true, status:200, json:async () => data }) as Response;
function Consumer({ token, id }: { token:string|null; id:string }) {
  const state = useInClinic(token);
  return <div data-testid={id}>{state.view?.now ?? 'empty'}</div>;
}
function Locations({token}: {token:string}) {
  const load = useSessionLocations(token);
  useEffect(() => { void load(); }, [load]);
  return null;
}
function Harness({token = 'T'}: {token?:string|null}) {
  return <SessionLocationsProvider token={token}><InClinicProvider token={token}>
    {token && <><Locations token={token}/><Locations token={token}/></>}
    <Consumer token={token} id="shell"/><Consumer token={token} id="agenda"/><Consumer token={token} id="sheet"/>
  </InClinicProvider></SessionLocationsProvider>;
}
let fetchMock: jest.Mock;
beforeEach(() => {
  jest.useFakeTimers();
  Object.defineProperty(document, 'hidden', { configurable:true, value:false });
  setActiveLocationId(null);
  fetchMock = jest.fn(async (url: string) => response(url.includes('/appointments/in-clinic') ? empty : [{id:'loc-1', isActive:true}]));
  global.fetch = fetchMock;
});
afterEach(() => { jest.useRealTimers(); });
const flush = async () => { await act(async () => { await Promise.resolve(); }); };
const count = (path: string) => fetchMock.mock.calls.filter(([url]) => String(url).includes(path)).length;

it('DX-242: shell/agenda/sheet comparten 3 GET panel en 90 s y una sola lectura de sedes', async () => {
  render(<Harness/>); await flush();
  expect(count('/appointments/in-clinic')).toBe(1);
  await act(async () => { jest.advanceTimersByTime(45_000); });
  await act(async () => { jest.advanceTimersByTime(45_000); });
  expect(count('/appointments/in-clinic')).toBe(3);
  expect(count('/locations')).toBe(1);
});
it('DX-242: volver tras 60 s oculta refresca inmediatamente; volver con dato fresco no pide', async () => {
  render(<Harness/>); await flush();
  Object.defineProperty(document, 'hidden', { configurable:true, value:true });
  await act(async () => { jest.advanceTimersByTime(60_000); });
  expect(count('/appointments/in-clinic')).toBe(1);
  Object.defineProperty(document, 'hidden', { configurable:true, value:false });
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
  expect(count('/appointments/in-clinic')).toBe(2);
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
  expect(count('/appointments/in-clinic')).toBe(2);
});
it('DX-242: sesión/sede invalidan datos y descartan respuestas tardías', async () => {
  let finish!: (value:Response) => void;
  fetchMock.mockImplementationOnce(() => response([{id:'loc-1', isActive:true}]))
    .mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }));
  const {rerender} = render(<Harness/>); await flush();
  rerender(<Harness token={null}/>); await flush();
  await act(async () => { finish(response({...empty, now:'sesion-anterior'})); });
  expect(screen.getByTestId('agenda')).toHaveTextContent('empty');
  rerender(<Harness token="new"/>); await flush();
  expect(screen.getByTestId('agenda')).toHaveTextContent(empty.now);
  let oldLocation!: (value:Response) => void;
  fetchMock.mockImplementationOnce(() => new Promise<Response>(resolve => { oldLocation=resolve; }));
  await act(async () => { setActiveLocationId('old'); });
  expect(screen.getByTestId('agenda')).toHaveTextContent('empty');
  await act(async () => { setActiveLocationId('new-location'); });
  await act(async () => { oldLocation(response({...empty, now:'sede-anterior'})); });
  expect(screen.getByTestId('agenda')).toHaveTextContent(empty.now);
});

it('DX-242: una petición lenta no se duplica; invalida una vez tras cambios simultáneos', async () => {
  let finish!: (value:Response) => void;
  fetchMock.mockImplementationOnce(() => response([{id:'loc-1', isActive:true}]))
    .mockImplementationOnce(() => new Promise<Response>(resolve => {finish=resolve;}));
  render(<Harness/>); await flush();
  await act(async () => { jest.advanceTimersByTime(45_000); notifyInClinicChanged(); notifyInClinicChanged(); });
  expect(count('/appointments/in-clinic')).toBe(1);
  await act(async () => { finish(response(empty)); });
  expect(count('/appointments/in-clinic')).toBe(2);
  expect(count('/locations')).toBe(1);
});
