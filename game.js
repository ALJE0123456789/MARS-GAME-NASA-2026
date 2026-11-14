// --- 1. GAME STATE ---
let isGameRunning = false;
let o2 = 100, power = 100, timeSurvived = 0;
let o2Cooldown = 0;
let currentRole = 1, isGameOver = false;

let tasks = [];
let currentTaskIndex = 0;
let taskProgress = 0; 

let eventTimer = 0;
let currentEvent = "None";
let eventEndTime = 0;

// Doors Data
let doors = {
    hab: { mesh: null, open: false, pos: 0, closedPos: 0, openPos: -35 },
    mine: { mesh: null, open: false, pos: 0, closedPos: 0, openPos: -40 },
    nuke: { mesh: null, open: false, pos: 0, closedPos: 0, openPos: -25 },
    garage: { mesh: null, open: false, pos: 0, closedPos: 0, openPos: -40 },
    ice: { mesh: null, open: false, pos: 0, closedPos: 0, openPos: -25 }
};
let doorCooldown = 0;

// Camera State
let camDist = 30;
let camHeight = 20;
let isInsideBuilding = false;

// --- 2. AUDIO SYNTHESIS ---
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx, stormGain, lowO2Gain;

function initAudio() {
    if(!audioCtx) audioCtx = new AudioContext();
    if(audioCtx.state === 'suspended') audioCtx.resume();

    const bufferSize = audioCtx.sampleRate * 2;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    let stormOsc = audioCtx.createBufferSource(); stormOsc.buffer = buffer; stormOsc.loop = true;
    stormGain = audioCtx.createGain(); stormGain.gain.setValueAtTime(0, audioCtx.currentTime);
    const filter = audioCtx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 400;
    stormOsc.connect(filter); filter.connect(stormGain); stormGain.connect(audioCtx.destination); stormOsc.start();

    lowO2Gain = audioCtx.createGain();
    lowO2Gain.gain.setValueAtTime(0, audioCtx.currentTime);
    lowO2Gain.connect(audioCtx.destination);
    
    setInterval(() => {
        if(isGameRunning && !isGameOver && o2 < 20 && o2 > 0) playSFX('lowO2');
    }, 500);
}

function playSFX(type) {
    if(!audioCtx) return;
    if(type === 'lowO2') {
        const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
        osc.type = 'square'; osc.frequency.setValueAtTime(880, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
        osc.connect(gain); gain.connect(audioCtx.destination); osc.start(); osc.stop(audioCtx.currentTime + 0.2);
        return;
    }

    const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    
    if(type === 'door') {
        osc.type = 'triangle'; osc.frequency.setValueAtTime(60, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(150, audioCtx.currentTime + 1.2);
        gain.gain.setValueAtTime(0.4, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 1.5);
        osc.start(); osc.stop(audioCtx.currentTime + 1.5);
    } else if(type === 'work') {
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(50 + Math.random()*50, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.05, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        osc.start(); osc.stop(audioCtx.currentTime + 0.1);
    } else if(type === 'refill') {
        osc.type = 'sine'; osc.frequency.setValueAtTime(400, audioCtx.currentTime);
        osc.frequency.linearRampToValueAtTime(800, audioCtx.currentTime + 0.5);
        gain.gain.setValueAtTime(0.2, audioCtx.currentTime); gain.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
        osc.start(); osc.stop(audioCtx.currentTime + 0.5);
    }
}

// --- 3. THREE.JS SETUP ---
const scene = new THREE.Scene(); 
scene.background = new THREE.Color(0x2a0a0a); 
scene.fog = new THREE.FogExp2(0x2a0a0a, 0.002); 

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 3000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 0.4));
const dirLight = new THREE.DirectionalLight(0xffaa88, 1);
dirLight.position.set(200, 300, 200); dirLight.castShadow = true;
dirLight.shadow.camera.left = -400; dirLight.shadow.camera.right = 400; dirLight.shadow.camera.top = 400; dirLight.shadow.camera.bottom = -400;
scene.add(dirLight);

// Stars
const starsGeometry = new THREE.BufferGeometry();
const starPositions = new Float32Array(10000 * 3);
for(let i=0; i < 10000 * 3; i++) starPositions[i] = (Math.random() - 0.5) * 1500;
starsGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
scene.add(new THREE.Points(starsGeometry, new THREE.PointsMaterial({color: 0xffffff, size: 1})));

// MARTIAN SKY
const skyGeo = new THREE.SphereGeometry(1500, 32, 15);
const skyMat = new THREE.ShaderMaterial({
    uniforms: { topColor: { value: new THREE.Color(0x3a1a1a) }, bottomColor: { value: new THREE.Color(0xaa5533) }, offset: { value: 33 }, exponent: { value: 0.6 } },
    vertexShader: `varying vec3 vWorldPosition; void main() { vec4 worldPosition = modelMatrix * vec4( position, 1.0 ); vWorldPosition = worldPosition.xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`,
    fragmentShader: `uniform vec3 topColor; uniform vec3 bottomColor; uniform float offset; uniform float exponent; varying vec3 vWorldPosition; void main() { float h = normalize( vWorldPosition + offset ).y; gl_FragColor = vec4( mix( bottomColor, topColor, max( pow( max( h , 0.0), exponent ), 0.0 ) ), 1.0 ); }`,
    side: THREE.BackSide
});
scene.add(new THREE.Mesh(skyGeo, skyMat));

// --- 4. TERRAIN (800x800 MAP) ---
function getGroundHeight(x, z) {
    return Math.sin(x * 0.02) * Math.cos(z * 0.02) * 10.0 + Math.sin(x * 0.1) * Math.cos(z * 0.1) * 2.0;
}
const groundGeo = new THREE.PlaneGeometry(800, 800, 128, 128);
const posAttribute = groundGeo.attributes.position;
for (let i = 0; i < posAttribute.count; i++) {
    posAttribute.setZ(i, getGroundHeight(posAttribute.getX(i), posAttribute.getY(i))); 
}
groundGeo.computeVertexNormals();
const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ color: 0x8b3a3a, roughness: 0.9, flatShading: true }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

