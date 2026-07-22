import { redirect } from 'next/navigation';

export default function Home() {
  // La raíz redirige al login por ahora; el dashboard llega en fases posteriores.
  redirect('/login');
}
