type Vec = {x:number;y:number}
const v = (x=0,y=0):Vec=>({x,y})
const add=(a:Vec,b:Vec)=>v(a.x+b.x,a.y+b.y)
const sub=(a:Vec,b:Vec)=>v(a.x-b.x,a.y-b.y)
const mul=(a:Vec,s:number)=>v(a.x*s,a.y*s)
const len=(a:Vec)=>Math.hypot(a.x,a.y)
const norm=(a:Vec)=>{const l=len(a)||1;return v(a.x/l,a.y/l)}

const canvas = document.getElementById('game') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!

let W=innerWidth,H=innerHeight
const DPR = Math.min(devicePixelRatio||1,2)
function resize(){W=innerWidth;H=innerHeight;canvas.width=W*DPR;canvas.height=H*DPR;canvas.style.width=W+'px';canvas.style.height=H+'px';ctx.setTransform(DPR,0,0,DPR,0,0)}
addEventListener('resize',resize);resize()

// World params
const G = 1800 // gravity px/s^2
const FRICTION = 0.85
const AIR_DRAG = 0.02

// UI
const goldEl = document.getElementById('gold')!
const hooksEl = document.getElementById('hooks')!
const waveEl = document.getElementById('wave')!

// Input
const keys:Record<string,boolean>={}
addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','a','d','A','D',' '].includes(e.key)) e.preventDefault();keys[e.key.toLowerCase()]=true; if(e.key==='r'||e.key==='R') reset()})
addEventListener('keyup',e=>{keys[e.key.toLowerCase()]=false})

let mouse=v();let mouseDown=false
addEventListener('mousemove',e=>{mouse=v(e.clientX,e.clientY)})
addEventListener('mousedown',e=>{if(e.button===0){mouseDown=true; tryHook()}})
addEventListener('mouseup',()=>{mouseDown=false; releaseHook()})

// Entities
type Caravan={pos:Vec,w:number,h:number,speed:number,gold:number,alive:boolean}
type Guard={pos:Vec,vel:Vec,r:number,onCar:Caravan|null,alive:boolean,captured:boolean,dir:1|-1,speed:number}
const caravans:Caravan[]=[]
const guards:Guard[]=[]

const groundY = ()=> H*0.78

const player = {pos:v(W*0.2,groundY()-50),vel:v(),r:18,grounded:false,groundedOnCar:null as Caravan|null,hooks:3,gold:0,alive:true}

let hook:{active:boolean,anchor:Vec,length:number,attachedTo?:Caravan,attachedGuard?:Guard}|null = null

function spawnCaravan(wave:number){
  const w = 140 + Math.random()*120
  const h = 60
  const y = groundY()-h
  const speed = 120 + wave*12 + Math.random()*40
  const gold = 20 + Math.floor(Math.random()*30) + wave*10
  const car={pos:v(W+50,y),w,h,speed,gold,alive:true}
  caravans.push(car)
  spawnGuardsOnCar(car, wave)
}

let wave=1; let tCarSpawn=0

function reset(){
  caravans.length=0
  guards.length=0
  player.pos=v(W*0.2,groundY()-50);player.vel=v();player.grounded=false;player.groundedOnCar=null;player.hooks=3;player.gold=0;player.alive=true
  hook=null
  wave=1; tCarSpawn=0
}

function tryHook(){
  if(!player.alive) return
  if(player.hooks<=0) return
  // ray to mouse; find first caravan/guard intersecting line segment
  const dir=norm(sub(mouse,player.pos))
  const maxLen = 420
  let best:{type:'car'|'guard',car?:Caravan,guard?:Guard,point:Vec,dist:number}|null=null
  for(const car of caravans){
    if(!car.alive) continue
    const rect={x:car.pos.x,y:car.pos.y,w:car.w,h:car.h}
    const hit = rayRect(player.pos,dir,maxLen,rect)
    if(hit){
      if(!best||hit.dist<best.dist) best={type:'car',car,point:hit.point,dist:hit.dist}
    }
  }
  for(const g of guards){
    if(!g.alive) continue
    const hit = rayCircle(player.pos,dir,maxLen,{c:g.pos,r:g.r})
    if(hit){
      if(!best||hit.dist<best.dist) best={type:'guard',guard:g,point:hit.point,dist:hit.dist}
    }
  }
  if(best){
    hook={active:true,anchor:best.point,length:best.dist,attachedTo:best.type==='car'?best.car:undefined,attachedGuard:best.type==='guard'?best.guard:undefined}
    player.hooks--
    updateUI()
  }
}