// --- COLLISION & DOOR ZONES (GLOBAL COORDINATES) ---
const colliders = [];
const doorZones = [];

// A. HABITAT DOME (Center 0,0,0. Radius 50)
const habGroup = new THREE.Group();
const habRadius = 50;
const dome = new THREE.Mesh(new THREE.SphereGeometry(habRadius, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({color: 0x00ffff, transparent: true, opacity: 0.15, emissive: 0x00ffff, emissiveIntensity: 0.1}));
dome.position.y = 0; habGroup.add(dome);

// Door
const habDoor = new THREE.Mesh(new THREE.BoxGeometry(30, 35, 2), new THREE.MeshStandardMaterial({color: 0xf1c40f, emissive: 0x442200}));
habDoor.position.set(0, 17.5, 48); habGroup.add(habDoor);
doors.hab.mesh = habDoor;

// Interior Details
const habFloor = new THREE.Mesh(new THREE.CylinderGeometry(48, 48, 1, 32), new THREE.MeshStandardMaterial({color: 0x111122, emissive: 0x001133}));
habFloor.position.y = 0.5; habGroup.add(habFloor);
const habCore = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 25), new THREE.MeshStandardMaterial({color: 0x00ffff, emissive: 0x00ffff, emissiveIntensity: 1}));
habCore.position.y = 12.5; habGroup.add(habCore);
const habLight = new THREE.PointLight(0x00ffff, 4, 150); habLight.position.set(0, 30, 0); habGroup.add(habLight);
const habHolo = new THREE.Mesh(new THREE.BoxGeometry(20, 10, 0.1), new THREE.MeshBasicMaterial({color: 0x00ffff, transparent: true, opacity: 0.6}));
habHolo.position.set(0, 25, -20); habGroup.add(habHolo);

// Colliders (Hollow Box)
colliders.push({ minX: -50, maxX: -15, minZ: 48, maxZ: 50, id: 'hab_wall' }); // Front Left
colliders.push({ minX: 15, maxX: 50, minZ: 48, maxZ: 50, id: 'hab_wall' }); // Front Right
colliders.push({ minX: -50, maxX: 50, minZ: -50, maxZ: -48, id: 'hab_wall' }); // Back
colliders.push({ minX: -50, maxX: -48, minZ: -50, maxZ: 50, id: 'hab_wall' }); // Left
colliders.push({ minX: 48, maxX: 50, minZ: -50, maxZ: 50, id: 'hab_wall' }); // Right
doorZones.push({ pos: new THREE.Vector3(0, 0, 55), radius: 20, id: 'hab' });
scene.add(habGroup);

// B. MINING RIG (Center -150,0,-150. Size 100x100)
const drillGroup = new THREE.Group();
const bMat = new THREE.MeshStandardMaterial({color: 0x333333, metalness: 0.8});
const w1 = new THREE.Mesh(new THREE.BoxGeometry(100, 40, 4), bMat); w1.position.set(0, 20, -50); drillGroup.add(w1);
const w2 = new THREE.Mesh(new THREE.BoxGeometry(100, 40, 4), bMat); w2.position.set(0, 20, 50); drillGroup.add(w2);
const w3 = new THREE.Mesh(new THREE.BoxGeometry(4, 40, 100), bMat); w3.position.set(-50, 20, 0); drillGroup.add(w3);
const w4 = new THREE.Mesh(new THREE.BoxGeometry(4, 40, 100), bMat); w4.position.set(50, 20, 0); drillGroup.add(w4);
const roof = new THREE.Mesh(new THREE.BoxGeometry(104, 4, 104), bMat); roof.position.set(0, 42, 0); drillGroup.add(roof);

// Door
const mineDoor = new THREE.Mesh(new THREE.BoxGeometry(40, 35, 2), new THREE.MeshStandardMaterial({color: 0xf1c40f, emissive: 0x442200}));
mineDoor.position.set(0, 17.5, 50); drillGroup.add(mineDoor);
doors.mine.mesh = mineDoor;

