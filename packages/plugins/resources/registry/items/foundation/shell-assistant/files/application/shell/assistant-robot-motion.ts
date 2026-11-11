export type RobotActivity = 'idle' | 'running' | 'awaiting-input' | 'error';
/** Ignore loaded history, cancellation, failure and another conversation's run. */
export class RobotRunFeedback {
  private threadId: string | undefined;
  private active = false;
  observe(threadId: string, activity: RobotActivity, message: { role: string; status?: unknown } | undefined): boolean {
    if (this.threadId !== threadId) { this.threadId = threadId; this.active = false; }
    if (activity === 'running') { this.active = true; return false; }
    if (activity !== 'idle') { this.active = false; return false; }
    if (!this.active) return false;
    const status = message?.status;
    const type = status && typeof status === 'object' && 'type' in status ? status.type : undefined;
    if (type !== 'running') this.active = false;
    return message?.role === 'assistant' && type === 'complete';
  }
}
export type RobotPose = { yaw: number; pitch: number; roll: number; blink: number; smile: boolean; bob: number; glow: number; mode: string };
/** Project the actual earcup heart through the authoring camera, then the CSS tilt. */
export function robotHeartOrigin(pose: Pick<RobotPose, 'yaw' | 'pitch' | 'roll' | 'bob'>, side: -1 | 1, size: number) {
  const x = side * (1.686 + .012 * .78) * .92, y = (-.19 + .06 * .73) * .92, z = .03 * .92;
  const wx = Math.cos(pose.yaw) * x + Math.sin(pose.yaw) * z;
  const wz = -Math.sin(pose.yaw) * x + Math.cos(pose.yaw) * z;
  const wy = Math.cos(pose.pitch) * y - Math.sin(pose.pitch) * wz;
  const depth = Math.sin(pose.pitch) * y + Math.cos(pose.pitch) * wz;
  const camera = Math.atan(.5 / 7);
  const dx = wx / 4.2 * size, dy = -((wy - .25) * Math.cos(camera) - depth * Math.sin(camera)) / 4.2 * size;
  return { x: size / 2 + dx * Math.cos(pose.roll) - dy * Math.sin(pose.roll),
    y: size / 2 + dx * Math.sin(pose.roll) + dy * Math.cos(pose.roll) + pose.bob };
}
type Axis = { value: number; velocity: number };
const ease = (v: number) => { const t = Math.max(0, Math.min(1, v)); return t * t * t * (t * (t * 6 - 15) + 10); };
const blinkAt = (time: number, start: number) => ease((time - start) / 110) - ease((time - start - 150) / 160);
function spring(axis: Axis, target: number, dt: number, speed = 10) {
  const a = 1 + 2 * dt * speed, b = dt * speed * speed, d = 1 / (a + dt * b);
  const old = axis.value;
  axis.value = (a * old + dt * axis.velocity + dt * b * target) * d;
  axis.velocity = (axis.velocity + b * (target - old)) * d;
}

/** Presentation-only controller. Never starts, cancels or simulates an Agent run. */
export class AssistantRobotMotion {
  private yaw: Axis = { value: .35, velocity: 0 };
  private pitch: Axis = { value: 0, velocity: 0 };
  private roll: Axis = { value: 0, velocity: 0 };
  private height: Axis = { value: 0, velocity: 0 };
  private last: number | undefined;
  private origin: number | undefined;
  private hoverSince = Infinity;
  private leaveAt = -Infinity;
  private hovered = false;
  private attentive = false;
  private welcomeAt = -Infinity;
  private direction = -1;
  private activity: RobotActivity = 'idle';
  private action: { kind: 'click' | 'complete'; ready?: number } | undefined;
  private pendingCompletion = false;
  private idlePhase = 0;
  private returning = false;

  setHovered(hovered: boolean, now: number) {
    if (hovered === this.hovered) return;
    this.hovered = hovered;
    if (hovered) this.hoverSince = now;
    else this.leaveAt = now;
  }
  setActivity(activity: RobotActivity) {
    if (activity === 'idle' && this.activity !== 'idle') this.returning = true;
    this.activity = activity;
    if (activity !== 'idle') {
      this.pendingCompletion = false;
      if (this.action?.kind === 'complete') this.action = undefined;
    }
  }
  click() { this.action = { kind: 'click' }; }
  complete() { if (this.action?.kind === 'click') this.pendingCompletion = true; else this.action = { kind: 'complete' }; }
  reset() { this.action = undefined; this.pendingCompletion = false; this.activity = 'idle'; this.returning = true; }