function releaseHook(){
  if(hook){ hook=null }
}

function rayRect(origin:Vec,dir:Vec,maxLen:number,rect:{x:number;y:number;w:number;h:number}){
  // Ray-AABB intersection (slab method)
  const invX = 1/(dir.x||1e-9); const invY = 1/(dir.y||1e-9)
  let t1 = (rect.x - origin.x) * invX
  let t2 = (rect.x+rect.w - origin.x) * invX
  let t3 = (rect.y - origin.y) * invY
  let t4 = (rect.y+rect.h - origin.y) * invY
  const tmin = Math.max(Math.min(t1,t2), Math.min(t3,t4))
  const tmax = Math.min(Math.max(t1,t2), Math.max(t3,t4))
  if(tmax<0||tmin>tmax) return null
  const t = tmin<0? tmax : tmin
  if(t<0 || t>maxLen) return null
  const point = add(origin, mul(dir, t))
  return {point,dist:t}
}

function rayCircle(origin:Vec,dir:Vec,maxLen:number,circle:{c:Vec;r:number}){
  // Ray-circle intersection: solve |o + t d - c|^2 = r^2
  const oc = sub(origin, circle.c)
  const a = dir.x*dir.x + dir.y*dir.y
  const b = 2*(oc.x*dir.x + oc.y*dir.y)
  const c = oc.x*oc.x + oc.y*oc.y - circle.r*circle.r
  const disc = b*b - 4*a*c
  if(disc<0) return null
  const s = Math.sqrt(disc)
  const t1 = (-b - s)/(2*a)
  const t2 = (-b + s)/(2*a)
  let t = Number.POSITIVE_INFINITY
  if(t1>=0) t = t1
  else if(t2>=0) t = t2
  if(!isFinite(t) || t<0 || t>maxLen) return null
  const point = add(origin, mul(dir, t))
  return {point, dist:t}
}

function updateUI(){
  goldEl.textContent = player.gold.toString()
  hooksEl.textContent = player.hooks.toString()
  waveEl.textContent = wave.toString()
}

let last=performance.now()
let t=0
function loop(now:number){
  const dt=Math.min((now-last)/1000,1/30); last=now
  step(dt)
  draw()
  requestAnimationFrame(loop)
}
requestAnimationFrame(loop)