// Interior Details
const mineFloor = new THREE.Mesh(new THREE.BoxGeometry(96, 1, 96), new THREE.MeshStandardMaterial({color: 0x111111, roughness: 0.2, metalness: 0.9}));
mineFloor.position.y = 0.5; drillGroup.add(mineFloor);
const mainDrill = new THREE.Mesh(new THREE.CylinderGeometry(15, 5, 35, 16), new THREE.MeshStandardMaterial({color: 0xffaa00, metalness: 0.9, emissive: 0x441100}));
mainDrill.position.set(-20, 17.5, 0); drillGroup.add(mainDrill);
const conveyor = new THREE.Mesh(new THREE.BoxGeometry(10, 2, 80), new THREE.MeshStandardMaterial({color: 0x111111})); conveyor.position.set(20, 5, 0); drillGroup.add(conveyor);
const interiorLight = new THREE.PointLight(0xff5500, 5, 200); interiorLight.position.set(0, 35, 0); drillGroup.add(interiorLight);
// Neon pipes
for(let i=-40; i<=40; i+=20) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 40), new THREE.MeshBasicMaterial({color: 0xff00ff}));
    pipe.position.set(i, 20, -45); drillGroup.add(pipe);
}

// Colliders (Global)
colliders.push({ minX: -200, maxX: -175, minZ: -104, maxZ: -100, id: 'mine_wall' }); // Front L
colliders.push({ minX: -125, maxX: -100, minZ: -104, maxZ: -100, id: 'mine_wall' }); // Front R
colliders.push({ minX: -200, maxX: -100, minZ: -200, maxZ: -196, id: 'mine_wall' }); // Back
colliders.push({ minX: -200, maxX: -196, minZ: -200, maxZ: -100, id: 'mine_wall' }); // Left
colliders.push({ minX: -104, maxX: -100, minZ: -200, maxZ: -100, id: 'mine_wall' }); // Right
doorZones.push({ pos: new THREE.Vector3(-150, 0, -90), radius: 25, id: 'mine' });
drillGroup.position.set(-150, 0, -150);
scene.add(drillGroup);

// C. NUCLEAR GENERATOR (Center -150,0,100. Radius 30)
const nukeGroup = new THREE.Group();
const nukeBase = new THREE.Mesh(new THREE.CylinderGeometry(30, 30, 40, 32), new THREE.MeshStandardMaterial({color: 0x444444}));
nukeBase.position.y = 20; nukeGroup.add(nukeBase);

// Door
const nukeDoor = new THREE.Mesh(new THREE.BoxGeometry(25, 25, 2), new THREE.MeshStandardMaterial({color: 0x00ff00, emissive: 0x004400}));
nukeDoor.position.set(0, 12.5, 28); nukeGroup.add(nukeDoor);
doors.nuke.mesh = nukeDoor;

// Interior
const nukeFloor = new THREE.Mesh(new THREE.CylinderGeometry(28, 28, 1, 32), new THREE.MeshStandardMaterial({color: 0x003300, metalness: 0.9}));
nukeFloor.position.y = 0.5; nukeGroup.add(nukeFloor);
const nukeCore = new THREE.Mesh(new THREE.SphereGeometry(12, 16, 16), new THREE.MeshStandardMaterial({color: 0x00ff00, emissive: 0x00ff00, emissiveIntensity: 2}));
nukeCore.position.y = 20; nukeGroup.add(nukeCore);
const nukeLight = new THREE.PointLight(0x00ff00, 6, 150); nukeLight.position.set(0, 20, 0); nukeGroup.add(nukeLight);

colliders.push({ minX: -180, maxX: -155, minZ: 128, maxZ: 130, id: 'nuke_wall' }); // Front L
colliders.push({ minX: -145, maxX: -120, minZ: 128, maxZ: 130, id: 'nuke_wall' }); // Front R
colliders.push({ minX: -180, maxX: -120, minZ: 70, maxZ: 72, id: 'nuke_wall' }); // Back
colliders.push({ minX: -180, maxX: -178, minZ: 70, maxZ: 130, id: 'nuke_wall' }); // Left
colliders.push({ minX: -122, maxX: -120, minZ: 70, maxZ: 130, id: 'nuke_wall' }); // Right
doorZones.push({ pos: new THREE.Vector3(-150, 0, 135), radius: 20, id: 'nuke' });
nukeGroup.position.set(-150, 0, 100);
scene.add(nukeGroup);

// D. ROVER GARAGE (Center 150,0,150. Size 80x60)
const garageGroup = new THREE.Group();
const gBase = new THREE.Mesh(new THREE.BoxGeometry(80, 30, 60), new THREE.MeshStandardMaterial({color: 0x777777}));
gBase.position.y = 15; garageGroup.add(gBase);
const gRoof = new THREE.Mesh(new THREE.ConeGeometry(60, 20, 4), new THREE.MeshStandardMaterial({color: 0x333333}));
gRoof.position.y = 40; gRoof.rotation.y = Math.PI/4; garageGroup.add(gRoof);