  update(now: number): RobotPose {
    this.origin ??= now;
    const dt = Math.min(.04, Math.max(0, (now - (this.last ?? now)) / 1000));
    this.last = now;
    const time = now - this.origin;
    const attention = this.hovered ? (this.attentive || now - this.hoverSince >= 150) : (this.attentive && now - this.leaveAt < 600);
    if (attention && !this.attentive) { this.direction *= -1; this.welcomeAt = now; }
    if (!attention && this.attentive) this.returning = true;
    this.attentive = attention;
    let yaw = 0, pitch = 0, roll = 0, smile = false, closed = 0, mode = 'idle';
    if (this.action) {
      mode = this.action.kind;
      // Nod only after the current side view has smoothly reached the front.
      if (this.action.ready === undefined && Math.abs(this.yaw.value) < .009 && Math.abs(this.pitch.value) < .009) this.action.ready = now;
      if (this.action.ready !== undefined) {
        const t = now - this.action.ready;
        closed = blinkAt(t, 40);
        smile = t >= 150 && t < 650;
        pitch = (this.action.kind === 'click' ? .15 : -.12) * Math.sin(Math.PI * Math.min(1, t / 650));
        if (t > 950) {
          this.action = this.pendingCompletion ? { kind: 'complete' } : undefined;
          this.pendingCompletion = false;
          this.returning = true;
        }
      }
    } else if (attention || this.activity === 'awaiting-input') {
      mode = attention ? 'hover' : 'waiting';
      roll = this.direction * Math.PI / 30 * ease((now - this.welcomeAt - 650) / 450);
      closed = blinkAt(now, this.welcomeAt + 500);
    } else if (this.activity === 'running') {
      mode = 'working';
      const t = time % 12000;
      yaw = t < 3000 || (t >= 6000 && t < 9000) ? 0 : t < 6000 ? -.30 : .30;
      if (yaw === 0 && Math.abs(this.yaw.value) < .009) pitch = .075 * Math.sin(Math.PI * (t % 3000) / 3000);
    } else {
      if (this.returning) {
        // Ease back to the gentle default angle before resuming the cycle.
        this.idlePhase = 0;
        this.returning = false;
      }
      const phase = this.idlePhase % 32;
      const turn = phase % 16, side = phase < 16 ? 1 : -1;
      // Rest at 20 degrees, but keep the original full 40-degree turning range.
      if (turn < 11.4) yaw = side * .35;
      else if (turn < 12) yaw = side * (.35 + .35 * ease((turn - 11.4) / .6));
      else if (turn < 12.4) yaw = side * .7;
      else if (turn < 15) yaw = side * .7 * (1 - 2 * ease((turn - 12.4) / 2.6));
      else if (turn < 15.4) yaw = -side * .7;
      else yaw = -side * (.7 - .35 * ease((turn - 15.4) / .6));
      this.idlePhase += dt;
    }
    // The two view banks meet at exactly the same frontal pose.
    if (Math.abs(this.pitch.value) > .008) yaw = 0;
    if (Math.abs(this.yaw.value) > .009) pitch = 0;
    spring(this.yaw, yaw, dt, attention || this.action ? 10 : 7);
    spring(this.pitch, pitch, dt, 15);
    spring(this.roll, roll, dt, 9);
    spring(this.height, Math.sin(time / 1400) * (mode === 'idle' ? 1.8 : .6) + (attention ? -.7 : 0), dt, 8);
    if (!this.action && now - this.welcomeAt > 1300) closed = Math.max(closed, blinkAt(time % 5700, 2200));
    return { yaw: this.yaw.value, pitch: this.pitch.value, roll: this.roll.value, blink: 1 - .98 * closed, smile,
      bob: this.height.value, glow: attention ? 1 : .55,
      mode };
  }
}