function step(dt:number){
  t += dt
  const ground=groundY()
  updateSky(dt)
  // spawn
  tCarSpawn-=dt
  if(tCarSpawn<=0){
    spawnCaravan(wave)
    tCarSpawn = Math.max(1.6 - wave*0.05, 0.7) + Math.random()*0.8
  }

  // input
  const left = keys['a']||keys['arrowleft']
  const right = keys['d']||keys['arrowright']
  const jump = keys[' ']

  const move = (right?1:0) - (left?1:0)
  player.vel.x += move * 800 * dt
  if(player.grounded && jump){ player.vel.y = -600; player.grounded=false }

  // gravity
  player.vel.y += G*dt

  // hook physics (rope constraint)
  if(hook&&hook.active){
  const anchor = hook.attachedGuard? hook.attachedGuard.pos : (hook.attachedTo? clampToCar(hook.attachedTo, hook.anchor) : hook.anchor)
    const delta = sub(player.pos, anchor)
    const d = len(delta)
    if(d>hook.length){
      const n = norm(delta)
      const vRel = player.vel
      // project velocity to tangent
      const vn = (vRel.x*n.x+vRel.y*n.y)
      const vt = sub(vRel, mul(n, vn))
      // position correction
      player.pos = add(anchor, mul(n, hook.length))
      // reflect normal component (keeps swing), dampen a bit
      player.vel = add(mul(n, vn>0? vn*0.2 : vn*0.2), mul(vt, 0.98))
      // small tangential boost to feel fun
      player.vel = add(player.vel, mul(v(-n.y,n.x), 20*dt))
    }
  // render rope anchor drift with targets
  if(hook.attachedTo){ hook.anchor = clampToCar(hook.attachedTo, hook.anchor) }
  if(hook.attachedGuard){ hook.anchor = hook.attachedGuard.pos }
  }

  // air drag
  player.vel.x *= (1 - AIR_DRAG)

  // integrate
  player.pos = add(player.pos, mul(player.vel, dt))

  // reset surface state each frame
  player.groundedOnCar = null

  // collide with caravan tops as moving platforms
  for(const car of caravans){
    // only consider top face
    const topY = car.pos.y
    const withinX = player.pos.x > car.pos.x && player.pos.x < car.pos.x + car.w
    const falling = player.vel.y >= -20 // small tolerance
    const closeToTop = (player.pos.y + player.r) >= topY - 16 && (player.pos.y + player.r) <= topY + 32
    if(withinX && falling && closeToTop){
      // place on top
      player.pos.y = topY - player.r
      if(player.vel.y>0) player.vel.y = 0
      player.grounded = true
      player.groundedOnCar = car
      // friction on platform
      player.vel.x *= FRICTION
      break
    }
  }

  // ground collide (if not on caravan)
  if(player.pos.y+player.r>=ground){
    player.pos.y = ground - player.r
    if(player.vel.y>0) player.vel.y = -player.vel.y*0.2
    if(Math.abs(player.vel.y)<60) {player.vel.y=0; player.grounded=true}
    player.vel.x *= FRICTION
  } else player.grounded=false

  // keep in screen
  if(player.pos.x<20) {player.pos.x=20; player.vel.x=0}
  if(player.pos.x>W-20) {player.pos.x=W-20; player.vel.x=0}

  // caravans move and loot
  for(const car of caravans){
    car.pos.x -= car.speed*dt
    // carry player along if standing on this car
    if(player.groundedOnCar===car){
      player.pos.x -= car.speed*dt
    }
  }
  // remove offscreen
  for(let i=caravans.length-1;i>=0;i--){
    const car=caravans[i]
    if(car.pos.x+car.w<-200){caravans.splice(i,1)}
  }

  // loot when standing on top
  for(const car of caravans){
    if(!car.alive||car.gold<=0) continue
    if(player.groundedOnCar===car){
      const take = Math.min(1, car.gold)
      car.gold -= take
      player.gold += take
      if(car.gold<=0) car.alive=false
      updateUI()
    }
  }

  // next waves: every 100 gold
  if(player.gold>=wave*100){ wave++; player.hooks++; updateUI() }

  // guards update
  for(const g of guards){
    if(!g.alive) continue
    if(g.onCar){
      const car = g.onCar
      // stay on top of caravan and be carried by it
      g.pos.y = car.pos.y - g.r - 2
      g.pos.x -= car.speed*dt
      // walk left/right along the roof
      const leftLim = car.pos.x + g.r + 6
      const rightLim = car.pos.x + car.w - g.r - 6
      g.pos.x += g.dir * g.speed * dt
      if(g.pos.x <= leftLim){ g.pos.x = leftLim; g.dir = 1 }
      else if(g.pos.x >= rightLim){ g.pos.x = rightLim; g.dir = -1 }
      // if hooked, detach and apply physics
      if(hook?.attachedGuard===g && mouseDown){
        g.onCar = null
      }
      // push player if on same car and close
      if(player.groundedOnCar===g.onCar){
        const dx = player.pos.x - g.pos.x
        const dist = Math.abs(dx)
        const range = player.r + g.r + 4
        if(dist < range){
          const dir = Math.sign(dx)||1
          player.vel.x += dir * 600 * dt
          // small bump up to destabilize
          if(player.vel.y>=0) player.vel.y = -220
        }
      }
    } else {
      // free physics
      // pull towards player if hooked
      if(hook?.attachedGuard===g){
        const pullDir = norm(sub(player.pos, g.pos))
        const pull = 900
        g.vel = add(g.vel, mul(pullDir, pull*dt))
      }
      // gravity
      g.vel.y += G*dt
      g.vel.x *= (1-AIR_DRAG*1.5)
      g.pos = add(g.pos, mul(g.vel, dt))
      // ground collide
      if(g.pos.y+g.r>=ground){
        g.pos.y = ground - g.r
        if(g.vel.y>140){
          // captured on strong landing
          g.captured=true
          g.alive=false
          player.gold += 10
          updateUI()
          // if hook attached to this guard, release
          if(hook?.attachedGuard===g){ hook=null }
        } else {
          g.vel.y=0
        }
        g.vel.x *= FRICTION
      }
    }
  }
  // prune offscreen or dead guards slowly
  for(let i=guards.length-1;i>=0;i--){
    const g=guards[i]
    if(!g.alive || g.pos.x<-200 || g.pos.x>W+300){ guards.splice(i,1) }
  }
}

function clampToCar(car:Caravan, p:Vec){
  return v(
    Math.max(car.pos.x, Math.min(car.pos.x+car.w, p.x)),
    Math.max(car.pos.y, Math.min(car.pos.y+car.h, p.y))
  )
}