// Door
const gDoor = new THREE.Mesh(new THREE.BoxGeometry(40, 25, 2), new THREE.MeshStandardMaterial({color: 0xf1c40f, emissive: 0x442200}));
gDoor.position.set(0, 12.5, 30); garageGroup.add(gDoor);
doors.garage.mesh = gDoor;

// Interior
const gFloor = new THREE.Mesh(new THREE.BoxGeometry(76, 1, 56), new THREE.MeshStandardMaterial({color: 0x222222}));
gFloor.position.y = 0.5; garageGroup.add(gFloor);
const rover = new THREE.Group();
const rBody = new THREE.Mesh(new THREE.BoxGeometry(10, 5, 16), new THREE.MeshStandardMaterial({color: 0xdddddd})); rBody.position.y = 4; rover.add(rBody);
const rHeadlight = new THREE.PointLight(0xffffff, 2, 30); rHeadlight.position.set(0, 5, 8); rover.add(rHeadlight);
rover.position.set(0, 0, -5); garageGroup.add(rover);
const gLight = new THREE.PointLight(0xffffff, 4, 120); gLight.position.set(0, 25, 0); garageGroup.add(gLight);
// Holographic tool rack
const rack = new THREE.Mesh(new THREE.BoxGeometry(20, 10, 1), new THREE.MeshBasicMaterial({color: 0x00ffff, transparent: true, opacity: 0.5}));
rack.position.set(0, 15, -28); garageGroup.add(rack);

colliders.push({ minX: 110, maxX: 130, minZ: 178, maxZ: 180, id: 'garage_wall' }); // Front L
colliders.push({ minX: 170, maxX: 190, minZ: 178, maxZ: 180, id: 'garage_wall' }); // Front R
colliders.push({ minX: 110, maxX: 190, minZ: 120, maxZ: 122, id: 'garage_wall' }); // Back
colliders.push({ minX: 110, maxX: 112, minZ: 120, maxZ: 180, id: 'garage_wall' }); // Left
colliders.push({ minX: 188, maxX: 190, minZ: 120, maxZ: 180, id: 'garage_wall' }); // Right
doorZones.push({ pos: new THREE.Vector3(150, 0, 185), radius: 25, id: 'garage' });
garageGroup.position.set(150, 0, 150);
scene.add(garageGroup);

// E. ICE DRILL (Center -150,0,150. Size 50x50)
const iceGroup = new THREE.Group();
const iBase = new THREE.Mesh(new THREE.BoxGeometry(50, 30, 50), new THREE.MeshStandardMaterial({color: 0xaaaaaa, metalness: 0.8}));
iBase.position.y = 15; iceGroup.add(iBase);

// Door
const iceDoor = new THREE.Mesh(new THREE.BoxGeometry(24, 20, 2), new THREE.MeshStandardMaterial({color: 0x00ffff, transparent: true, opacity: 0.8, metalness: 0.9}));
iceDoor.position.set(0, 10, 25); iceGroup.add(iceDoor);
doors.ice.mesh = iceDoor;

// Interior
const iFloor = new THREE.Mesh(new THREE.BoxGeometry(46, 1, 46), new THREE.MeshStandardMaterial({color: 0x002244, metalness: 0.9}));
iFloor.position.y = 0.5; iceGroup.add(iFloor);
const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(10), new THREE.MeshStandardMaterial({color: 0x00ffff, emissive: 0x00ffff, emissiveIntensity: 1.5, transparent: true}));
crystal.position.y = 15; iceGroup.add(crystal);
const iLight = new THREE.PointLight(0x00ffff, 5, 100); iLight.position.set(0, 20, 0); iceGroup.add(iLight);

colliders.push({ minX: -175, maxX: -162, minZ: 173, maxZ: 175, id: 'ice_wall' }); // Front L
colliders.push({ minX: -138, maxX: -125, minZ: 173, maxZ: 175, id: 'ice_wall' }); // Front R
colliders.push({ minX: -175, maxX: -125, minZ: 125, maxZ: 127, id: 'ice_wall' }); // Back
colliders.push({ minX: -175, maxX: -173, minZ: 125, maxZ: 175, id: 'ice_wall' }); // Left
colliders.push({ minX: -127, maxX: -125, minZ: 125, maxZ: 175, id: 'ice_wall' }); // Right
doorZones.push({ pos: new THREE.Vector3(-150, 0, 180), radius: 20, id: 'ice' });
iceGroup.position.set(-150, 0, 150);
scene.add(iceGroup);

// F. O2 TOWER & COMMS DISH (Outside)
const o2Group = new THREE.Group();
const tower = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 40, 12), new THREE.MeshStandardMaterial({color: 0xffffff, emissive: 0x00ffff, emissiveIntensity: 0.5}));
tower.position.y = 20; o2Group.add(tower); o2Group.position.set(150, 0, -100);
colliders.push({ minX: 140, maxX: 160, minZ: -110, maxZ: -90 });
scene.add(o2Group);

