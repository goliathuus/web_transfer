/**
 * Fond d'ecran anime : lignes de courant qui derivent lentement sur la nuit
 * marine, comme sur Boat Tracker (composant WindBackdrop du tracker).
 *
 * Champ synthetique (quelques sinus superposes), pas de donnees : c'est du
 * decor. Densite et opacite basses pour ne jamais gener la lecture du
 * formulaire pose dessus. Image fixe si l'utilisateur demande moins
 * d'animations.
 */
export function mountBackdrop(): void {
  const canvas = document.createElement('canvas');
  canvas.className = 'backdrop';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  type P = { x: number; y: number; age: number; life: number };
  let particles: P[] = [];
  let w = 0;
  let h = 0;

  // Dominante ouest-sud-ouest, ondulations lentes.
  const field = (x: number, y: number, t: number): [number, number] => {
    const a =
      -0.35 +
      0.55 * Math.sin(y * 0.0045 + t * 0.00012) +
      0.35 * Math.cos(x * 0.0035 - t * 0.00009) +
      0.2 * Math.sin((x + y) * 0.006);
    const s = 0.55 + 0.35 * Math.sin(x * 0.002 + y * 0.003 + t * 0.0001);
    return [Math.cos(a) * s, Math.sin(a) * s];
  };

  const spawn = (p: P) => {
    p.x = Math.random() * w;
    p.y = Math.random() * h;
    p.age = 0;
    p.life = 60 + Math.random() * 90;
  };

  const resize = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.min(900, Math.round((w * h) / 2600));
    particles = Array.from({ length: count }, () => {
      const p = { x: 0, y: 0, age: 0, life: 0 };
      spawn(p);
      p.age = Math.random() * p.life;
      return p;
    });
  };

  const step = (t: number, fade: number) => {
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = `rgba(0,0,0,${fade})`;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
    ctx.beginPath();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(190,215,255,0.3)';
    for (const p of particles) {
      if (p.age++ > p.life || p.x < 0 || p.y < 0 || p.x > w || p.y > h) {
        spawn(p);
        continue;
      }
      const [vx, vy] = field(p.x, p.y, t);
      ctx.moveTo(p.x, p.y);
      p.x += vx * 1.1;
      p.y += vy * 1.1;
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  };

  resize();
  window.addEventListener('resize', resize);

  if (reduceMotion) {
    for (let i = 0; i < 40; i++) step(0, 1);
    return;
  }
  const frame = (t: number) => {
    step(t, 0.94);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