function draw(){
  ctx.clearRect(0,0,W,H)
  drawBackground()
  // caravans
  for(const car of caravans){ drawCaravan(car) }
  // guards
  for(const g of guards){ drawGuard(g) }
  // rope
  if(hook&&hook.active){
    ctx.strokeStyle = '#4cc9f0'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(player.pos.x, player.pos.y)
    ctx.lineTo(hook.anchor.x, hook.anchor.y)
    ctx.stroke()
  }
  // player
  drawPlayer()
}

// --- Pretty starry sky ----------------------------------------------------
type Star={x:number;y:number;r:number;layer:number;tw:number;baseA:number;phase:number;h:number}
type Meteor={x:number;y:number;vx:number;vy:number;life:number;maxLife:number;len:number}
let stars:Star[]=[]
let meteors:Meteor[]=[]
const layers = [
  {speed: 4,  countFactor: 1.0, size: 1.0},
  {speed: 10, countFactor: 0.7, size: 1.4},
  {speed: 22, countFactor: 0.5, size: 1.8},
]
let meteorCooldown = 0

function initSky(){
  stars.length=0
  const skyH = Math.max(100, groundY()-40)
  const area = Math.max(1, W*skyH)
  const baseCount = Math.floor(area/11000)
  for(let li=0; li<layers.length; li++){
    const layer = layers[li]
    const count = Math.max(10, Math.floor(baseCount*layer.countFactor))
    for(let i=0;i<count;i++){
      const s:Star={
        x: Math.random()*W,
        y: Math.random()*skyH*0.95 + 10,
        r: 0.6 + Math.random()*0.9*layer.size,
        layer: li,
        tw: 0.6 + Math.random()*1.2,
        baseA: 0.35 + Math.random()*0.5,
        phase: Math.random()*Math.PI*2,
        h: 190 + Math.random()*60,
      }
      stars.push(s)
    }
  }
}

function updateSky(dt:number){
  if(stars.length===0) initSky()
  const skyTop = 0
  const skyBottom = groundY()-10
  for(const s of stars){
    const sp = layers[s.layer].speed
    s.x -= sp*dt
    if(s.x < -20){ s.x = W+20; s.y = Math.random()*(skyBottom-skyTop) + skyTop }
  }
  // meteors
  meteorCooldown -= dt
  if(meteorCooldown <= 0 && Math.random() < 0.08){
    meteorCooldown = 5 + Math.random()*8
    const startY = 20 + Math.random()* (skyBottom*0.6)
    const m:Meteor={
      x: W+60,
      y: startY,
      vx: -(500+Math.random()*300),
      vy: 180+Math.random()*160,
      life: 1.2+Math.random()*0.8,
      maxLife: 1.2+Math.random()*0.8,
      len: 100+Math.random()*80,
    }
    meteors.push(m)
  }
  for(let i=meteors.length-1;i>=0;i--){
    const m=meteors[i]
    m.life -= dt
    m.x += m.vx*dt
    m.y += m.vy*dt
    if(m.life<=0 || m.x<-200 || m.y>H) meteors.splice(i,1)
  }
}