const commsGroup = new THREE.Group();
const dish = new THREE.Mesh(new THREE.SphereGeometry(15, 16, 8, 0, Math.PI * 2, 0, Math.PI / 3), new THREE.MeshStandardMaterial({color: 0xffffff, side: THREE.DoubleSide}));
dish.rotation.x = -Math.PI / 4; dish.position.y = 20;
const mast = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 20), new THREE.MeshStandardMaterial({color: 0xaaaaaa})); mast.position.y = 10;
commsGroup.add(dish); commsGroup.add(mast); commsGroup.position.set(-100, 0, -50);
colliders.push({ minX: -115, maxX: -85, minZ: -65, maxZ: -35 });
scene.add(commsGroup);


// --- 6. ASTRONAUT ---
const playerGroup = new THREE.Group();
const suitMat = new THREE.MeshStandardMaterial({color: 0xffffff, roughness: 0.6});
const visorMat = new THREE.MeshStandardMaterial({color: 0x3498db, emissive: 0x3498db, emissiveIntensity: 0.8});

const torso = new THREE.Mesh(new THREE.BoxGeometry(2, 2.5, 1.2), suitMat); torso.position.y = 2.5; torso.castShadow = true; playerGroup.add(torso);
const backpack = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2, 0.8), new THREE.MeshStandardMaterial({color: 0x444444})); backpack.position.set(0, 2.5, -1); playerGroup.add(backpack);
const head = new THREE.Mesh(new THREE.SphereGeometry(0.8, 16, 16), suitMat); head.position.y = 4.2; playerGroup.add(head);
const visor = new THREE.Mesh(new THREE.SphereGeometry(0.65, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2), visorMat); visor.position.set(0, 4.2, 0.4); visor.rotation.x = Math.PI / 2; playerGroup.add(visor);

const leftArmGroup = new THREE.Group(); leftArmGroup.position.set(-1.3, 3.5, 0);
const leftArm = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 2), suitMat); leftArm.position.y = -1; leftArmGroup.add(leftArm); playerGroup.add(leftArmGroup);
const rightArmGroup = new THREE.Group(); rightArmGroup.position.set(1.3, 3.5, 0);
const rightArm = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 2), suitMat); rightArm.position.y = -1; rightArmGroup.add(rightArm); playerGroup.add(rightArmGroup);
const leftLegGroup = new THREE.Group(); leftLegGroup.position.set(-0.5, 1.25, 0);
const leftLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.3, 2.5), suitMat); leftLeg.position.y = -1.25; leftLegGroup.add(leftLeg); playerGroup.add(leftLegGroup);
const rightLegGroup = new THREE.Group(); rightLegGroup.position.set(0.5, 1.25, 0);
const rightLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.3, 2.5), suitMat); rightLeg.position.y = -1.25; rightLegGroup.add(rightLeg); playerGroup.add(rightLegGroup);

const headlamp = new THREE.SpotLight(0xffffff, 3, 100, Math.PI / 4, 0.5);
headlamp.position.set(0, 4.2, 0.8); headlamp.target.position.set(0, 0, 15);
playerGroup.add(headlamp); playerGroup.add(headlamp.target);

scene.add(playerGroup);
playerGroup.position.set(0, getGroundHeight(0, 60) + 2.5, 60);

// --- 7. TASKS & BEACON ---
const outposts = [
    { name: 'Solar Array', pos: new THREE.Vector3(100, 20, 100), role: 1, action: 'Repair Solar Panels' },
    { name: 'Comms Dish', pos: new THREE.Vector3(-100, 0, -50), role: 1, action: 'Align Comms Dish' },
    { name: 'Mining Rig', pos: new THREE.Vector3(-150, 0, -150), role: 2, action: 'Clear Drill Jam' },
    { name: 'Nuclear Generator', pos: new THREE.Vector3(-150, 0, 100), role: 1, action: 'Stabilize Core' },
    { name: 'Rover Garage', pos: new THREE.Vector3(150, 0, 150), role: 2, action: 'Repair Rover Tracks' },
    { name: 'Ice Drill', pos: new THREE.Vector3(-150, 0, 150), role: 3, action: 'Clear Ice Blockage' }
];

function generateTasks() {
    let taskList = [];
    for(let i=0; i<50; i++) {
        let outpost = outposts[Math.floor(Math.random() * outposts.length)];
        taskList.push({ text: `${outpost.action} at ${outpost.name}`, targetPos: outpost.pos, requiredRole: outpost.role, outpostName: outpost.name });
    }
    return taskList;
}

const beaconGeo = new THREE.CylinderGeometry(3, 3, 200, 16);
const beaconMat = new THREE.MeshBasicMaterial({color: 0xff0000, transparent: true, opacity: 0.3});
const beacon = new THREE.Mesh(beaconGeo, beaconMat);
scene.add(beacon);

// --- 8. CONTROLS ---
let yaw = 0, pitch = Math.PI / 6; 
let isMouseLocked = false;

document.body.addEventListener('click', () => { if(isGameRunning && !isGameOver) document.body.requestPointerLock(); });
document.addEventListener('pointerlockchange', () => { isMouseLocked = (document.pointerLockElement === document.body); });
document.addEventListener('mousemove', (e) => {
    if(!isMouseLocked || !isGameRunning || isGameOver) return;
    yaw -= e.movementX * 0.0025; pitch -= e.movementY * 0.0025;
    pitch = Math.max(-Math.PI / 6, Math.min(Math.PI / 3, pitch)); 
});

