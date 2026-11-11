/** Offline model source. No Three.js code is imported by the generated Agent App. */
export function createRobot(THREE, RoundedBoxGeometry, appearance, bodyAtlas) {
  const root = new THREE.Group(); root.name = 'Pearl headphone assistant';
  const meshes = [];
  const physical = (color, options = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: .22, metalness: .06, clearcoat: 1, clearcoatRoughness: .12, ...options });
  const pearl = physical('#ffffff', {vertexColors:true, iridescence: .65, iridescenceIOR: 1.3, iridescenceThicknessRange: [180, 450], roughness: .19 });
  const purple = physical('#ae70e1', {roughness:.62,metalness:.01,clearcoat:.05,specularIntensity:.12,emissive:'#9255cd',emissiveIntensity:.35});
  const connector = physical('#b780e5', {roughness:.22,emissive:'#a164d2',emissiveIntensity:.5});
  const faceMaterial = physical('#ffffff', {vertexColors:true,roughness:.25,clearcoatRoughness:.15,metalness:.08,envMapIntensity:.45,specularIntensity:.45,emissive:'#6940b4',emissiveIntensity:.16});
  const luminous = physical('#fff0ff', {emissive:'#ffb1ed',emissiveIntensity:.9,roughness:.25});
  const pink = physical('#ffd3fa', {emissive:'#ffafed',emissiveIntensity:.6,roughness:.24});
  const rim = new THREE.MeshBasicMaterial({color:'#fff0ff'});
  const headphones=new THREE.Group();headphones.name='Headphone assembly';headphones.scale.setScalar(.92);root.add(headphones);
  function add(name, geometry, material, position=[0,0,0], parent=headphones) {
    const mesh = new THREE.Mesh(geometry,material); mesh.name=name;mesh.position.set(...position);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);meshes.push(mesh);return mesh;
  }
  const head=new THREE.Group();head.name='Rounded head assembly';head.scale.x=.92;root.add(head);
  const bodyGeo=new THREE.SphereGeometry(1,128,96),bodyColors=[];
  const bp=bodyGeo.attributes.position;
  for(let i=0;i<bp.count;i++) {
    const xyz=[bp.getX(i),bp.getY(i),bp.getZ(i)].map(v=>Math.sign(v)*Math.pow(Math.abs(v),2/2.5));
    const [x,y,z]=xyz;bp.setXYZ(i,x*1.20,y*1.08,z*.98);
    const c=new THREE.Color('#c5b4f1');
    const cyan=Math.exp(-((x+.4)**2+(y-.6)**2+(z-.6)**2)/.5)*.65;
    const pink=Math.exp(-((x-.75)**2+(y-.2)**2+(z-.5)**2)/.7)*.5;
    c.lerp(new THREE.Color('#8bddff'),cyan).lerp(new THREE.Color('#f6a4e5'),pink);bodyColors.push(c.r,c.g,c.b);
  }
  bodyGeo.setAttribute('color',new THREE.Float32BufferAttribute(bodyColors,3));bodyGeo.computeVertexNormals();
  add('Pearlescent complete head',bodyGeo,new THREE.MeshBasicMaterial({map:bodyAtlas}),[0,-.14,0],head);
  function roundedRect(w,h,r) {
    const s=new THREE.Shape(),x=-w/2,y=-h/2;
    s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.quadraticCurveTo(x+w,y,x+w,y+r);s.lineTo(x+w,y+h-r);s.quadraticCurveTo(x+w,y+h,x+w-r,y+h);s.lineTo(x+r,y+h);s.quadraticCurveTo(x,y+h,x,y+h-r);s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);return s;
  }
  function frontDepth(x,y) {
    return .98*Math.pow(Math.max(.003,1-Math.pow(Math.abs(x)/1.20,2.5)-Math.pow(Math.abs(y+.14)/1.08,2.5)),1/2.5);
  }
  function surfacePoint(x,y) {
    const power=2/.65,t=Math.pow(Math.pow(Math.abs(x)/1.04,power)+Math.pow(Math.abs(y+.30)/.68,power),1/power);
    return new THREE.Vector3(x,y,frontDepth(x,y)+.022+.018*(1-t*t)+.004);
  }
  const displayVertices=[],displayIndices=[],displayColors=[],displayUV=[],boundary=[];
  const slices=128,rings=32;
  for(let ring=0;ring<=rings;ring++)for(let slice=0;slice<=slices;slice++) {
    const a=slice/slices*Math.PI*2,t=ring/rings;
    const x=1.04*Math.sign(Math.cos(a))*Math.pow(Math.abs(Math.cos(a)),.65)*t;
    const y=.68*Math.sign(Math.sin(a))*Math.pow(Math.abs(Math.sin(a)),.65)*t-.30;
    const z=frontDepth(x,y)+.022+.018*(1-t*t);
    displayVertices.push(x,y,z);displayUV.push(.5+x*.25,1-(.56-(y-.06)*.278));
    const color=new THREE.Color('#9970e6').lerp(new THREE.Color('#aaa7fa'),Math.max(0,(y+.36)/.68)*.60).lerp(new THREE.Color('#ce9df3'),Math.max(0,-(y+.36)/.68)*.45);
    displayColors.push(color.r,color.g,color.b);
    if(ring===rings)boundary.push(new THREE.Vector3(x,y,z+.020));
    if(ring<rings&&slice<slices){const n=ring*(slices+1)+slice;displayIndices.push(n,n+slices+1,n+1,n+1,n+slices+1,n+slices+2)}
  }
  const displayGeo=new THREE.BufferGeometry();displayGeo.setAttribute('position',new THREE.Float32BufferAttribute(displayVertices,3));displayGeo.setIndex(displayIndices);displayGeo.setAttribute('color',new THREE.Float32BufferAttribute(displayColors,3));displayGeo.computeVertexNormals();
  displayGeo.setAttribute('uv',new THREE.Float32BufferAttribute(displayUV,2));
  const coatedFace=new THREE.MeshBasicMaterial({map:appearance});
  add('Curved violet display',displayGeo,coatedFace,[0,0,0],head);
  add('Display pearl lip',new THREE.TubeGeometry(new THREE.CatmullRomCurve3(boundary,true),192,.012,12,true),rim,[0,0,0],head);
  const eyes=[],smileEyes=[];
  for(const side of [-1,1]) {
    const center=surfacePoint(side*.48,-.21),shape=new THREE.Shape();
    shape.moveTo(.11,.12);shape.absarc(0,.12,.11,0,Math.PI,false);shape.lineTo(-.11,-.12);shape.absarc(0,-.12,.11,Math.PI,Math.PI*2,false);shape.closePath();
    const contour=shape.getPoints(20),vertices=[],indices=[],outline=[];
    for(let ring=0;ring<=8;ring++)for(let i=0;i<contour.length;i++) {
      const p=contour[i],point=surfacePoint(center.x+p.x*ring/8,center.y+p.y*ring/8).sub(center);
      vertices.push(point.x,point.y,point.z);if(ring===8)outline.push(point.clone());
      if(ring<8&&i<contour.length-1){const n=ring*contour.length+i;indices.push(n,n+contour.length,n+1,n+1,n+contour.length,n+contour.length+1)}
    }
    const eyeGeo=new THREE.BufferGeometry();eyeGeo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));eyeGeo.setIndex(indices);eyeGeo.computeVertexNormals();
    const eye=add(side<0?'Left luminous eye':'Right luminous eye',eyeGeo,luminous,center.toArray(),head);
    eye.userData.surfaceOutline=outline;eyes.push(eye);
    const light=new THREE.PointLight('#ffadf5',.16,.7,2);light.position.copy(eye.position);light.position.z+=.1;head.add(light);
    const x=side*.48,y=-.21;
    const curve=new THREE.QuadraticBezierCurve3(surfacePoint(x-.10,y-.035),surfacePoint(x,y+.14),surfacePoint(x+.10,y-.035));
    const happy=add('Smile eye '+side,new THREE.TubeGeometry(curve,24,.026,10,false),luminous,[0,0,0],head);happy.visible=false;smileEyes.push(happy);
  }
  const smileCurve=new THREE.QuadraticBezierCurve3(surfacePoint(-.18,-.55),surfacePoint(0,-.66),surfacePoint(.18,-.55));
  add('Soft smile',new THREE.TubeGeometry(smileCurve,40,.025,12,false),luminous,[0,0,0],head);
  class Arch extends THREE.Curve { constructor(radius,z=0){super();this.radius=radius;this.z=z} getPoint(t,target=new THREE.Vector3()){const a=.13+t*(Math.PI-.26);return target.set(Math.cos(a)*this.radius,Math.sin(a)*this.radius+.12,this.z)} }
  const bandGeo=new THREE.TubeGeometry(new Arch(1.43),128,.15,24,false);
  const pos=bandGeo.attributes.position,colors=[];
  const blue=new THREE.Color('#78ddff'),magenta=new THREE.Color('#ff98e8');
  for(let i=0;i<pos.count;i++){const c=blue.clone().lerp(magenta,(pos.getX(i)+1.6)/3.2).lerp(new THREE.Color('#ffffff'),.04);colors.push(c.r,c.g,c.b)}
  bandGeo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  const bandUV=[];for(let i=0;i<pos.count;i++)bandUV.push(.5+pos.getX(i)*.25,1-(.56-pos.getY(i)*.278));bandGeo.setAttribute('uv',new THREE.Float32BufferAttribute(bandUV,2));
  const bandMaterial=new THREE.MeshBasicMaterial({map:appearance});
  const band=add('Iridescent headphone arch',bandGeo,bandMaterial);band.scale.z=.78;
  add('Arch inner white highlight',new THREE.TubeGeometry(new Arch(1.30,.11),128,.014,10,false),rim);
  for(const side of [-1,1]) {
    const c=add(side<0?'Left headband joint':'Right headband joint',new RoundedBoxGeometry(.40,.46,.38,6,.13),connector,[side*1.28,.78,0]);c.rotation.z=side*.37;
    const support=add('Headphone arm',new RoundedBoxGeometry(.15,.65,.23,5,.065),pearl,[side*1.36,.36,0]);support.rotation.z=side*.18;
    for(let segment=0;segment<17;segment++) {
      const angle=segment*Math.PI*2/17;
      const pad=add('Cushion '+side+' '+segment,new RoundedBoxGeometry(.31,.30,.32,5,.10),purple,
        [side*1.16,-.16+Math.cos(angle)*.65,.03+Math.sin(angle)*.62]);
      pad.rotation.x=angle+Math.PI/2;
    }
    const cup=add('Rounded earcup '+side,new THREE.SphereGeometry(1,64,40),physical('#bc86e5',{roughness:.22,iridescence:.28}),[side*1.46,-.16,.03]);cup.scale.set(.205,.70,.70);
    const diskGeo=new THREE.SphereGeometry(1,64,40),duv=[];for(let i=0;i<diskGeo.attributes.position.count;i++)duv.push(.5+diskGeo.attributes.position.getZ(i)*.5,.5+diskGeo.attributes.position.getY(i)*.5);diskGeo.setAttribute('uv',new THREE.Float32BufferAttribute(duv,2));
    const paint=document.createElement('canvas');paint.width=paint.height=256;const ctx=paint.getContext('2d');const gradient=ctx.createRadialGradient(116,118,10,128,128,136);gradient.addColorStop(0,'#b29aea');gradient.addColorStop(.62,'#c68ce9');gradient.addColorStop(1,'#efb1f0');ctx.fillStyle=gradient;ctx.fillRect(0,0,256,256);ctx.save();ctx.translate(72,53);ctx.rotate(-.45);ctx.scale(1,.40);const shine=ctx.createRadialGradient(0,0,0,0,0,79);shine.addColorStop(0,'#fff4ffcc');shine.addColorStop(1,'#eee2ff00');ctx.fillStyle=shine;ctx.fillRect(-110,-110,220,220);ctx.restore();const tex=new THREE.CanvasTexture(paint);tex.colorSpace=THREE.SRGBColorSpace;
    const disc=add('Pearlescent earcup face '+side,diskGeo,new THREE.MeshBasicMaterial({map:tex}),[side*1.57,-.16,.03]);disc.scale.set(.10,.59,.59);
    const ring=add('Pink illuminated rim '+side,new THREE.TorusGeometry(.585,.034,16,96),pink,[side*1.625,-.16,.03]);ring.rotation.y=Math.PI/2;ring.scale.y=1.0;
    const core=add('Soft white rim core '+side,new THREE.TorusGeometry(.585,.011,12,96),luminous,[side*1.639,-.16,.03]);core.rotation.y=Math.PI/2;
    const whiteRing=add('Rim highlight '+side,new THREE.TorusGeometry(.625,.012,12,96),rim,[side*1.59,-.16,.03]);whiteRing.rotation.y=Math.PI/2;whiteRing.scale.y=1.0;
    const heart=new THREE.Shape();heart.moveTo(0,-.23);heart.bezierCurveTo(-.08,-.14,-.28,.005,-.28,.14);heart.bezierCurveTo(-.28,.34,-.07,.38,0,.25);heart.bezierCurveTo(.07,.38,.28,.34,.28,.14);heart.bezierCurveTo(.28,.005,.08,-.14,0,-.23);
    const h=add('Glowing heart '+side,new THREE.ExtrudeGeometry(heart,{depth:.008,bevelEnabled:true,bevelThickness:.018,bevelSize:.018,bevelSegments:6,curveSegments:24}),luminous,[side*1.686,-.19,.03]);h.rotation.y=side*Math.PI/2;h.scale.set(1.08,.73,.78);
  }
  root.userData.source='Modelled as solid geometry from the user supplied headphone robot reference; no image-to-image view crossfade.';
  return {root,eyes,smileEyes,meshes,surfacePoint};
}