function drawBackground(){
  const y = groundY()
  // sky gradient
  const g = ctx.createLinearGradient(0,0,0,y)
  g.addColorStop(0, '#0b1220')
  g.addColorStop(0.6, '#141b26')
  g.addColorStop(1, '#18202a')
  ctx.fillStyle=g
  ctx.fillRect(0,0,W,y)

  // milky way band
  ctx.save()
  ctx.globalAlpha=0.12
  ctx.translate(W*0.55, y*0.25)
  ctx.rotate(-0.3)
  const lg = ctx.createLinearGradient(-W,0,W,0)
  lg.addColorStop(0,'rgba(255,255,255,0)')
  lg.addColorStop(0.5,'rgba(190,210,255,1)')
  lg.addColorStop(1,'rgba(255,255,255,0)')
  ctx.fillStyle=lg
  ctx.fillRect(-W, -y*0.25, W*2, y*0.5)
  ctx.restore()

  // stars
  for(const s of stars){
    const tw = s.baseA * (0.7 + 0.3*Math.sin(s.phase + t*s.tw*2))
    ctx.fillStyle = `hsla(${s.h},80%,85%,${tw.toFixed(3)})`
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI*2); ctx.fill()
  }

  // moon
  const mx=W*0.82, my=y*0.18, mr=34
  const mg=ctx.createRadialGradient(mx-8,my-10,8, mx,my,mr)
  mg.addColorStop(0,'#f5f3e8')
  mg.addColorStop(1,'#b8b7aa')
  ctx.fillStyle=mg
  ctx.beginPath(); ctx.arc(mx,my,mr,0,Math.PI*2); ctx.fill()
  ctx.fillStyle='rgba(0,0,0,0.12)'
  for(let i=0;i<6;i++){
    const cx = mx + (Math.random()*2-1)*mr*0.7
    const cy = my + (Math.random()*2-1)*mr*0.6
    const cr = 2 + Math.random()*4
    ctx.beginPath(); ctx.arc(cx,cy,cr,0,Math.PI*2); ctx.fill()
  }

  // meteors
  for(const m of meteors){
    const ax = -m.vx; const ay = -m.vy
    const al = Math.hypot(ax,ay)||1
    const nx = ax/al, ny = ay/al
    const x2 = m.x + nx*m.len
    const y2 = m.y + ny*m.len
    const a = Math.max(0, Math.min(1, m.life / m.maxLife))
    ctx.strokeStyle = `rgba(255,255,255,${(0.3+0.7*a).toFixed(3)})`
    ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(m.x,m.y); ctx.lineTo(x2,y2); ctx.stroke()
  }

  // desert ground
  ctx.fillStyle = '#2a2f36'
  ctx.fillRect(0,y,W,H-y)
  // dunes lines
  ctx.fillStyle = '#3a4048'
  for(let i=0;i<6;i++){
    ctx.fillRect(0, y+ i*8, W, 2)
  }
}

function drawCaravan(car:Caravan){
  // body
  ctx.fillStyle = car.alive? '#b08968' : '#6c584c'
  ctx.fillRect(car.pos.x, car.pos.y, car.w, car.h)
  // wheels
  ctx.fillStyle = '#2f3b3f'
  const wy = car.pos.y+car.h
  for(let i=0;i<3;i++){
    const wx = car.pos.x + (i+0.5)*car.w/3
    ctx.beginPath(); ctx.arc(wx, wy, 12, 0, Math.PI*2); ctx.fill()
  }
  // gold bar indicator
  const pct = Math.max(0,Math.min(1, car.gold/80))
  ctx.fillStyle = '#222'
  ctx.fillRect(car.pos.x+8, car.pos.y+8, car.w-16, 6)
  ctx.fillStyle = '#ffd166'
  ctx.fillRect(car.pos.x+8, car.pos.y+8, (car.w-16)*pct, 6)
}

function drawPlayer(){
  // shadow
  ctx.fillStyle='rgba(0,0,0,.35)'
  ctx.beginPath(); ctx.ellipse(player.pos.x, groundY()+6, 22, 8, 0, 0, Math.PI*2); ctx.fill()
  // body
  ctx.fillStyle = '#4cc9f0'
  ctx.beginPath(); ctx.arc(player.pos.x, player.pos.y, player.r, 0, Math.PI*2); ctx.fill()
  // eye
  ctx.fillStyle = '#0b0f14'
  ctx.beginPath(); ctx.arc(player.pos.x+6, player.pos.y-4, 3, 0, Math.PI*2); ctx.fill()
}

function drawGuard(g:Guard){
  if(!g.alive && !g.captured) return
  // shadow
  ctx.fillStyle='rgba(0,0,0,.3)'
  ctx.beginPath(); ctx.ellipse(g.pos.x, groundY()+5, 14,6,0,0,Math.PI*2); ctx.fill()
  // body
  ctx.fillStyle = '#f72585'
  ctx.beginPath(); ctx.arc(g.pos.x, g.pos.y-4, g.r-2, 0, Math.PI*2); ctx.fill()
  // head
  ctx.fillStyle = '#ffd6a5'
  ctx.beginPath(); ctx.arc(g.pos.x, g.pos.y - g.r-4, g.r*0.55, 0, Math.PI*2); ctx.fill()
}

function spawnGuardsOnCar(car:Caravan, wave:number){
  const count = 1 + (Math.random()<Math.min(0.5, 0.2 + wave*0.05) ? 1:0)
  for(let i=0;i<count;i++){
    const gx = car.pos.x + car.w*(0.25 + 0.5*Math.random())
    const gy = car.pos.y - 14
  const dir:1|-1 = Math.random()<0.5? -1: 1
  const speed = 70 + Math.random()*40 + wave*3
  guards.push({pos:v(gx,gy),vel:v(),r:12,onCar:car,alive:true,captured:false,dir,speed})
  }
}

// expose for debug
// @ts-ignore
window.reset=reset
updateUI()