const keys = { w: false, a: false, s: false, d: false, e: false, space: false };
const speed = 1.2;
let velocityY = 0, isGrounded = true, walkTime = 0;
const gravity = -0.04, jumpForce = 1.0;

window.addEventListener('keydown', (e) => {
    if(!isGameRunning || isGameOver) return;
    if(e.key.toLowerCase() === 'w' || e.key === 'ArrowUp') keys.w = true;
    if(e.key.toLowerCase() === 's' || e.key === 'ArrowDown') keys.s = true;
    if(e.key.toLowerCase() === 'a' || e.key === 'ArrowLeft') keys.a = true;
    if(e.key.toLowerCase() === 'd' || e.key === 'ArrowRight') keys.d = true;
    if(e.key.toLowerCase() === 'e') keys.e = true;
    if(e.key === ' ') keys.space = true;
    
    if(e.key === '1') switchRole(1, 0x3498db);
    if(e.key === '2') switchRole(2, 0x2ecc71);
    if(e.key === '3') switchRole(3, 0xe74c3c);
});

window.addEventListener('keyup', (e) => {
    if(e.key.toLowerCase() === 'w' || e.key === 'ArrowUp') keys.w = false;
    if(e.key.toLowerCase() === 's' || e.key === 'ArrowDown') keys.s = false;
    if(e.key.toLowerCase() === 'a' || e.key === 'ArrowLeft') keys.a = false;
    if(e.key.toLowerCase() === 'd' || e.key === 'ArrowRight') keys.d = false;
    if(e.key.toLowerCase() === 'e') keys.e = false;
    if(e.key === ' ') keys.space = false;
});

function switchRole(role, color) {
    currentRole = role;
    visorMat.color.setHex(color); visorMat.emissive.setHex(color);
    const roleText = document.getElementById('role-text');
    if(role === 1) { roleText.innerText = "ROLE: ENGINEER (Blue)"; roleText.style.color = "#3498db"; }
    if(role === 2) { roleText.innerText = "ROLE: EXPLORER (Green)"; roleText.style.color = "#2ecc71"; }
    if(role === 3) { roleText.innerText = "ROLE: MEDIC (Red)"; roleText.style.color = "#e74c3c"; }
}

document.getElementById('startBtn').addEventListener('click', () => {
    initAudio();
    let bgm = document.getElementById('bgm');
    if(bgm) { bgm.volume = 0.5; bgm.play().catch(e => console.log("Audio failed")); }
    document.getElementById('menu').style.display = 'none';
    document.getElementById('hud').style.display = 'flex';
    isGameRunning = true;
    tasks = generateTasks(); currentTaskIndex = 0; updateTaskUI();
});

function updateTaskUI() {
    if(currentTaskIndex >= tasks.length) { winGame(); return; }
    let task = tasks[currentTaskIndex];
    document.getElementById('quest-text').innerText = `TASK ${currentTaskIndex + 1}/50: ${task.text}`;
    beacon.position.copy(task.targetPos); beacon.position.y = task.targetPos.y + 100; 
    beaconMat.color.setHex(task.requiredRole === 1 ? 0x3498db : (task.requiredRole === 2 ? 0x2ecc71 : 0xe74c3c));
    document.getElementById('task-count').innerText = currentTaskIndex + 1;
    document.getElementById('task-bar-fill').style.width = '0%'; taskProgress = 0;
}

