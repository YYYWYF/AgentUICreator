import { expect, it } from 'vitest';
import { AssistantRobotMotion, RobotRunFeedback, robotHeartOrigin } from '../../../plugins/resources/registry/items/foundation/shell-assistant/files/application/shell/assistant-robot-motion';

function rig() {
  const motion = new AssistantRobotMotion();
  let now = 0, pose = motion.update(now);
  const samples = [pose];
  return { motion, samples, get now() { return now; }, get pose() { return pose; }, advance(ms: number) {
    const end = now + ms;
    while (now < end) { now = Math.min(end, now + 16); pose = motion.update(now); samples.push(pose); }
    return pose;
  } };
}

it('rests at 20 degrees but retains full 40-degree turns in both directions', () => {
  const r = rig(); r.advance(11000);
  expect(r.samples.every(p => Math.abs(p.yaw - .35) < .001)).toBe(true);
  expect(Math.max(...r.samples.map(p => p.bob)) - Math.min(...r.samples.map(p => p.bob))).toBeGreaterThan(3);
  r.advance(21000);
  let moving = 0, crossings = 0;
  for (let i = 1; i < r.samples.length; i++) {
    const before = r.samples[i - 1]!.yaw, after = r.samples[i]!.yaw;
    if (Math.abs(after - before) > .001) moving++;
    if (before * after < 0) crossings++;
  }
  expect(moving / r.samples.length).toBeLessThan(.35);
  expect(crossings).toBe(2);
  expect(r.samples.filter(p => Math.abs(Math.abs(p.yaw) - .35) < .01).length / r.samples.length).toBeGreaterThan(.65);
  expect(r.samples.some(p => p.yaw > .65)).toBe(true);
  expect(r.samples.some(p => p.yaw < -.65)).toBe(true);
  r.advance(2000); expect(r.pose.yaw).toBeCloseTo(.35, 2);
});

it('smoothly returns to the gentle default angle after work', () => {
  const r = rig(); r.motion.setActivity('running'); r.advance(11500);
  expect(r.pose.yaw).toBeGreaterThan(.2);
  const before = r.pose.yaw; r.motion.setActivity('idle'); r.advance(16);
  expect(Math.abs(r.pose.yaw - before)).toBeLessThan(.05);
  r.advance(2000); expect(r.pose.yaw).toBeCloseTo(.35, 2);
  r.advance(7000); expect(r.pose.yaw).toBeCloseTo(.35, 2);
});

it('ignores a brief pass, then returns from its current angle, blinks and tilts on sustained hover', () => {
  const r = rig(); r.motion.setHovered(true, r.now); r.advance(100);
  expect(r.pose.mode).toBe('idle'); r.motion.setHovered(false, r.now); r.advance(100);
  expect(r.pose.mode).toBe('idle');
  const from = r.pose.yaw; r.motion.setHovered(true, r.now); r.advance(166);
  expect(r.pose.mode).toBe('hover'); expect(r.pose.yaw).toBeGreaterThan(from - .1);
  r.advance(3000);
  expect(Math.abs(r.pose.yaw)).toBeLessThan(.01); expect(Math.abs(r.pose.roll)).toBeGreaterThan(.09);
  expect(r.samples.some(p => p.mode === 'hover' && p.blink < .1)).toBe(true);
  for (let i = 1; i < r.samples.length; i++) expect(Math.abs(r.samples[i]!.yaw - r.samples[i - 1]!.yaw)).toBeLessThan(.05);
});

it('holds attention on leave, ignores rapid re-entry, then resumes idle and alternates the next tilt', () => {
  const r = rig(); r.motion.setHovered(true, r.now); r.advance(2800); const tilt = r.pose.roll;
  r.motion.setHovered(false, r.now); r.advance(400); expect(r.pose.mode).toBe('hover');
  r.motion.setHovered(true, r.now); r.advance(500); expect(Math.sign(r.pose.roll)).toBe(Math.sign(tilt));
  r.motion.setHovered(false, r.now); r.advance(1600); expect(r.pose.mode).toBe('idle');
  expect(Math.abs(r.pose.roll)).toBeLessThan(.01);
  r.motion.setHovered(true, r.now); r.advance(2800); expect(Math.sign(r.pose.roll)).toBe(-Math.sign(tilt));
});

it('clicks and completes with distinct nods and smile eyes without jumping or repeating', () => {
  const r = rig(); r.motion.click(); r.advance(3500);
  expect(r.samples.some(p => p.mode === 'click' && p.pitch > .08)).toBe(true);
  expect(r.samples.some(p => p.mode === 'click' && p.smile)).toBe(true);
  const start = r.samples.length; r.motion.complete(); r.advance(3500);
  expect(r.samples.slice(start).some(p => p.mode === 'complete' && p.pitch < -.05 && p.smile)).toBe(true);
  r.advance(3000); expect(r.pose.mode).toBe('idle');
});

it('shows working glances and thinking, waits quietly, and resets queued completion on a new run/thread', () => {
  const r = rig(); r.motion.setActivity('running'); r.advance(13000);
  expect(r.samples.some(p => p.mode === 'working' && p.yaw > .2)).toBe(true);
  expect(r.samples.some(p => p.mode === 'working' && p.yaw < -.2)).toBe(true);
  expect(r.samples.some(p => p.mode === 'working' && p.pitch > .035)).toBe(true);
  r.motion.setActivity('awaiting-input'); r.advance(2000); expect(r.pose.mode).toBe('waiting');
  expect(Math.abs(r.pose.yaw)).toBeLessThan(.01);
  r.motion.click(); r.motion.complete(); r.motion.reset(); r.advance(3000);
  expect(r.pose.mode).toBe('idle');
  r.motion.complete(); r.motion.setActivity('error'); r.advance(1000); expect(r.pose.mode).not.toBe('complete');
});

