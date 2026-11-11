// Authoring timeline: rest at 20 degrees, with the original full 40-degree turns.
const ease = value => { const t=Math.max(0,Math.min(1,value));return Math.max(0,Math.min(1,t*t*t*(t*(t*6-15)+10))) };
export function robotPose(seconds) {
  const t=((seconds%32)+32)%32;
  const phase=t%16,side=t<16?1:-1;
  let turn=side*.5;
  if(phase>=11.4&&phase<12)turn=side*(.5+.5*ease((phase-11.4)/.6));
  else if(phase>=12&&phase<12.4)turn=side;
  else if(phase>=12.4&&phase<15)turn=side*(1-2*ease((phase-12.4)/2.6));
  else if(phase>=15&&phase<15.4)turn=-side;
  else if(phase>=15.4)turn=-side*(1-.5*ease((phase-15.4)/.6));
  const blinkTime=t%5.7;
  const closed=ease((blinkTime-2.2)/.11)-ease((blinkTime-2.35)/.16);
  return {turn,yaw:turn*.70,blink:1-.98*closed};
}