// --- 9. GAME LOOP ---
let clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    if(!isGameRunning || isGameOver) return;

    const delta = clock.getDelta();
    
    mainDrill.rotation.y += delta * 2; 
    crystal.rotation.y += delta * 1.5;
    nukeCore.scale.setScalar(1 + Math.sin(timeSurvived * 5) * 0.1);
    rover.rotation.y += Math.sin(timeSurvived) * delta * 0.1;

    if (currentEvent === 'Dust Storm') {
        skyMat.uniforms.topColor.value.setHex(0x1a0505); skyMat.uniforms.bottomColor.value.setHex(0x441100);
    } else {
        skyMat.uniforms.topColor.value.setHex(0x3a1a1a); skyMat.uniforms.bottomColor.value.setHex(0xaa5533);
    }

    eventTimer += delta;
    if(eventTimer > 18 && currentEvent === "None") {
        currentEvent = Math.random() > 0.5 ? 'Dust Storm' : 'Comms Blackout';
        document.getElementById('event-alert').style.display = 'block';
        document.getElementById('event-alert').innerText = `WARNING: ${currentEvent.toUpperCase()}`;
        if(currentEvent === 'Dust Storm') scene.fog.density = 0.04;
        eventEndTime = timeSurvived + 12; eventTimer = 0;
    }
    if(currentEvent !== "None" && timeSurvived > eventEndTime) {
        currentEvent = "None"; document.getElementById('event-alert').style.display = 'none';
        scene.fog.density = 0.002;
    }

    // Dynamic Camera
    isInsideBuilding = false;
    if (playerGroup.position.distanceTo(new THREE.Vector3(0, 0, 0)) < 50) isInsideBuilding = true;
    if (playerGroup.position.distanceTo(new THREE.Vector3(-150, 0, -150)) < 60) isInsideBuilding = true;
    if (playerGroup.position.distanceTo(new THREE.Vector3(-150, 0, 100)) < 35) isInsideBuilding = true;
    if (playerGroup.position.distanceTo(new THREE.Vector3(150, 0, 150)) < 40) isInsideBuilding = true;
    if (playerGroup.position.distanceTo(new THREE.Vector3(-150, 0, 150)) < 30) isInsideBuilding = true;

    let targetDist = isInsideBuilding ? 12 : 30;
    let targetHeight = isInsideBuilding ? 6 : 20;

    camDist += (targetDist - camDist) * delta * 3;
    camHeight += (targetHeight - camHeight) * delta * 3;

    const distToBase = playerGroup.position.distanceTo(new THREE.Vector3(0, 0, 0));
    const isInSafeZone = distToBase < habRadius;

    if(currentEvent === 'Dust Storm' && !isInSafeZone) o2 -= delta * 8.0;
    else o2 -= delta * (isInSafeZone ? 0.1 : 1.2);
    power -= delta * 0.5;

    if(power <= 0) gameOver("Base Power Lost.");
    if(o2 <= 0) gameOver("Oxygen depleted.");

    if(o2Cooldown > 0) {
        o2Cooldown -= delta;
        if(o2Cooldown <= 0) { o2Cooldown = 0; document.getElementById('o2-cooldown').style.display = 'none'; }
        else { document.getElementById('o2-cooldown').style.display = 'block'; document.getElementById('o2-cooldown').innerText = `RECHARGING: ${Math.ceil(o2Cooldown)}s`; }
    }
    if(doorCooldown > 0) doorCooldown -= delta;

    // Animate Doors (Sliding X)
    for (let key in doors) {
        let d = doors[key];
        d.pos += ((d.open ? 1 : 0) - d.pos) * delta * 2.5;
        // Most doors are at X=0, sliding to X=-30
        if (key === 'nuke') {
            d.mesh.position.z = 28 + (d.pos * (d.openPos - d.closedPos)); // Slides back on Z
        } else {
            d.mesh.position.x = d.closedPos + (d.pos * (d.openPos - d.closedPos)); // Slides left on X
        }
    }

    velocityY += gravity; playerGroup.position.y += velocityY;
    let targetGroundY = getGroundHeight(playerGroup.position.x, playerGroup.position.z);
    
    if (playerGroup.position.y <= targetGroundY + 2.5) {
        playerGroup.position.y = targetGroundY + 2.5; velocityY = 0; isGrounded = true;
    }
    if(keys.space && isGrounded) { velocityY = jumpForce; isGrounded = false; }

    const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const moveVec = new THREE.Vector3(0, 0, 0);

    if(keys.w) moveVec.add(forward);
    if(keys.s) moveVec.sub(forward);
    if(keys.d) moveVec.add(right);
    if(keys.a) moveVec.sub(right);
    
    if(moveVec.length() > 0) {
        moveVec.normalize();
        let newX = playerGroup.position.x + moveVec.x * speed;
        let newZ = playerGroup.position.z + moveVec.z * speed;
        
        newX = Math.max(-380, Math.min(380, newX)); newZ = Math.max(-380, Math.min(380, newZ));

        let collided = false;
        for(let c of colliders) {
            if (newX > c.minX && newX < c.maxX && newZ > c.minZ && newZ < c.maxZ) {
                
                // Check if the position is exactly in the doorway gap
                let isDoorway = false;
                if (c.id === 'hab_wall' && newX > -15 && newX < 15 && newZ > 47) isDoorway = true;
                if (c.id === 'mine_wall' && newX > -175 && newX < -125 && newZ > -103) isDoorway = true;
                if (c.id === 'nuke_wall' && newX > -155 && newX < -145 && newZ > 127) isDoorway = true;
                if (c.id === 'garage_wall' && newX > 130 && newX < 170 && newZ > 177) isDoorway = true;
                if (c.id === 'ice_wall' && newX > -162 && newX < -138 && newZ > 172) isDoorway = true;
                
                if (isDoorway) {
                    let doorKey = c.id.split('_')[0];
                    // If the door is closed (pos < 0.8), you hit the door
                    if (doors[doorKey] && doors[doorKey].pos < 0.8) collided = true;
                } else {
                    // Solid wall
                    collided = true; 
                }
            }
        }

        if (!collided) { playerGroup.position.x = newX; playerGroup.position.z = newZ; }
        playerGroup.rotation.y = Math.atan2(moveVec.x, moveVec.z);
        walkTime += delta * 15;
        leftArmGroup.rotation.x = Math.sin(walkTime) * 0.6; rightArmGroup.rotation.x = Math.sin(walkTime + Math.PI) * 0.6;
        leftLegGroup.rotation.x = Math.sin(walkTime + Math.PI) * 0.6; rightLegGroup.rotation.x = Math.sin(walkTime) * 0.6;
    } else {
        leftArmGroup.rotation.x = 0; rightArmGroup.rotation.x = 0; leftLegGroup.rotation.x = 0; rightLegGroup.rotation.x = 0;
    }

    camera.position.x = playerGroup.position.x + camDist * Math.sin(yaw) * Math.cos(pitch);
    camera.position.z = playerGroup.position.z + camDist * Math.cos(yaw) * Math.cos(pitch);
    camera.position.y = playerGroup.position.y + camHeight + camDist * Math.sin(pitch);
    camera.lookAt(playerGroup.position.x, playerGroup.position.y + 2.5, playerGroup.position.z);

    timeSurvived += delta;
    if(o2 > 100) o2 = 100;
    document.getElementById('o2-val').innerText = Math.floor(Math.max(0, o2)) + "%";
    document.getElementById('o2-bar').style.width = Math.max(0, o2) + "%";
    document.getElementById('pwr-val').innerText = Math.floor(Math.max(0, power)) + "%";
    document.getElementById('pwr-bar').style.width = Math.max(0, power) + "%";

    const prompt = document.getElementById('prompt');
    const taskBarBg = document.getElementById('task-bar-bg');
    const taskBarFill = document.getElementById('task-bar-fill');

    let nearDoor = null;
    for(let dz of doorZones) {
        if (playerGroup.position.distanceTo(dz.pos) < dz.radius) nearDoor = dz.id;
    }

    let nearO2Tower = playerGroup.position.distanceTo(o2Group.position) < 20;

    if (nearDoor) {
        prompt.style.display = 'block'; prompt.innerText = "Press E to Toggle Massive Door";
        if(keys.e && doorCooldown <= 0) { doors[nearDoor].open = !doors[nearDoor].open; playSFX('door'); doorCooldown = 1; }
    }
    else if (nearO2Tower) {
        if (currentRole === 3) {
            if (o2Cooldown > 0) prompt.style.display = 'block', prompt.innerText = `O2 COOLDOWN (${Math.ceil(o2Cooldown)}s)`;
            else if (o2 >= 100) prompt.style.display = 'block', prompt.innerText = "O2 FULL";
            else {
                prompt.style.display = 'block'; prompt.innerText = "Hold E to Refill O2";
                if(keys.e) {
                    o2 += delta * 40;
                    if(Math.random() < 0.1) playSFX('refill');
                    if(o2 >= 100) { o2 = 100; o2Cooldown = 30; playSFX('door'); }
                }
            }
        } else prompt.style.display = 'block', prompt.innerText = "Requires MEDIC (Press 3)";
    }
    else if(currentTaskIndex < tasks.length) {
        let task = tasks[currentTaskIndex];
        let distToTarget = playerGroup.position.distanceTo(task.targetPos);

        if(distToTarget < 20) {
            if(currentRole === task.requiredRole) {
                prompt.style.display = 'block'; prompt.innerText = `Hold E to ${task.text}`;
                if(keys.e) {
                    taskProgress += delta * 33; 
                    taskBarBg.style.display = 'block'; taskBarFill.style.width = Math.min(100, taskProgress) + '%';
                    rightArmGroup.rotation.x = Math.sin(timeSurvived * 20) * 1.5; leftArmGroup.rotation.x = Math.sin(timeSurvived * 20) * 1.5;
                    if(Math.random() < 0.2) playSFX('work'); 
                    if(task.text.includes('Repair') || task.text.includes('Clear')) power = Math.min(100, power + delta * 15);
                    if(taskProgress >= 100) { currentTaskIndex++; updateTaskUI(); }
                } else { taskBarBg.style.display = 'none'; taskProgress = Math.max(0, taskProgress - delta * 50); }
            } else { prompt.style.display = 'block'; prompt.innerText = `Requires Role ${task.requiredRole} (Press ${task.requiredRole})`; }
        } else { prompt.style.display = 'none'; taskBarBg.style.display = 'none'; taskProgress = 0; }
    }
    
    if(!nearDoor && !nearO2Tower && (!tasks[currentTaskIndex] || playerGroup.position.distanceTo(tasks[currentTaskIndex].targetPos) >= 20)) prompt.style.display = 'none';

    renderer.render(scene, camera);
}

function gameOver(reason) {
    isGameOver = true; document.exitPointerLock();
    document.getElementById('game-over').style.display = 'flex';
    document.getElementById('go-title').innerText = "MISSION FAILED";
    document.getElementById('go-title').style.color = "#e74c3c";
    document.getElementById('fail-reason').innerText = reason;
}

function winGame() {
    isGameOver = true; document.exitPointerLock();
    document.getElementById('game-over').style.display = 'flex';
    document.getElementById('go-title').innerText = "MISSION SUCCESS";
    document.getElementById('go-title').style.color = "#2ecc71";
    document.getElementById('fail-reason').innerText = "You saved the outpost! All 50 tasks completed.";
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();