it('queues a fast successful completion until the click response has finished', () => {
  const r = rig(); r.motion.click(); r.advance(100); r.motion.complete(); r.advance(5000);
  expect(r.samples.some(p => p.mode === 'click' && p.smile)).toBe(true);
  expect(r.samples.some(p => p.mode === 'complete' && p.smile)).toBe(true);
  expect(r.pose.mode).toBe('idle');
});

it('keeps bubble origins on the mirrored earcup hearts through yaw, tilt, float and sizing', () => {
  const pose = { yaw: .7, pitch: 0, roll: 0, bob: 0 };
  const left = robotHeartOrigin(pose, -1, 80);
  const right = robotHeartOrigin({ ...pose, yaw: -.7 }, 1, 80);
  expect(left.x + right.x).toBeCloseTo(80, 8); expect(left.y).toBeCloseTo(right.y, 8);
  expect(left.x).toBeGreaterThan(8); expect(left.x).toBeLessThan(25);
  const tilted = robotHeartOrigin({ ...pose, roll: Math.PI / 2, bob: 2 }, -1, 80);
  expect(tilted.x).toBeCloseTo(80 - left.y, 8); expect(tilted.y).toBeCloseTo(left.x + 2, 8);
  const larger = robotHeartOrigin(pose, -1, 160);
  expect(larger.x).toBeCloseTo(left.x * 2, 8); expect(larger.y).toBeCloseTo(left.y * 2, 8);
});

it('has one body per angle with aligned vector expressions and identical frontal bank joins', async () => {
  const { robotFrames: f } = await import('../../../plugins/resources/registry/items/foundation/shell-assistant/files/application/shell/assistant-robot-frames');
  expect(f.yawCount).toBe(57); expect(f.pitchCount).toBe(13);
  expect(f.views.length).toBe(f.yawCount + f.pitchCount);
  expect(f.faces.length).toBe(f.views.length);
  for (const index of f.views) { expect(Number.isInteger(index)).toBe(true); expect(index).toBeGreaterThanOrEqual(0); expect(index).toBeLessThan(f.pages.length * f.perPage); }
  expect(f.views[28]).toBe(f.views[f.yawCount + 6]);
  expect(f.faces[28]).toEqual(f.faces[f.yawCount + 6]);
  for (const face of f.faces) {
    expect(face.eyes).toHaveLength(2); expect(face.mouth).toContain('Q');
    expect(face.screen).toMatch(/^M.+Z$/);
    for (const eye of face.eyes) {
      expect(eye.open).toMatch(/^M.+Z$/); expect(eye.smile).toContain('Q');
      expect(eye.center).toHaveLength(2);
      expect(eye.blink).toHaveLength(4);
      for (const coordinate of eye.center) { expect(coordinate).toBeGreaterThan(0); expect(coordinate).toBeLessThan(f.faceSize); }
    }
  }
  const left = f.faces[0]!.eyes, right = f.faces[56]!.eyes;
  expect(left[0]!.center[0]! + right[1]!.center[0]!).toBeCloseTo(f.faceSize, 1);
  expect(left[0]!.center[1]!).toBeCloseTo(right[1]!.center[1]!, 1);
});

it('foreshortens the far eye on the face surface and blinks in the projected surface axes', async () => {
  const { robotFrames: f } = await import('../../../plugins/resources/registry/items/foundation/shell-assistant/files/application/shell/assistant-robot-frames');
  const width = (path: string) => {
    const values = path.match(/-?\d+(?:\.\d+)?/g)!.map(Number).filter((_, i) => i % 2 === 0);
    return Math.max(...values) - Math.min(...values);
  };
  const front = width(f.faces[28]!.eyes[0]!.open), far = width(f.faces[0]!.eyes[0]!.open), near = width(f.faces[0]!.eyes[1]!.open);
  expect(far).toBeLessThan(front * .8); expect(near).toBeGreaterThan(far * 1.25);
  expect(width(f.faces[56]!.eyes[1]!.open)).toBeCloseTo(far, 1);
  for (const face of f.faces) for (const eye of face.eyes) {
    const p = eye.blink;
    expect(p[0]! + p[3]!).toBeCloseTo(1, 4);
    expect(p[0]! * p[3]! - p[1]! * p[2]!).toBeCloseTo(0, 4);
  }
});

it('celebrates a live successful response once, including delayed message projection', () => {
  const feedback = new RobotRunFeedback();
  const complete = { role: 'assistant', status: { type: 'complete' } };
  expect(feedback.observe('a', 'idle', complete)).toBe(false);
  expect(feedback.observe('a', 'running', complete)).toBe(false);
  expect(feedback.observe('a', 'idle', { role: 'assistant', status: { type: 'running' } })).toBe(false);
  expect(feedback.observe('a', 'idle', complete)).toBe(true);
  expect(feedback.observe('a', 'idle', complete)).toBe(false);
});

it.each(['cancelled', 'error', 'awaiting-input', 'thread-switch'] as const)('does not celebrate %s or old history after it', kind => {
  const feedback = new RobotRunFeedback();
  const complete = { role: 'assistant', status: { type: 'complete' } };
  feedback.observe('a', 'running', undefined);
  if (kind === 'cancelled') expect(feedback.observe('a', 'idle', { role: 'assistant', status: { type: 'incomplete', reason: 'cancelled' } })).toBe(false);
  if (kind === 'error' || kind === 'awaiting-input') expect(feedback.observe('a', kind, complete)).toBe(false);
  const thread = kind === 'thread-switch' ? 'b' : 'a';
  expect(feedback.observe(thread, 'idle', complete)).toBe(false);
});
