import { useEffect, useId, useRef, useState } from 'react';
import poster from './assistant-robot-still.png';
import { robotFrames } from './assistant-robot-frames';
import { AssistantRobotMotion, robotHeartOrigin, type RobotActivity, type RobotPose } from './assistant-robot-motion';

interface Props { hovered: boolean; clickSignal: number; completionSignal: number; activity: RobotActivity; conversationId: string }

/** Draw one complete model view at a time, with independent decorative bubbles. */
export function AssistantRobot({ hovered, clickSignal, completionSignal, activity, conversationId }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const faceRef = useRef<SVGSVGElement>(null);
  const bubblesRef = useRef<HTMLSpanElement>(null);
  const bubbleId = useId();
  const motion = useRef(new AssistantRobotMotion());
  const lastConversation = useRef(conversationId);
  const [ready, setReady] = useState(false);
  useEffect(() => { motion.current.setHovered(hovered, performance.now()); }, [hovered]);
  useEffect(() => {
    if (lastConversation.current !== conversationId) { motion.current.reset(); lastConversation.current = conversationId; }
    motion.current.setActivity(activity);
  }, [activity, conversationId]);
  useEffect(() => { if (clickSignal) motion.current.click(); }, [clickSignal]);
  useEffect(() => { if (completionSignal) motion.current.complete(); }, [completionSignal]);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || typeof CanvasRenderingContext2D === 'undefined') return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const wrapper = canvas.parentElement!, trigger = wrapper.closest('button')!;
    const face = faceRef.current;
    const eyeGroups = Array.from(face?.querySelectorAll<SVGGElement>('[data-eye]') ?? []);
    const openEyes = eyeGroups.map(group => group.querySelector<SVGPathElement>('[data-open]')!);
    const smileEyes = eyeGroups.map(group => group.querySelector<SVGPathElement>('[data-smile]')!);
    const mouth = face?.querySelector<SVGPathElement>('[data-mouth]');
    const screen = face?.querySelector<SVGPathElement>('[data-face-clip]');
    let disposed = false, request = 0, previous = -1, faceView = -1, lastBlink = -1, lastSmile = false;
    const hearts = Array.from(bubblesRef.current?.children ?? []) as HTMLElement[];
    const floating = new Map<HTMLElement, Animation>();
    let nextBurst = performance.now() + 1800, nextBubble = 0, remaining = 0, bubbleIndex = 0, nearSide: -1 | 1 = -1, bubbleMode = '';
    const clearBubbles = () => { for (const animation of floating.values()) animation.cancel(); floating.clear(); remaining = 0; };
    const emitBubble = (pose: RobotPose) => {
      const heart = hearts[bubbleIndex % hearts.length];
      if (!heart || typeof heart.animate !== 'function') return;
      floating.get(heart)?.cancel();
      const point = robotHeartOrigin(pose, nearSide, wrapper.clientWidth || 80);
      const n = bubbleIndex++;
      const drift = nearSide * (5 + n % 3 * 3), sway = n % 2 ? 3 : -3, rise = 27 + n % 4 * 5;
      heart.style.left = `${point.x}px`; heart.style.top = `${point.y}px`;
      heart.style.width = heart.style.height = `${6 + n % 3 * 1.5}px`;
      const animation = heart.animate([
        { transform: 'translate(-50%, -50%) scale(.25)', opacity: 0 },
        { transform: `translate(calc(-50% + ${drift * .25}px), calc(-50% - 5px)) scale(.75)`, opacity: .95, offset: .16 },
        { transform: `translate(calc(-50% + ${drift + sway}px), calc(-50% - ${rise * .7}px)) scale(1.05)`, opacity: .75, offset: .7 },
        { transform: `translate(calc(-50% + ${drift}px), calc(-50% - ${rise}px)) scale(1.2)`, opacity: 0 },
      ], { duration: 1900 + n % 3 * 180, easing: 'ease-out' });
      floating.set(heart, animation);
      animation.onfinish = () => { if (floating.get(heart) === animation) floating.delete(heart); };
    };
    const pages = robotFrames.pages.map(source => {
      const image = new Image();
      const loaded = new Promise<HTMLImageElement>((resolve, reject) => {
        image.onload = () => { void image.decode().then(() => resolve(image), reject); };
        image.onerror = reject;
      });
      image.src = source;
      return loaded;
    });
    let images: HTMLImageElement[] = [];
    const draw = (now: number) => {
      if (disposed || document.hidden || !images.length) return;
      const pose = motion.current.update(now);
      if (Math.abs(pose.yaw) > .08) nearSide = pose.yaw > 0 ? -1 : 1;
      if (reduced.matches) clearBubbles();
      else {
        const friendly = ['idle', 'hover', 'click', 'complete'].includes(pose.mode);
        if (pose.mode !== bubbleMode && ['hover', 'complete'].includes(pose.mode)) nextBurst = now;
        if (friendly && now >= nextBurst) {
          remaining = pose.mode === 'idle' ? 2 : 3; nextBubble = now;
          nextBurst = now + (pose.mode === 'hover' ? 3600 : 6800);
        }
        if (!friendly) remaining = 0;
        if (remaining > 0 && now >= nextBubble) { emitBubble(pose); remaining--; nextBubble = now + 240; }
        bubbleMode = pose.mode;
      }
      const yaw = Math.max(0, Math.min(robotFrames.yawCount - 1, Math.round((pose.yaw + .7) / robotFrames.yawStep)));
      const pitch = Math.max(0, Math.min(robotFrames.pitchCount - 1, Math.round((pose.pitch - robotFrames.pitchStart) / robotFrames.pitchStep)));
      const view = reduced.matches ? 28 : Math.abs(pose.pitch) > .015 && Math.abs(pose.yaw) < .012
        ? robotFrames.yawCount + pitch : yaw;
      const index = robotFrames.views[view]!;
      const geometry = robotFrames.faces[view]!;
      if (index !== previous) {
        const slot = index % robotFrames.perPage;
        const page = images[Math.floor(index / robotFrames.perPage)]!;
        context.clearRect(0, 0, robotFrames.size, robotFrames.size);
        context.drawImage(page,
          slot % robotFrames.columns * robotFrames.cell + robotFrames.gutter,
          Math.floor(slot / robotFrames.columns) * robotFrames.cell + robotFrames.gutter,
          robotFrames.size, robotFrames.size, 0, 0, robotFrames.size, robotFrames.size);
        previous = index;
      }
      const geometryChanged = faceView !== view;
      const blink = reduced.matches ? 1 : Math.max(.02, pose.blink);
      const smiling = !reduced.matches && pose.smile;
      for (const [i, group] of eyeGroups.entries()) {
        const eye = geometry.eyes[i]!;
        if (geometryChanged || Math.abs(lastBlink - blink) > .0001) {
          const x = eye.center[0]!, y = eye.center[1]!;
          const delta = blink - 1, p = eye.blink;
          group.setAttribute('transform', `translate(${x} ${y}) matrix(${1 + delta * p[0]!} ${delta * p[1]!} ${delta * p[2]!} ${1 + delta * p[3]!} 0 0) translate(${-x} ${-y})`);
        }
        if (geometryChanged) {
          openEyes[i]!.setAttribute('d', eye.open);
          smileEyes[i]!.setAttribute('d', eye.smile);
        }
        if (geometryChanged || smiling !== lastSmile) {
          openEyes[i]!.style.display = smiling ? 'none' : '';
          smileEyes[i]!.style.display = smiling ? '' : 'none';
        }
      }
      if (geometryChanged) {
        mouth?.setAttribute('d', geometry.mouth);
        screen?.setAttribute('d', geometry.screen);
      }
      faceView = view; lastBlink = blink; lastSmile = smiling;
      wrapper.style.transform = reduced.matches ? 'none' : `translateY(${pose.bob}px) rotate(${pose.roll}rad)`;
      trigger.style.setProperty('--robot-shadow-x', reduced.matches ? '0px' : `${-pose.roll * 12}px`);
      trigger.style.setProperty('--robot-glow', String(reduced.matches ? .55 : pose.glow));
      trigger.dataset.robotState = reduced.matches ? 'still' : pose.mode;
      canvas.dataset.view = String(view);
      if (!reduced.matches) request = requestAnimationFrame(draw);
    };
    const resume = () => { cancelAnimationFrame(request); if (document.hidden) clearBubbles(); draw(performance.now()); };
    reduced.addEventListener('change', resume);
    document.addEventListener('visibilitychange', resume);
    void Promise.all(pages).then(loaded => {
      if (disposed) return;
      images = loaded;
      canvas.width = canvas.height = robotFrames.size;
      draw(performance.now());
      setReady(true);
    }).catch(() => { /* Keep the complete still if an animation page cannot load. */ });
    return () => {
      disposed = true;
      cancelAnimationFrame(request);
      reduced.removeEventListener('change', resume);
      document.removeEventListener('visibilitychange', resume);
      trigger.style.removeProperty('--robot-shadow-x');
      trigger.style.removeProperty('--robot-glow');
      delete trigger.dataset.robotState;
      clearBubbles();
    };
  }, []);
  return (
    <><span aria-hidden='true' className='agent-ui-assistant-robot'>
      <canvas ref={ref} className='agent-ui-assistant-image' hidden={!ready} />
      {!ready && <img src={poster} alt='' draggable={false} className='agent-ui-assistant-image' />}
      <svg ref={faceRef} className='agent-ui-assistant-face' viewBox={`0 0 ${robotFrames.faceSize} ${robotFrames.faceSize}`} visibility={ready ? 'visible' : 'hidden'} focusable='false'>
        <defs>
          <clipPath id={`${bubbleId}-face-screen`}><path data-face-clip='' /></clipPath>
          <linearGradient id={`${bubbleId}-eye-fill`} x1='0' y1='0' x2='0' y2='1'>
            <stop stopColor='#fffaff' /><stop offset='1' stopColor='#ffd2f5' />
          </linearGradient>
          <filter id={`${bubbleId}-face-glow`} x='-60%' y='-60%' width='220%' height='220%' colorInterpolationFilters='sRGB'>
            <feGaussianBlur in='SourceGraphic' stdDeviation='2.4' result='blur' />
            <feFlood floodColor='#ff9ce9' floodOpacity='.8' result='color' />
            <feComposite in='color' in2='blur' operator='in' result='glow' />
            <feMerge><feMergeNode in='glow' /><feMergeNode in='SourceGraphic' /></feMerge>
          </filter>
        </defs>
        <g clipPath={`url(#${bubbleId}-face-screen)`}><g filter={`url(#${bubbleId}-face-glow)`}>
          {[0, 1].map(index => <g key={index} data-eye=''>
            <path data-open='' fill={`url(#${bubbleId}-eye-fill)`} />
            <path data-smile='' fill='none' stroke='#fff0ff' strokeWidth='2.38' strokeLinecap='round' />
          </g>)}
          <path data-mouth='' fill='none' stroke='#fff0ff' strokeWidth='2.29' strokeLinecap='round' />
        </g></g>
      </svg>
    </span>
    <span ref={bubblesRef} aria-hidden='true' className='agent-ui-assistant-bubbles'>
      {Array.from({ length: 8 }, (_, index) => <span key={index} className='agent-ui-assistant-heart-bubble'>
        <svg viewBox='0 0 24 24' focusable='false'>
          <defs><linearGradient id={`${bubbleId}-${index}`} x1='0' y1='0' x2='0.8' y2='1'>
            <stop stopColor='#ffe6fc' stopOpacity='.95' /><stop offset='1' stopColor='#e6a0df' stopOpacity='.75' />
          </linearGradient></defs>
          <path d='M12 21S2 15 2 8.5C2 2.5 9 1.5 12 6c3-4.5 10-3.5 10 2.5C22 15 12 21 12 21Z' fill={`url(#${bubbleId}-${index})`} stroke='#e9a2df' strokeWidth='1.2' />
        </svg>
      </span>)}
    </span></>
  );
}
