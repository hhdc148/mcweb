// ==================== 背景音乐系统 ====================
let gameBgMusic = null;

// 获取音乐设置
function getMusicSetting() {
    const settings = JSON.parse(localStorage.getItem('mcSettings') || '{}');
    return settings.music === true;
}

// 初始化并播放背景音乐
function initGameBackgroundMusic() {
    if (getMusicSetting()) {
        if (!gameBgMusic) {
            gameBgMusic = new Audio('https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3');
            gameBgMusic.loop = true;
            gameBgMusic.volume = 0.5;
        }
        gameBgMusic.play().catch(e => {
            console.log('游戏内音乐播放失败:', e);
        });
    }
}

// 暂停背景音乐
function pauseGameBackgroundMusic() {
    if (gameBgMusic) {
        gameBgMusic.pause();
    }
}

// 恢复背景音乐
function resumeGameBackgroundMusic() {
    if (getMusicSetting() && gameBgMusic) {
        gameBgMusic.play().catch(e => {
            console.log('游戏内音乐恢复失败:', e);
        });
    }
}

// 停止背景音乐
function stopGameBackgroundMusic() {
    if (gameBgMusic) {
        gameBgMusic.pause();
        gameBgMusic.currentTime = 0;
    }
}

// 页面加载完成后初始化音乐
document.addEventListener('DOMContentLoaded', function() {
    // 延迟一点播放，确保页面已完全加载
    setTimeout(initGameBackgroundMusic, 500);
});

// 离开/隐藏页面时自动保存世界
window.addEventListener('pagehide', () => {
    try { if (player && player.spawned) saveWorld(); } catch (e) {}
});
window.addEventListener('beforeunload', () => {
    try { if (player && player.spawned) saveWorld(); } catch (e) {}
});

// 监听页面可见性变化 - 页面不可见时暂停，可见时恢复
document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
        // 页面不可见时暂停音乐
        pauseGameBackgroundMusic();
    } else {
        // 页面可见时恢复音乐
        resumeGameBackgroundMusic();
    }
});

// ==================== 游戏模式检测 ====================
const gameMode = localStorage.getItem('gameMode') || 'creative';
const isSurvival = gameMode === 'survival';
const isMultiplayer = gameMode === 'multiplayer';

// ==================== 作弊检测 ====================
const allowCheats = localStorage.getItem('allowCheats') === 'true';

// 如果允许作弊，显示命令按钮
if (allowCheats) {
    const cmdBtn = document.getElementById('command-btn');
    if (cmdBtn) cmdBtn.style.display = 'block';
}

// 获取URL参数（多人游戏/读取存档）
const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get('room');
const roomMode = urlParams.get('mode');
const loadSave = urlParams.get('load');

// 检查是否需要加载存档
let shouldLoadSave = false;
let saveIdToLoad = null;

if (loadSave === '1') {
    // 从localStorage获取要加载的存档ID
    saveIdToLoad = localStorage.getItem('loadSaveId');
    if (saveIdToLoad) {
        shouldLoadSave = true;
        // 清除加载标记
        localStorage.removeItem('loadSaveId');
    }
}

// 更新UI显示
if (isSurvival) {
    document.getElementById('mode-display').textContent = 'MC Web - 生存';
    document.getElementById('survival-ui').style.display = 'flex';
    document.getElementById('inv-title').textContent = '物品栏';
} else if (isMultiplayer) {
    document.getElementById('mode-display').textContent = 'MC Web - Rose联机';
    document.getElementById('survival-ui').style.display = 'flex';
    document.getElementById('inv-title').textContent = '物品栏';
} else {
    // 创造模式
    document.getElementById('mode-display').textContent = 'MC Web - 创造';
    // 隐藏合成按钮
    const craftingBtn = document.getElementById('crafting-btn');
    if (craftingBtn) craftingBtn.style.display = 'none';
}

// ==================== Rose 多人游戏系统 ====================
let roseSocket = null;
let rosePlayerId = null;
let roseRoomId = roomId;
let isRoseHost = roomMode === 'host';
const otherPlayers = new Map(); // 存储其他玩家的数据
const otherPlayerMeshes = new Map(); // 存储其他玩家的3D模型

// 初始化Rose连接
function initRoseGameConnection() {
    if (!isMultiplayer) return;
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = protocol + '//' + window.location.host;
    
    try {
        roseSocket = new WebSocket(wsUrl);
        
        roseSocket.onopen = function() {
            console.log('🌹 已连接到Rose服务器');
            // 重新加入房间
            if (roseRoomId) {
                roseSocket.send(JSON.stringify({
                    type: isRoseHost ? 'create_room' : 'join_room',
                    roomId: roseRoomId,
                    playerName: '玩家' + Math.floor(Math.random() * 1000)
                }));
            }
        };
        
        roseSocket.onmessage = function(event) {
            handleRoseGameMessage(JSON.parse(event.data));
        };
        
        roseSocket.onclose = function() {
            console.log('🔴 与Rose服务器断开连接');
        };
        
        roseSocket.onerror = function(error) {
            console.error('Rose连接错误:', error);
        };
    } catch (e) {
        console.error('无法连接Rose服务器:', e);
    }
}

// 处理Rose游戏消息
function handleRoseGameMessage(data) {
    switch(data.type) {
        case 'room_created':
            rosePlayerId = data.playerId;
            console.log('房间创建成功:', data.roomId);
            break;
            
        case 'room_joined':
            rosePlayerId = data.playerId;
            console.log('加入房间成功:', data.roomId);
            // 同步世界数据
            if (data.worldData) {
                syncWorldData(data.worldData);
            }
            break;
            
        case 'player_joined':
            console.log('新玩家加入:', data.player);
            addOtherPlayer(data.player);
            break;
            
        case 'player_left':
            console.log('玩家离开:', data.playerId);
            removeOtherPlayer(data.playerId);
            break;
            
        case 'player_moved':
            updateOtherPlayerPosition(data);
            break;
            
        case 'block_placed':
            // 其他玩家放置方块
            if (data.playerId !== rosePlayerId) {
                setBlock(data.x, data.y, data.z, data.blockId);
            }
            break;
            
        case 'block_broken':
            // 其他玩家破坏方块
            if (data.playerId !== rosePlayerId) {
                setBlock(data.x, data.y, data.z, 0);
            }
            break;
            
        case 'chat':
            showChatMessage(data.playerName, data.message);
            break;
    }
}

// 添加其他玩家
function addOtherPlayer(playerData) {
    otherPlayers.set(playerData.id, playerData);
    
    // 创建其他玩家的3D模型
    const group = new THREE.Group();
    
    // 身体
    const bodyGeo = new THREE.BoxGeometry(0.6, 1.8, 0.3);
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x00d4ff });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.9;
    group.add(body);
    
    // 头
    const headGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const head = new THREE.Mesh(headGeo, bodyMat);
    head.position.y = 1.85;
    group.add(head);
    
    // 名字标签
    // (这里可以添加文字标签)
    
    scene.add(group);
    otherPlayerMeshes.set(playerData.id, group);
}

// 移除其他玩家
function removeOtherPlayer(playerId) {
    otherPlayers.delete(playerId);
    const mesh = otherPlayerMeshes.get(playerId);
    if (mesh) {
        scene.remove(mesh);
        otherPlayerMeshes.delete(playerId);
    }
}

// 更新其他玩家位置
function updateOtherPlayerPosition(data) {
    const mesh = otherPlayerMeshes.get(data.playerId);
    if (mesh) {
        mesh.position.set(data.x, data.y, data.z);
        mesh.rotation.y = -data.yaw + Math.PI;
    }
}

// 同步世界数据
function syncWorldData(worldData) {
    for (const [key, blockId] of Object.entries(worldData)) {
        const [x, y, z] = key.split(',').map(Number);
        setBlock(x, y, z, blockId);
    }
}

// 发送玩家位置
function sendPlayerPosition() {
    if (roseSocket && roseSocket.readyState === WebSocket.OPEN && rosePlayerId) {
        roseSocket.send(JSON.stringify({
            type: 'player_move',
            x: player.x,
            y: player.y,
            z: player.z,
            yaw: player.yaw,
            pitch: player.pitch
        }));
    }
}

// 发送放置方块
function sendBlockPlace(x, y, z, blockId) {
    if (roseSocket && roseSocket.readyState === WebSocket.OPEN) {
        roseSocket.send(JSON.stringify({
            type: 'block_place',
            x: x,
            y: y,
            z: z,
            blockId: blockId
        }));
    }
}

// 发送破坏方块
function sendBlockBreak(x, y, z) {
    if (roseSocket && roseSocket.readyState === WebSocket.OPEN) {
        roseSocket.send(JSON.stringify({
            type: 'block_break',
            x: x,
            y: y,
            z: z
        }));
    }
}

// 显示聊天消息
function showChatMessage(playerName, message) {
    const chatDiv = document.createElement('div');
    chatDiv.style.cssText = `
        position: fixed;
        bottom: 150px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0,0,0,0.7);
        color: #fff;
        padding: 8px 16px;
        border-radius: 4px;
        font-size: 14px;
        z-index: 100;
        max-width: 80%;
        word-break: break-word;
    `;
    chatDiv.innerHTML = `<span style="color: #8BC34A;">${playerName}:</span> ${message}`;
    document.body.appendChild(chatDiv);
    setTimeout(() => chatDiv.remove(), 5000);
}

const BASE_URL = 'https://cdn.jsdelivr.net/gh/InventivetalentDev/minecraft-assets@1.8/assets/minecraft/textures/';
const textureCache = new Map();
const imageCache = new Map();
let loadedCount = 0, totalTextures = 0;
// 世界种子：加载存档时复用原种子，新世界则随机生成
let WORLD_SEED = Date.now();
if (saveIdToLoad) {
    try {
        const pendingSave = JSON.parse(localStorage.getItem('mcSave_' + saveIdToLoad));
        if (pendingSave && pendingSave.seed) WORLD_SEED = pendingSave.seed;
    } catch (e) { console.warn('读取存档种子失败:', e); }
}

// ==================== 加载页面提示 ====================
const LoadingTips = [
    // 游戏知识
    "💡 你知道吗？苦力怕是因为建模错误诞生的",
    "💡 第一晚挖矿时，记得带足够的火把！",
    "💡 在岩浆附近挖矿时，按Shift可以防止掉落",
    "💡 用床睡觉可以跳过夜晚，还能设置重生点",
    "💡 金制工具虽然耐久低，但挖掘速度最快",
    "💡 潜影盒被炸毁时会掉落里面的所有物品",
    "💡 用精准采集可以获取原本无法获得的方块",
    "💡 在雷暴天气，村民会变成女巫！",
    "💡 给羊命名'jeb_'会让它变成彩虹羊",
    "💡 给兔子命名'Toast'会改变它的皮肤",
    "💡 用命名牌给生物命名可以防止它们消失",
    "💡 岩浆块会在水下产生气泡，让你快速下沉",
    "💡 末影珍珠可以瞬移，但会扣除生命值",
    "💡 附魔台需要书架才能发挥最大效果",
    "💡 用骨粉可以快速催熟植物",
    "💡 雪傀儡走过的地方会留下雪迹",
    "💡 铁傀儡会保护村民并攻击敌对生物",
    "💡 海豚会带你找到沉船和海底废墟",
    "💡 用剪刀可以剪下哞菇的蘑菇",
    "💡 在末地睡觉床会爆炸！",
    // 梗
    "🎮 挖三填一，安全过夜！",
    "🎮 要致富，先撸树！",
    "🎮 别低头，皇冠会掉；别挖矿，岩浆会烫",
    "🎮  Creeper? Aww man...",
    "🎮  这是Minecraft，不是Minicraft",
    "🎮  你死了！ 得分：0",
    "🎮  史蒂夫的手是万能的",
    "🎮  一格水可以灌溉4格范围内的农田",
    "🎮  永远不要垂直向下挖！",
    "🎮  听到嘶嘶声？快跑！",
    "🎮  钻石在Y=11层附近最多",
    "🎮  岩浆池旁边经常会有钻石",
    "🎮  用桶装岩浆可以当燃料",
    "🎮  树叶会腐烂，记得及时采集",
    "🎮  蜘蛛在白天是中立的",
    "🎮  僵尸会在阳光下燃烧",
    "🎮  骷髅的箭可以被反弹",
    "🎮  苦力怕怕猫和豹猫",
    "🎮  末影人怕水",
    "🎮  女巫会喝药水治疗自己"
];

// 显示随机提示
function showRandomLoadingTip() {
    const tipElement = document.getElementById('loading-tip');
    if (tipElement) {
        const randomTip = LoadingTips[Math.floor(Math.random() * LoadingTips.length)];
        tipElement.textContent = randomTip;
    }
}

// 页面加载时显示随机提示
showRandomLoadingTip();

function updateProgress() {
    const pct = totalTextures ? Math.round(loadedCount/totalTextures*100) : 0;
    document.getElementById('progress-fill').style.width = pct + '%';
    document.getElementById('loading-text').textContent = `${loadedCount}/${totalTextures}`;
}

function loadTexture(name, isItem = false) {
    return new Promise((resolve) => {
        if (textureCache.has(name)) return resolve(textureCache.get(name));
        const img = new Image();
        img.crossOrigin = 'anonymous';
        const timeout = setTimeout(() => {
            loadedCount++;
            updateProgress();
            resolve(null);
        }, 5000);
        img.onload = () => {
            clearTimeout(timeout);
            try {
                const tex = new THREE.Texture(img);
                tex.magFilter = THREE.NearestFilter;
                tex.minFilter = THREE.NearestFilter;
                tex.needsUpdate = true;
                const texData = { texture: tex, image: img, url: BASE_URL + name + '.png' };
                textureCache.set(name, texData);
                imageCache.set(name, img);
                loadedCount++;
                updateProgress();
                resolve(texData);
            } catch(e) {
                loadedCount++;
                updateProgress();
                resolve(null);
            }
        };
        img.onerror = () => {
            clearTimeout(timeout);
            loadedCount++;
            updateProgress();
            resolve(null);
        };
        const path = isItem ? 'items/' : 'blocks/';
        img.src = BASE_URL + path + name + '.png';
    });
}

const BiomeColors = {
    plains: { grass: 0x8BC34A, foliage: 0x8BC34A, sky: [0.5, 0.7, 0.9], treeDensity: 0.02, grassDensity: 0.3 },
    forest: { grass: 0x7CB342, foliage: 0x7CB342, sky: [0.4, 0.6, 0.4], treeDensity: 0.25, grassDensity: 0.4 },
    desert: { grass: 0xD4C88A, foliage: 0xD4C88A, sky: [0.9, 0.8, 0.6], treeDensity: 0.001, grassDensity: 0.05 },
    mountain: { grass: 0x9CCC65, foliage: 0x9CCC65, sky: [0.6, 0.7, 0.8], treeDensity: 0.15, grassDensity: 0.2 },
    snow: { grass: 0xFFFFFF, foliage: 0xFFFFFF, sky: [0.9, 0.95, 1.0], treeDensity: 0.08, grassDensity: 0.1 }
};

class MultiNoise {
    constructor() {
        this.perm = new Uint8Array(512);
        this.perm2 = new Uint8Array(512);
        this.perm3 = new Uint8Array(512);
        this.perm4 = new Uint8Array(512);
        this.init(WORLD_SEED);
    }
    
    init(seed) {
        let s = seed;
        const rand = () => {
            s = Math.imul(s ^ (s >>> 15), 0x7feb352d);
            s = Math.imul(s ^ (s >>> 15), 0x846ca68b);
            return ((s >>> 15) & 0xffff) / 0xffff;
        };
        
        for (let i = 0; i < 256; i++) {
            this.perm[i] = i;
            this.perm2[i] = i;
            this.perm3[i] = i;
            this.perm4[i] = i;
        }
        
        for (let i = 255; i > 0; i--) {
            const j = Math.floor(rand() * (i + 1));
            [this.perm[i], this.perm[j]] = [this.perm[j], this.perm[i]];
            const j2 = Math.floor(rand() * (i + 1));
            [this.perm2[i], this.perm2[j2]] = [this.perm2[j2], this.perm2[i]];
            const j3 = Math.floor(rand() * (i + 1));
            [this.perm3[i], this.perm3[j3]] = [this.perm3[j3], this.perm3[i]];
            const j4 = Math.floor(rand() * (i + 1));
            [this.perm4[i], this.perm4[j4]] = [this.perm4[j4], this.perm4[i]];
        }
        
        for (let i = 0; i < 256; i++) {
            this.perm[i+256] = this.perm[i];
            this.perm2[i+256] = this.perm2[i];
            this.perm3[i+256] = this.perm3[i];
            this.perm4[i+256] = this.perm4[i];
        }
    }
    
    fade(t) { return t*t*t*(t*(t*6-15)+10); }
    lerp(t,a,b) { return a+t*(b-a); }
    
    grad(h, x, y, z) {
        const u = h < 8 ? x : y;
        const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
        return ((h&1) ? -u : u) + ((h&2) ? -v : v);
    }
    
    noise3(x, y, z, perm) {
        const X = Math.floor(x)&255, Y = Math.floor(y)&255, Z = Math.floor(z)&255;
        x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
        const u = this.fade(x), v = this.fade(y), w = this.fade(z);
        
        const A = perm[X]+Y, AA = perm[A]+Z, AB = perm[A+1]+Z;
        const B = perm[X+1]+Y, BA = perm[B]+Z, BB = perm[B+1]+Z;
        
        return this.lerp(w, 
            this.lerp(v, this.lerp(u, this.grad(perm[AA], x, y, z), this.grad(perm[BA], x-1, y, z)),
                         this.lerp(u, this.grad(perm[AB], x, y-1, z), this.grad(perm[BB], x-1, y-1, z))),
            this.lerp(v, this.lerp(u, this.grad(perm[AA+1], x, y, z-1), this.grad(perm[BA+1], x-1, y, z-1)),
                         this.lerp(u, this.grad(perm[AB+1], x, y-1, z-1), this.grad(perm[BB+1], x-1, y-1, z-1))));
    }
    
    octave(x, y, z, octaves, persistence, perm) {
        let total = 0, freq = 1, amp = 1, max = 0;
        for (let i = 0; i < octaves; i++) {
            total += this.noise3(x*freq, y*freq, z*freq, perm) * amp;
            max += amp;
            amp *= persistence;
            freq *= 2;
        }
        return (total / max + 1) / 2;
    }
    
    continentalness(x, z) { return this.octave(x*0.003, 0, z*0.003, 4, 0.5, this.perm) * 2 - 1; }
    erosion(x, z) { return this.octave(x*0.004, 0, z*0.004, 3, 0.5, this.perm2) * 2 - 1; }
    weirdness(x, z) { return this.octave(x*0.002, 0, z*0.002, 3, 0.5, this.perm3) * 2 - 1; }
    temperature(x, z) { return this.octave(x*0.0015 + 1000, 0, z*0.0015, 3, 0.5, this.perm4) * 2 - 1; }
    humidity(x, z) { return this.octave(x*0.002 + 2000, 0, z*0.002, 2, 0.5, this.perm) * 2 - 1; }
    pv(x, z) {
        const w = this.weirdness(x, z);
        return 1 - Math.abs(3 * Math.abs(w) - 2);
    }

    // 3D 洞穴噪声（奶酪洞 + 意大利面洞双通道）
    caveA(x, y, z) { return this.octave(x*0.022, y*0.03, z*0.022, 3, 0.5, this.perm2) * 2 - 1; }
    caveB(x, y, z) { return this.octave(x*0.03 + 500, y*0.04, z*0.03 + 500, 2, 0.5, this.perm3) * 2 - 1; }
    // 矿脉分布噪声（每种矿物独立通道）
    oreNoise(x, y, z, offset) { return this.octave(x*0.09 + offset, y*0.09 + offset, z*0.09 + offset, 2, 0.6, this.perm4) * 2 - 1; }

    // 基于坐标的确定性哈希随机（保证同种子世界一致）
    hash(x, y, z) {
        let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2246822519) ^ WORLD_SEED;
        h = Math.imul(h ^ (h >>> 13), 1274126177);
        return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    }
}

const noise = new MultiNoise();

function getTerrainHeight(continentalness, pv, erosion) {
    let base;
    const c = continentalness;
    const e = (erosion + 1) / 2;
    const variation = Math.sin(c * Math.PI * 2) * 8 * e;
    
    if (c < -0.6) base = 25 + variation * 0.3;
    else if (c < -0.4) base = 35 + (c + 0.6) * 80 + variation * 0.5;
    else if (c < -0.3) base = 55 + (c + 0.4) * 50 + variation;
    else if (c < 0.0) base = 62 + (c + 0.3) * 27 + variation * 1.5;
    else if (c < 0.4) base = 70 + c * 50 + variation;
    else base = 90 + (c - 0.4) * 35 + variation * 0.5;
    
    const pvFactor = pv * 25;
    const erosionFactor = (1 - e) * 15;
    
    return Math.floor(base + pvFactor - erosionFactor);
}

// ==================== 方块掉落表 ====================
const BlockDrops = {
    0: 0, 1: 4, 2: 3, 3: 3, 4: 4, 5: 5, 7: 0, 12: 12, 13: 13, 14: 14, 15: 15, 16: 263, 73: 331, 129: 388, 130: 351,
    17: 17, 18: 0, 20: 20, 31: 0, 32: 0, 35: 35, 37: 37, 38: 38, 41: 41, 42: 42, 43: 0, 45: 45,
    46: 46, 47: 47, 50: 50, 56: 56, 57: 57, 73: 73, 78: 78, 81: 81, 100: 100, 101: 101,
    102: 102, 103: 103, 161: 0, 162: 162, 163: 163, 164: 164, 165: 165, 168: 168, 600: 600
};


const BlockDefs = {
    0: { name: '空气', solid: false },
    1: { name: '石头', tex: 'stone', hardness: 3, tool: 'pickaxe', level: 1 },
    2: { name: '草方块', faces: ['grass_side','grass_side','grass_top','dirt','grass_side','grass_side'], biomeTint: [false,false,true,false,false,false], hardness: 0.6, tool: 'shovel' },
    3: { name: '泥土', tex: 'dirt', hardness: 0.5, tool: 'shovel' },
    4: { name: '圆石', tex: 'cobblestone', hardness: 3, tool: 'pickaxe', level: 1 },
    5: { name: '橡木木板', tex: 'planks_oak', hardness: 2, tool: 'axe' },
    7: { name: '基岩', tex: 'bedrock', hardness: -1 },
    12: { name: '沙子', tex: 'sand', hardness: 0.5, tool: 'shovel' },
    13: { name: '砂砾', tex: 'gravel', hardness: 0.6, tool: 'shovel' },
    14: { name: '金矿石', tex: 'gold_ore', hardness: 4, tool: 'pickaxe', level: 3 },
    15: { name: '铁矿石', tex: 'iron_ore', hardness: 4, tool: 'pickaxe', level: 2 },
    16: { name: '煤矿石', tex: 'coal_ore', hardness: 3, tool: 'pickaxe', level: 1 },
    17: { name: '橡木原木', faces: ['log_oak','log_oak','log_oak_top','log_oak_top','log_oak','log_oak'], hardness: 2, tool: 'axe' },
    18: { name: '橡树树叶', tex: 'leaves_oak', transparent: true, tint: 0x8BC34A, hardness: 0.2 },
    20: { name: '玻璃', tex: 'glass', transparent: true, solid: false, hardness: 0.3 },
    31: { name: '草丛', tex: 'tallgrass', transparent: true, solid: false, cross: true, tint: 0x8BC34A, hardness: 0 },
    32: { name: '枯灌木', tex: 'deadbush', transparent: true, solid: false, cross: true, hardness: 0 },
    35: { name: '羊毛', tex: 'wool_colored_white', hardness: 0.8 },
    37: { name: '蒲公英', tex: 'flower_dandelion', transparent: true, solid: false, cross: true, hardness: 0 },
    600: { name: '生猪排', tex: 'porkchop_raw', isItem: true, category: 'food' },
    38: { name: '罂粟', tex: 'flower_rose', transparent: true, solid: false, cross: true, hardness: 0 },
    41: { name: '金块', tex: 'gold_block', hardness: 5, tool: 'pickaxe', level: 3 },
    42: { name: '铁块', tex: 'iron_block', hardness: 5, tool: 'pickaxe', level: 2 },
    43: { name: 'TNT', faces: ['tnt_side','tnt_side','tnt_top','tnt_bottom','tnt_side','tnt_side'], hardness: 0 },
    45: { name: '书架', tex: 'bookshelf', hardness: 1.5, tool: 'axe' },
    46: { name: '苔石', tex: 'cobblestone_mossy', hardness: 3, tool: 'pickaxe', level: 1 },
    47: { name: '黑曜石', tex: 'obsidian', hardness: 10, tool: 'pickaxe', level: 3 },
    50: { name: '火把', tex: 'torch_on', transparent: true, solid: false, cross: true, hardness: 0, light: 14 },
    56: { name: '钻石矿石', tex: 'diamond_ore', hardness: 5, tool: 'pickaxe', level: 3 },
    57: { name: '钻石块', tex: 'diamond_block', hardness: 5, tool: 'pickaxe', level: 3 },
    73: { name: '红石矿石', tex: 'redstone_ore', hardness: 4, tool: 'pickaxe', level: 3 },
    129: { name: '绿宝石矿石', tex: 'emerald_ore', hardness: 5, tool: 'pickaxe', level: 3 },
    130: { name: '青金石矿石', tex: 'lapis_ore', hardness: 4, tool: 'pickaxe', level: 2 },
    78: { name: '雪块', tex: 'snow', hardness: 0.2, tool: 'shovel' },
    81: { name: '仙人掌', faces: ['cactus_side','cactus_side','cactus_top','cactus_bottom','cactus_side','cactus_side'], hardness: 0.4 },
    161: { name: '云杉树叶', tex: 'leaves_spruce', transparent: true, tint: 0x7CB342, hardness: 0.2 },
    162: { name: '云杉原木', faces: ['log_spruce','log_spruce','log_spruce_top','log_spruce_top','log_spruce','log_spruce'], hardness: 2, tool: 'axe' },
    163: { name: '白桦原木', faces: ['log_birch','log_birch','log_birch_top','log_birch_top','log_birch','log_birch'], hardness: 2, tool: 'axe' },
    164: { name: '丛林原木', faces: ['log_jungle','log_jungle','log_jungle_top','log_jungle_top','log_jungle','log_jungle'], hardness: 2, tool: 'axe' },
    165: { name: '金合欢原木', faces: ['log_acacia','log_acacia','log_acacia_top','log_acacia_top','log_acacia','log_acacia'], hardness: 2, tool: 'axe' },
    168: { name: '深色橡木木板', tex: 'planks_big_oak', hardness: 2, tool: 'axe' },
    // 火焰系统
    700: { name: '火焰', tex: 'torch_on', isFire: true, transparent: true, solid: false, cross: true, light: 15 },
    701: { name: '打火石', isItem: true, tex: 'iron_ingot', category: 'tool' }
};

// ==================== 食物定义 ====================
// 食物ID和恢复的饥饿值
const FoodValues = {
    600: { hunger: 3, saturation: 1.8, name: '生猪排' }  // 生猪排恢复3点饥饿值
};

// 检查物品是否是食物
function isFood(blockId) {
    return FoodValues.hasOwnProperty(blockId);
}

// 吃食物
function eatFood(slotIndex) {
    const blockId = hotbar[slotIndex];
    if (!isFood(blockId)) return false;
    
    const food = FoodValues[blockId];
    const oldHunger = survivalStats.hunger;
    
    // 恢复饥饿值（不超过最大值）
    survivalStats.hunger = Math.min(survivalStats.maxHunger, survivalStats.hunger + food.hunger);
    
    // 消耗食物
    if (isSurvival || isMultiplayer) {
        hotbarCount[slotIndex]--;
        if (hotbarCount[slotIndex] <= 0) {
            hotbar[slotIndex] = 0;
            hotbarCount[slotIndex] = 0;
        }
        updateHotbar();
    }
    
    // 更新UI
    updateSurvivalUI();
    
    // 显示吃食物的粒子效果
    showEatingParticles();
    
    console.log(`吃了${food.name}，饥饿值: ${oldHunger} -> ${survivalStats.hunger}`);
    return true;
}

// 吃食物粒子效果
function showEatingParticles() {
    const particle = document.createElement('div');
    particle.textContent = '🍖';
    particle.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        font-size: 24px;
        pointer-events: none;
        z-index: 100;
        animation: eatParticle 0.8s ease-out forwards;
    `;
    document.body.appendChild(particle);
    setTimeout(() => particle.remove(), 800);
}

// 添加CSS动画
const eatStyle = document.createElement('style');
eatStyle.textContent = `
    @keyframes eatParticle {
        0% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
        50% { transform: translate(-50%, -80%) scale(1.3); opacity: 0.8; }
        100% { transform: translate(-50%, -120%) scale(0.8); opacity: 0; }
    }
`;
document.head.appendChild(eatStyle);

// ==================== 合成配方 ====================
// gridSize: 2 = 2x2合成, 3 = 3x3合成(需要工作台)
const CraftingRecipes = [
    // === 2x2 配方 (无需工作台) ===
    {
        id: 'oak_planks',
        name: '橡木木板',
        result: 5,
        count: 4,
        category: 'blocks',
        gridSize: 2,
        pattern: [
            [17, 0],
            [0, 0]
        ],
        materials: [{ id: 17, count: 1, name: '橡木原木' }]
    },
    {
        id: 'crafting_table',
        name: '工作台',
        result: 100,
        count: 1,
        category: 'blocks',
        gridSize: 2,
        pattern: [
            [5, 5],
            [5, 5]
        ],
        materials: [{ id: 5, count: 4, name: '橡木木板' }]
    },
    {
        id: 'sticks',
        name: '木棍',
        result: 400,
        count: 4,
        category: 'materials',
        gridSize: 2,
        pattern: [
            [5, 0],
            [5, 0]
        ],
        materials: [{ id: 5, count: 2, name: '橡木木板' }]
    },
    {
        id: 'torch',
        name: '火把',
        result: 50,
        count: 4,
        category: 'materials',
        gridSize: 2,
        pattern: [
            [16, 0],
            [400, 0]
        ],
        materials: [{ id: 16, count: 1, name: '煤矿石' }, { id: 400, count: 1, name: '木棍' }]
    },
    // === 3x3 配方 (需要工作台) ===
    {
        id: 'cobblestone_stairs',
        name: '圆石楼梯',
        result: 101,
        count: 4,
        category: 'blocks',
        gridSize: 3,
        pattern: [
            [4, 0, 0],
            [4, 4, 0],
            [4, 4, 4]
        ],
        materials: [{ id: 4, count: 7, name: '圆石' }]
    },
    {
        id: 'stone_bricks',
        name: '石砖',
        result: 102,
        count: 4,
        category: 'blocks',
        gridSize: 3,
        pattern: [
            [4, 4, 0],
            [4, 4, 0],
            [0, 0, 0]
        ],
        materials: [{ id: 4, count: 4, name: '圆石' }]
    },
    {
        id: 'glass_pane',
        name: '玻璃板',
        result: 103,
        count: 16,
        category: 'blocks',
        gridSize: 3,
        pattern: [
            [20, 20, 20],
            [20, 20, 20],
            [0, 0, 0]
        ],
        materials: [{ id: 20, count: 6, name: '玻璃' }]
    },
    // 工具
    {
        id: 'wooden_pickaxe',
        name: '木镐',
        result: 200,
        count: 1,
        category: 'tools',
        gridSize: 3,
        pattern: [
            [5, 5, 5],
            [0, 400, 0],
            [0, 400, 0]
        ],
        materials: [{ id: 5, count: 3, name: '橡木木板' }, { id: 400, count: 2, name: '木棍' }]
    },
    {
        id: 'stone_pickaxe',
        name: '石镐',
        result: 201,
        count: 1,
        category: 'tools',
        gridSize: 3,
        pattern: [
            [4, 4, 4],
            [0, 400, 0],
            [0, 400, 0]
        ],
        materials: [{ id: 4, count: 3, name: '圆石' }, { id: 400, count: 2, name: '木棍' }]
    },
    {
        id: 'iron_pickaxe',
        name: '铁镐',
        result: 202,
        count: 1,
        category: 'tools',
        gridSize: 3,
        pattern: [
            [42, 42, 42],
            [0, 400, 0],
            [0, 400, 0]
        ],
        materials: [{ id: 42, count: 3, name: '铁块' }, { id: 400, count: 2, name: '木棍' }]
    },
    {
        id: 'wooden_axe',
        name: '木斧',
        result: 203,
        count: 1,
        category: 'tools',
        gridSize: 3,
        pattern: [
            [5, 5, 0],
            [5, 400, 0],
            [0, 400, 0]
        ],
        materials: [{ id: 5, count: 3, name: '橡木木板' }, { id: 400, count: 2, name: '木棍' }]
    },
    {
        id: 'stone_axe',
        name: '石斧',
        result: 204,
        count: 1,
        category: 'tools',
        gridSize: 3,
        pattern: [
            [4, 4, 0],
            [4, 400, 0],
            [0, 400, 0]
        ],
        materials: [{ id: 4, count: 3, name: '圆石' }, { id: 400, count: 2, name: '木棍' }]
    },
    {
        id: 'wooden_shovel',
        name: '木锹',
        result: 205,
        count: 1,
        category: 'tools',
        gridSize: 3,
        pattern: [
            [0, 5, 0],
            [0, 400, 0],
            [0, 400, 0]
        ],
        materials: [{ id: 5, count: 1, name: '橡木木板' }, { id: 400, count: 2, name: '木棍' }]
    },
    {
        id: 'stone_shovel',
        name: '石锹',
        result: 206,
        count: 1,
        category: 'tools',
        gridSize: 3,
        pattern: [
            [0, 4, 0],
            [0, 400, 0],
            [0, 400, 0]
        ],
        materials: [{ id: 4, count: 1, name: '圆石' }, { id: 400, count: 2, name: '木棍' }]
    },
    // 武器
    {
        id: 'wooden_sword',
        name: '木剑',
        result: 300,
        count: 1,
        category: 'weapons',
        gridSize: 3,
        pattern: [
            [0, 5, 0],
            [0, 5, 0],
            [0, 400, 0]
        ],
        materials: [{ id: 5, count: 2, name: '橡木木板' }, { id: 400, count: 1, name: '木棍' }]
    },
    {
        id: 'stone_sword',
        name: '石剑',
        result: 301,
        count: 1,
        category: 'weapons',
        gridSize: 3,
        pattern: [
            [0, 4, 0],
            [0, 4, 0],
            [0, 400, 0]
        ],
        materials: [{ id: 4, count: 2, name: '圆石' }, { id: 400, count: 1, name: '木棍' }]
    },
    {
        id: 'iron_sword',
        name: '铁剑',
        result: 302,
        count: 1,
        category: 'weapons',
        gridSize: 3,
        pattern: [
            [0, 42, 0],
            [0, 42, 0],
            [0, 400, 0]
        ],
        materials: [{ id: 42, count: 2, name: '铁块' }, { id: 400, count: 1, name: '木棍' }]
    },
    // 装饰
    {
        id: 'chest',
        name: '箱子',
        result: 500,
        count: 1,
        category: 'decorations',
        gridSize: 3,
        pattern: [
            [5, 5, 5],
            [5, 0, 5],
            [5, 5, 5]
        ],
        materials: [{ id: 5, count: 8, name: '橡木木板' }]
    },
    {
        id: 'furnace',
        name: '熔炉',
        result: 501,
        count: 1,
        category: 'decorations',
        gridSize: 3,
        pattern: [
            [4, 4, 4],
            [4, 0, 4],
            [4, 4, 4]
        ],
        materials: [{ id: 4, count: 8, name: '圆石' }]
    },
    {
        id: 'ladder',
        name: '梯子',
        result: 502,
        count: 3,
        category: 'decorations',
        gridSize: 3,
        pattern: [
            [400, 0, 400],
            [400, 400, 400],
            [400, 0, 400]
        ],
        materials: [{ id: 400, count: 7, name: '木棍' }]
    },
    {
        id: 'fence',
        name: '栅栏',
        result: 503,
        count: 3,
        category: 'decorations',
        gridSize: 3,
        pattern: [
            [5, 400, 5],
            [5, 400, 5],
            [0, 0, 0]
        ],
        materials: [{ id: 5, count: 4, name: '橡木木板' }, { id: 400, count: 2, name: '木棍' }]
    }
];

// 工具/武器定义（合成产物）
const ToolDefs = {
    100: { name: '工作台', faces: ['crafting_table_side','crafting_table_side','crafting_table_top','planks_oak','crafting_table_side','crafting_table_side'], category: 'block' },
    101: { name: '圆石楼梯', tex: 'cobblestone', category: 'block' },
    102: { name: '石砖', tex: 'stonebrick', category: 'block' },
    103: { name: '玻璃板', tex: 'glass_pane_top', category: 'block' },
    200: { name: '木镐', tex: 'wood_pickaxe', category: 'tool', isItem: true, toolType: 'pickaxe', toolLevel: 1 },
    201: { name: '石镐', tex: 'stone_pickaxe', category: 'tool', isItem: true, toolType: 'pickaxe', toolLevel: 2 },
    202: { name: '铁镐', tex: 'iron_pickaxe', category: 'tool', isItem: true, toolType: 'pickaxe', toolLevel: 3 },
    203: { name: '木斧', tex: 'wood_axe', category: 'tool', isItem: true, toolType: 'axe', toolLevel: 1 },
    204: { name: '石斧', tex: 'stone_axe', category: 'tool', isItem: true, toolType: 'axe', toolLevel: 2 },
    205: { name: '木锹', tex: 'wood_shovel', category: 'tool', isItem: true, toolType: 'shovel', toolLevel: 1 },
    206: { name: '石锹', tex: 'stone_shovel', category: 'tool', isItem: true, toolType: 'shovel', toolLevel: 2 },
    300: { name: '木剑', tex: 'wood_sword', category: 'weapon', isItem: true },
    301: { name: '石剑', tex: 'stone_sword', category: 'weapon', isItem: true },
    302: { name: '铁剑', tex: 'iron_sword', category: 'weapon', isItem: true },
    263: { name: '煤炭', tex: 'coal', category: 'material', isItem: true },
    264: { name: '钻石', tex: 'diamond', category: 'material', isItem: true },
    265: { name: '铁锭', tex: 'iron_ingot', category: 'material', isItem: true },
    266: { name: '金锭', tex: 'gold_ingot', category: 'material', isItem: true },
    331: { name: '红石粉', tex: 'redstone_dust', category: 'material', isItem: true },
    351: { name: '青金石', tex: 'dye_powder_blue', category: 'material', isItem: true },
    388: { name: '绿宝石', tex: 'emerald', category: 'material', isItem: true },
    400: { name: '木棍', tex: 'stick', category: 'material', isItem: true },
    500: { name: '箱子', tex: 'planks_oak', category: 'block' },
    501: { name: '熔炉', tex: 'furnace_front_off', category: 'block', interactable: true, hardness: 3, tool: 'pickaxe', level: 1 },
    502: { name: '梯子', tex: 'ladder', category: 'block' },
    503: { name: '栅栏', tex: 'planks_oak', category: 'block' },
};

// 合并到BlockDefs
Object.assign(BlockDefs, ToolDefs);

// ==================== 合成系统 ====================
let currentCategory = 'all';
let searchQuery = '';

// 工作台ID
const CRAFTING_TABLE_ID = 100;

// 主背包（生存模式扩展栏位，预留）
const inventory = new Array(27).fill(0);
const inventoryCount = new Array(27).fill(0);

// 检查玩家是否有工作台
// 检查玩家是否有工作台（快捷栏或背包中）
function hasCraftingTable() {
    // 检查快捷栏
    for (let i = 0; i < 9; i++) {
        if (hotbar[i] === CRAFTING_TABLE_ID && hotbarCount[i] > 0) {
            return true;
        }
    }
    // 检查背包
    for (let i = 0; i < inventory.length; i++) {
        if (inventory[i] === CRAFTING_TABLE_ID && inventoryCount[i] > 0) {
            return true;
        }
    }
    return false;
}

// 获取可用的配方（根据是否有工作台）
function getAvailableRecipes() {
    const hasTable = hasCraftingTable();
    return CraftingRecipes.filter(r => {
        // 2x2配方总是可用
        if (r.gridSize === 2) return true;
        // 3x3配方需要工作台
        if (r.gridSize === 3) return hasTable;
        return true;
    });
}

function toggleCrafting() {
    const screen = document.getElementById('crafting-screen');
    if (screen.style.display === 'flex') {
        screen.style.display = 'none';
    } else {
        screen.style.display = 'flex';
        updateRecipeCounts();
        renderRecipes();
    }
}

// ==================== 游戏内菜单 ====================
let isGameMenuOpen = false;

function toggleGameMenu() {
    const menu = document.getElementById('game-menu');
    if (isGameMenuOpen) {
        menu.style.display = 'none';
        isGameMenuOpen = false;
        // 恢复游戏控制
        if (player) player.controlsEnabled = true;
    } else {
        menu.style.display = 'flex';
        isGameMenuOpen = true;
        // 暂停游戏控制
        if (player) player.controlsEnabled = false;
    }
}

function continueGame() {
    toggleGameMenu();
}

function saveAndExit() {
    // 显示保存进度
    document.getElementById('save-progress-modal').style.display = 'flex';
    
    // 执行保存
    setTimeout(() => {
        saveWorld();
        // 隐藏保存进度
        document.getElementById('save-progress-modal').style.display = 'none';
        // 返回主页
        window.location.href = 'index.html';
    }, 1500);
}

// ==================== 存档系统 ====================
// 保存世界（v2：地图数据 + 背包 + 时间 + 玩家状态）
function saveWorld() {
    const saveId = localStorage.getItem('currentSaveId') || generateSaveId();
    const saveName = '我的世界';

    // 收集被修改过的区块（地形 + 玩家放置/破坏后的完整数据）
    const chunkData = {};
    chunks.forEach((c, key) => {
        if (!c.modified) return;
        const entries = [];
        c.data.forEach((id, k) => {
            entries.push(k + ',' + id); // "x,y,z,id"
        });
        chunkData[key] = entries.join(';');
    });

    const saveData = {
        version: 2,
        id: saveId,
        name: saveName,
        mode: gameMode,
        allowCheats: allowCheats,
        mods: (() => { try { return JSON.parse(localStorage.getItem('activeMods') || '{}'); } catch(e) { return {}; } })(),
        seed: WORLD_SEED,
        gameTime: gameTime,
        date: new Date().toLocaleString('zh-CN'),
        timestamp: Date.now(),
        player: {
            x: player.x,
            y: player.y,
            z: player.z,
            yaw: player.yaw,
            pitch: player.pitch
        },
        hotbar: hotbar,
        hotbarCount: hotbarCount,
        inventory: inventory,
        inventoryCount: inventoryCount,
        selected: selected,
        survival: survivalStats ? {
            health: survivalStats.health,
            hunger: survivalStats.hunger
        } : null,
        chunks: chunkData
    };

    try {
        localStorage.setItem('mcSave_' + saveId, JSON.stringify(saveData));
        localStorage.setItem('currentSaveId', saveId);
        console.log('世界已保存:', saveId, '修改区块数:', Object.keys(chunkData).length);
    } catch (e) {
        console.error('保存失败（存储空间可能不足）:', e);
        if (typeof showNotification === 'function') showNotification('存档失败：存储空间不足');
    }
}

// 加载世界
function loadWorld(saveId) {
    const saveKey = 'mcSave_' + saveId;
    let saveData;
    try {
        saveData = JSON.parse(localStorage.getItem(saveKey));
    } catch (e) {
        console.error('存档数据损坏:', saveId, e);
        return false;
    }

    if (!saveData) {
        console.error('存档不存在:', saveId);
        return false;
    }

    // 恢复区块数据（放置/破坏的方块）
    if (saveData.chunks) {
        for (const key in saveData.chunks) {
            const entries = [];
            const str = saveData.chunks[key];
            if (str) {
                for (const item of str.split(';')) {
                    const parts = item.split(',');
                    entries.push([parts[0] + ',' + parts[1] + ',' + parts[2], parseInt(parts[3])]);
                }
            }
            pendingChunkOverrides.set(key, entries);

            // 已生成的区块立即应用
            const c = chunks.get(key);
            if (c) {
                c.data = new Map(entries.map(([k, id]) => [k, id]));
                c.modified = true;
                c.empty = c.data.size === 0;
                c.dirty = true;
                renderQueue.add(c);
            }
        }
    }

    // 恢复游戏时间
    if (typeof saveData.gameTime === 'number') {
        gameTime = saveData.gameTime;
    }

    // 恢复玩家位置与视角
    if (saveData.player) {
        player.x = saveData.player.x;
        player.y = saveData.player.y;
        player.z = saveData.player.z;
        player.yaw = saveData.player.yaw;
        player.pitch = saveData.player.pitch;
        player.spawned = true;
        player.onGround = false;
    }

    // 恢复快捷栏（背包数据）
    if (saveData.hotbar) {
        for (let i = 0; i < 9; i++) {
            hotbar[i] = saveData.hotbar[i] || 0;
        }
    }

    if (saveData.hotbarCount) {
        for (let i = 0; i < 9; i++) {
            hotbarCount[i] = saveData.hotbarCount[i] || 0;
        }
    }

    // 恢复主背包
    if (saveData.inventory) {
        for (let i = 0; i < inventory.length; i++) {
            inventory[i] = saveData.inventory[i] || 0;
        }
    }
    if (saveData.inventoryCount) {
        for (let i = 0; i < inventoryCount.length; i++) {
            inventoryCount[i] = saveData.inventoryCount[i] || 0;
        }
    }

    if (saveData.selected !== undefined) {
        selected = saveData.selected;
    }

    // 恢复生存状态
    if (saveData.survival && survivalStats) {
        survivalStats.health = saveData.survival.health;
        survivalStats.hunger = saveData.survival.hunger;
    }

    // 恢复作弊设置
    if (saveData.allowCheats !== undefined) {
        localStorage.setItem('allowCheats', saveData.allowCheats ? 'true' : 'false');
        const cmdBtn = document.getElementById('command-btn');
        if (cmdBtn) {
            cmdBtn.style.display = saveData.allowCheats ? 'block' : 'none';
        }
    }

    localStorage.setItem('currentSaveId', saveId);
    updateHotbar();

    console.log('世界已加载:', saveId);
    return true;
}

// 生成存档ID
function generateSaveId() {
    return 'save_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function filterRecipes(category) {
    currentCategory = category;
    
    // 更新分类按钮状态
    document.querySelectorAll('.crafting-category').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.category === category) {
            btn.classList.add('active');
        }
    });
    
    renderRecipes();
}

function searchRecipes(query) {
    searchQuery = query.toLowerCase();
    renderRecipes();
}

function updateRecipeCounts() {
    const availableRecipes = getAvailableRecipes();
    const counts = {
        all: availableRecipes.length,
        blocks: availableRecipes.filter(r => r.category === 'blocks').length,
        tools: availableRecipes.filter(r => r.category === 'tools').length,
        weapons: availableRecipes.filter(r => r.category === 'weapons').length,
        materials: availableRecipes.filter(r => r.category === 'materials').length,
        decorations: availableRecipes.filter(r => r.category === 'decorations').length
    };
    
    Object.entries(counts).forEach(([cat, count]) => {
        const el = document.getElementById(`count-${cat}`);
        if (el) el.textContent = count;
    });
}

function getInventoryCount(itemId) {
    let count = 0;
    for (let i = 0; i < 9; i++) {
        if (hotbar[i] === itemId) {
            count += hotbarCount[i];
        }
    }
    return count;
}

function canCraftRecipe(recipe) {
    for (const material of recipe.materials) {
        if (getInventoryCount(material.id) < material.count) {
            return false;
        }
    }
    return true;
}

function consumeMaterials(materials) {
    for (const material of materials) {
        let remaining = material.count;
        for (let i = 0; i < 9 && remaining > 0; i++) {
            if (hotbar[i] === material.id) {
                const take = Math.min(remaining, hotbarCount[i]);
                hotbarCount[i] -= take;
                remaining -= take;
                if (hotbarCount[i] <= 0) {
                    hotbar[i] = 0;
                }
            }
        }
    }
}

function craftRecipe(recipeId) {
    const recipe = CraftingRecipes.find(r => r.id === recipeId);
    if (!recipe) return;
    
    if (!canCraftRecipe(recipe)) {
        showNotification('材料不足！', 'error');
        return;
    }
    
    // 消耗材料
    consumeMaterials(recipe.materials);
    
    // 添加产物到物品栏
    addItemToInventory(recipe.result, recipe.count);
    
    // 刷新显示
    updateHotbar();
    renderRecipes();
    
    showNotification(`成功合成 ${recipe.name} x${recipe.count}!`, 'success');
}

function showNotification(message, type = 'info') {
    const notif = document.createElement('div');
    const bgColor = type === 'success' ? 'rgba(139, 195, 74, 0.9)' : type === 'error' ? 'rgba(239, 68, 68, 0.9)' : 'rgba(0, 212, 255, 0.9)';
    notif.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: ${bgColor};
        color: #000;
        padding: 12px 24px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: bold;
        z-index: 10000;
        animation: slideDown 0.3s ease;
    `;
    notif.textContent = message;
    document.body.appendChild(notif);
    setTimeout(() => {
        notif.style.animation = 'slideUp 0.3s ease';
        setTimeout(() => notif.remove(), 300);
    }, 2000);
}

// 添加动画CSS
const animStyle = document.createElement('style');
animStyle.textContent = `
    @keyframes slideDown {
        from { transform: translateX(-50%) translateY(-100%); opacity: 0; }
        to { transform: translateX(-50%) translateY(0); opacity: 1; }
    }
    @keyframes slideUp {
        from { transform: translateX(-50%) translateY(0); opacity: 1; }
        to { transform: translateX(-50%) translateY(-100%); opacity: 0; }
    }
`;
document.head.appendChild(animStyle);

// BlockDefs 查找缓存
const _blockDefCache = new Map();
function getBlockDef(itemId) {
    let def = _blockDefCache.get(itemId);
    if (!def) {
        def = BlockDefs[itemId];
        if (def) _blockDefCache.set(itemId, def);
    }
    return def;
}

function createItemIcon(itemId, size = 28) {
    const def = getBlockDef(itemId);
    if (!def) return `<div style="width:${size}px;height:${size}px;background:rgba(255,255,255,0.1);border-radius:4px;"></div>`;
    
    let imgUrl;
    if (def.isItem && def.tex) {
        // 物品材质在items文件夹
        imgUrl = BASE_URL + 'items/' + def.tex + '.png';
    } else if (def.tex) {
        // 方块材质在blocks文件夹
        imgUrl = BASE_URL + 'blocks/' + def.tex + '.png';
    } else if (def.faces) {
        imgUrl = BASE_URL + 'blocks/' + def.faces[2] + '.png';
    } else {
        return `<div style="width:${size}px;height:${size}px;background:rgba(255,255,255,0.1);border-radius:4px;"></div>`;
    }
    
    return `<img src="${imgUrl}" style="width:${size}px;height:${size}px;object-fit:contain;image-rendering:pixelated;" onerror="this.style.display='none'">`;
}

function renderRecipes() {
    const grid = document.getElementById('recipes-grid');
    const hasTable = hasCraftingTable();
    
    // 获取可用配方
    let recipes = getAvailableRecipes();
    
    // 分类筛选
    if (currentCategory !== 'all') {
        recipes = recipes.filter(r => r.category === currentCategory);
    }
    
    // 搜索筛选
    if (searchQuery) {
        recipes = recipes.filter(r => r.name.toLowerCase().includes(searchQuery));
    }
    
    // 显示工作台提示
    const craftingTitle = document.querySelector('.crafting-title');
    if (craftingTitle) {
        if (hasTable) {
            craftingTitle.innerHTML = '⚒ 合成台 (3×3)';
            craftingTitle.style.color = '#00d4ff';
        } else {
            craftingTitle.innerHTML = '⚒ 合成 (2×2) - 需要工作台解锁更多配方';
            craftingTitle.style.color = '#fbbf24';
        }
    }
    
    grid.innerHTML = recipes.map(recipe => {
        const canCraft = canCraftRecipe(recipe);
        
        // 根据配方网格大小生成预览
        const gridSize = recipe.gridSize || 3;
        const gridClass = gridSize === 2 ? 'grid-2x2' : 'grid-3x3';
        const gridPreview = recipe.pattern.map((row, y) => 
            row.map((itemId, x) => {
                const hasItem = itemId !== 0;
                return `<div class="crafting-slot-preview ${hasItem ? 'filled' : ''}">${hasItem ? createItemIcon(itemId, 24) : ''}</div>`;
            }).join('')
        ).join('');
        
        // 生成材料列表
        const materialsList = recipe.materials.map(m => {
            const hasEnough = getInventoryCount(m.id) >= m.count;
            return `
                <div class="material-item ${hasEnough ? 'has-enough' : ''}">
                    <div class="material-icon">${createItemIcon(m.id, 20)}</div>
                    <span class="material-name">${m.name}</span>
                    <span class="material-count">${getInventoryCount(m.id)}/${m.count}</span>
                </div>
            `;
        }).join('');
        
        return `
            <div class="recipe-card ${canCraft ? 'can-craft' : ''}">
                <div class="recipe-header">
                    <div class="recipe-result">
                        ${createItemIcon(recipe.result, 40)}
                        ${recipe.count > 1 ? `<span class="recipe-result-count">${recipe.count}</span>` : ''}
                    </div>
                    <div class="recipe-info">
                        <div class="recipe-name">${recipe.name}</div>
                        <div class="recipe-category-tag">${getCategoryName(recipe.category)}</div>
                    </div>
                </div>
                
                <div class="recipe-pattern">
                    <div class="crafting-grid-preview ${gridClass}">${gridPreview}</div>
                    <div class="crafting-arrow">→</div>
                    <div class="crafting-result-preview">${createItemIcon(recipe.result, 32)}</div>
                </div>
                
                <div class="recipe-materials">
                    <div class="materials-title">所需材料:</div>
                    <div class="materials-list">${materialsList}</div>
                </div>
                
                <button class="craft-btn" onclick="craftRecipe('${recipe.id}')" ${!canCraft ? 'disabled' : ''}>
                    ${canCraft ? '🔨 合成' : '❌ 材料不足'}
                </button>
            </div>
        `;
    }).join('');
    
    if (recipes.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 60px; color: #64748b;">
                <div style="font-size: 48px; margin-bottom: 16px;">🔍</div>
                <div style="font-size: 16px;">没有找到匹配的配方</div>
            </div>
        `;
    }
}

function getCategoryName(category) {
    const names = {
        blocks: '建筑方块',
        tools: '工具',
        weapons: '武器',
        materials: '材料',
        decorations: '装饰'
    };
    return names[category] || category;
}

// 修改addItemToInventory支持数量
function addItemToInventory(blockId, count = 1) {
    // 先尝试堆叠到已有物品
    for (let i = 0; i < 9; i++) {
        if (hotbar[i] === blockId && hotbarCount[i] < 64) {
            const canAdd = Math.min(count, 64 - hotbarCount[i]);
            hotbarCount[i] += canAdd;
            count -= canAdd;
            if (count <= 0) {
                updateHotbar();
                return;
            }
        }
    }
    
    // 再找空位
    for (let i = 0; i < 9; i++) {
        if (hotbar[i] === 0) {
            hotbar[i] = blockId;
            hotbarCount[i] = Math.min(count, 64);
            count -= hotbarCount[i];
            if (count <= 0) {
                updateHotbar();
                return;
            }
        }
    }
    
    updateHotbar();
}

const IsSolid = new Array(1024).fill(true);
const IsTransparent = new Array(1024).fill(false);
const IsCross = new Array(1024).fill(false);
const BlockLight = new Array(1024).fill(0);
const BlockHardness = new Array(1024).fill(1);
const IsFire = new Array(1024).fill(false);
const BlockMaterials = {};

async function initMaterials() {
    const toLoadBlocks = new Set();
    const toLoadItems = new Set();
    
    for (const [id, def] of Object.entries(BlockDefs)) {
        if (def.tex) {
            if (def.isItem) {
                toLoadItems.add(def.tex);
            } else {
                toLoadBlocks.add(def.tex);
            }
        }
        if (def.faces) def.faces.forEach(f => toLoadBlocks.add(f));
    }
    
    totalTextures = toLoadBlocks.size + toLoadItems.size;
    updateProgress();
    
    // 加载blocks文件夹材质
    await Promise.all(Array.from(toLoadBlocks).map(name => loadTexture(name)));
    // 加载items文件夹材质
    await Promise.all(Array.from(toLoadItems).map(name => loadTexture(name, true)));
    
    const defaultMat = new THREE.MeshLambertMaterial({ color: 0xff00ff });
    
    // 初始化所有方块材质（0-255）
    for (let id = 0; id < 256; id++) {
        const def = BlockDefs[id];
        if (!def) {
            BlockMaterials[id] = defaultMat;
            continue;
        }
        
        if (def.solid === false) IsSolid[id] = false;
        if (def.transparent) IsTransparent[id] = true;
        if (def.cross) IsCross[id] = true;
        if (def.light) BlockLight[id] = def.light;
        if (def.hardness !== undefined) BlockHardness[id] = def.hardness;
        
        try {
            if (def.tex) {
                const texData = textureCache.get(def.tex) || null;
                const tex = texData ? texData.texture : null;
                const params = { 
                    map: tex, 
                    transparent: def.transparent || false, 
                    alphaTest: def.cross ? 0.5 : 0.1,
                    side: def.cross ? THREE.DoubleSide : THREE.FrontSide
                };
                if (def.tint || (def.cross && id === 31)) params.color = def.tint || 0x8BC34A;
                BlockMaterials[id] = new THREE.MeshLambertMaterial(params);
            } else if (def.faces) {
                BlockMaterials[id] = def.faces.map(face => {
                    const texData = textureCache.get(face) || null;
                    const tex = texData ? texData.texture : null;
                    return new THREE.MeshLambertMaterial({ 
                        map: tex,
                        transparent: def.transparent || false, 
                        alphaTest: 0.1
                    });
                });
            } else {
                BlockMaterials[id] = defaultMat;
            }
        } catch(e) {
            BlockMaterials[id] = defaultMat;
        }
    }
    
    // 初始化ID > 256的方块和物品材质
    for (const [id, def] of Object.entries(BlockDefs)) {
        const blockId = parseInt(id);
        if (blockId < 256) continue; // 跳过已处理的方块
        if (!def) continue;
        
        // 设置方块属性
        if (def.solid === false) IsSolid[blockId] = false;
        if (def.transparent) IsTransparent[blockId] = true;
        if (def.cross) IsCross[blockId] = true;
        if (def.light) BlockLight[blockId] = def.light;
        if (def.hardness !== undefined) BlockHardness[blockId] = def.hardness;
        if (def.isFire) IsFire[blockId] = true;
        
        try {
            if (def.tex) {
                const texData = textureCache.get(def.tex) || null;
                const tex = texData ? texData.texture : null;
                const params = { 
                    map: tex, 
                    transparent: def.transparent || false, 
                    alphaTest: def.cross ? 0.5 : 0.1,
                    side: def.cross ? THREE.DoubleSide : THREE.FrontSide
                };
                if (def.tint) params.color = def.tint;
                BlockMaterials[blockId] = new THREE.MeshLambertMaterial(params);
            } else if (def.faces) {
                BlockMaterials[blockId] = def.faces.map(face => {
                    const texData = textureCache.get(face) || null;
                    const tex = texData ? texData.texture : null;
                    return new THREE.MeshLambertMaterial({ 
                        map: tex,
                        transparent: def.transparent || false, 
                        alphaTest: 0.1
                    });
                });
            } else {
                BlockMaterials[blockId] = defaultMat;
            }
        } catch(e) {
            BlockMaterials[blockId] = defaultMat;
        }
    }
    
    document.getElementById('loading').style.opacity = 0;
    setTimeout(() => {
        document.getElementById('loading').style.display = 'none';
        initGame();
        updateHotbar();
        initInventory();
    }, 500);
}


const CHUNK_SIZE = 16;
const chunks = new Map();
const renderQueue = new Set();
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);

const renderer = new THREE.WebGLRenderer({canvas: document.getElementById('gl'), antialias: false, powerPreference: "high-performance"});
const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);

// ==================== 苹果光照模组（Apple Lighting） ====================
// 移植自「光影版」：PCF软阴影映射 + 双光源系统 + 群系光照自适应 + 动态阴影相机跟随
const AppleLighting = {
    enabled: (() => {
        try {
            const mods = JSON.parse(localStorage.getItem('activeMods') || '{}');
            // 兼容旧键名
            return mods.smoothLighting === true || mods.appleLighting === true;
        }
        catch(e) { return false; }
    })(),
    hemiLight: null,   // 半球光（环境光）
    dirLight: null,    // 方向光（太阳/月亮，产生阴影）

    // 初始化双光源 + 阴影映射（仅模组开启时调用）
    init() {
        // 渲染器：阴影映射 + 电影级色调映射
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;   // PCF软阴影（边缘平滑）
        renderer.toneMapping = THREE.ACESFilmicToneMapping; // 电影级色调映射
        renderer.toneMappingExposure = 1.0;

        // 1. 半球光（环境光）- 模拟天空和地面反射
        this.hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
        this.hemiLight.color.setHSL(0.6, 1, 0.6);          // 天空色：偏蓝
        this.hemiLight.groundColor.setHSL(0.095, 1, 0.75); // 地面色：偏暖
        this.hemiLight.position.set(0, 50, 0);
        scene.add(this.hemiLight);

        // 2. 方向光（太阳光/月光）- 产生阴影的主光源
        this.dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
        this.dirLight.color.setHSL(0.1, 1, 0.95);          // 暖白色阳光
        this.dirLight.position.set(30, 50, 20);
        scene.add(this.dirLight);
        scene.add(this.dirLight.target);

        // 阴影相机配置（80×80 覆盖区域，跟随玩家防止阴影消失）
        this.dirLight.castShadow = true;
        this.dirLight.shadow.mapSize.width = 2048;
        this.dirLight.shadow.mapSize.height = 2048;
        this.dirLight.shadow.camera.left = -40;
        this.dirLight.shadow.camera.right = 40;
        this.dirLight.shadow.camera.top = 40;
        this.dirLight.shadow.camera.bottom = -40;
        this.dirLight.shadow.camera.near = 0.5;
        this.dirLight.shadow.camera.far = 200;
        this.dirLight.shadow.bias = -0.0005;               // 解决阴影痤疮
        this.dirLight.shadow.radius = 4;                   // 软阴影半径

        window.sunLight = this.dirLight;                   // 供昼夜循环调节强度
    },

    // 每帧更新：光源跟随玩家 + 群系/昼夜光照自适应
    update() {
        if (!this.dirLight || !this.hemiLight) return;

        // 阴影相机跟随玩家（光源目标始终看向玩家，阴影永不消失）
        this.dirLight.position.set(player.x + 30, 50, player.z + 20);
        this.dirLight.target.position.set(player.x, player.y, player.z);
        this.dirLight.target.updateMatrixWorld();

        // 群系光照自适应（沙漠更亮、雪地反光）
        const biome = getBiomeAt(player.x, player.z);
        let hemiIntensity = isDay ? 0.6 : 0.2;
        if (biome === 'desert') hemiIntensity *= 1.1;
        if (biome === 'snow') hemiIntensity *= 1.05;
        this.hemiLight.intensity = hemiIntensity;

        // 方向光：白天随 sunLight 变化，夜晚固定月光
        this.dirLight.intensity = isDay ? sunLight * 1.0 : 0.4;
    }
};

function getBlockGlobal(cx, cz, x, y, z) {
    if (x < 0) { cx--; x += CHUNK_SIZE; }
    if (x >= CHUNK_SIZE) { cx++; x -= CHUNK_SIZE; }
    if (z < 0) { cz--; z += CHUNK_SIZE; }
    if (z >= CHUNK_SIZE) { cz++; z -= CHUNK_SIZE; }
    
    const key = `${cx},${cz}`;
    const chunk = chunks.get(key);
    if (!chunk) return 0;
    return chunk.get(x, y, z);
}

function isSolidGlobal(cx, cz, x, y, z) {
    const id = getBlockGlobal(cx, cz, x, y, z);
    return id !== 0 && IsSolid[id] && !IsTransparent[id];
}

// 存档中待应用的区块数据（key: "cx,cz" -> [ [x,y,z,id], ... ]）
const pendingChunkOverrides = new Map();

class Chunk {
    constructor(cx, cz) {
        this.cx = cx; 
        this.cz = cz;
        this.data = new Map();
        this.meshes = new Map();
        this.isLoaded = false;
        this.biomes = new Map();
        this.biomeColor = null;
        this.dirty = true;
        this.empty = true;
        this.modified = false;
        this.generate();
        // 应用存档中的区块数据（放置/破坏的方块）
        const savedData = pendingChunkOverrides.get(`${cx},${cz}`);
        if (savedData !== undefined) {
            this.data = new Map(savedData);
            this.modified = true;
            this.empty = this.data.size === 0;
            this.dirty = true;
            renderQueue.add(this);
        }
    }
    
    get(x,y,z) { return this.data.get(`${x},${y},${z}`) || 0; }
    
    set(x,y,z,id) { 
        const key = `${x},${y},${z}`;
        const oldId = this.data.get(key) || 0;
        if (oldId === id) return;
        
        if (id === 0) this.data.delete(key); 
        else this.data.set(key, id); 
        
        this.empty = false;
        this.dirty = true;
        this.modified = true;
        renderQueue.add(this);
        
        if (x === 0) this.markNeighborDirty(-1, 0);
        if (x === CHUNK_SIZE - 1) this.markNeighborDirty(1, 0);
        if (z === 0) this.markNeighborDirty(0, -1);
        if (z === CHUNK_SIZE - 1) this.markNeighborDirty(0, 1);
    }
    
    markNeighborDirty(dx, dz) {
        const neighbor = chunks.get(`${this.cx + dx},${this.cz + dz}`);
        if (neighbor) {
            neighbor.dirty = true;
            renderQueue.add(neighbor);
        }
    }
    
    getBiome(x,z) { return this.biomes.get(`${x},${z}`) || 'plains'; }
    
    generate() {
        const centerX = this.cx * CHUNK_SIZE + CHUNK_SIZE/2;
        const centerZ = this.cz * CHUNK_SIZE + CHUNK_SIZE/2;
        
        const cont = noise.continentalness(centerX, centerZ);
        const ero = noise.erosion(centerX, centerZ);
        const pv = noise.pv(centerX, centerZ);
        const temp = noise.temperature(centerX, centerZ);
        const humid = noise.humidity(centerX, centerZ);
        
        let biome = this.determineBiome(cont, ero, pv, temp, humid);
        this.biomeColor = BiomeColors[biome] || BiomeColors.plains;
        
        const heightMap = new Float32Array(CHUNK_SIZE * CHUNK_SIZE);
        
        for (let x = 0; x < CHUNK_SIZE; x++) {
            for (let z = 0; z < CHUNK_SIZE; z++) {
                const wx = this.cx * CHUNK_SIZE + x;
                const wz = this.cz * CHUNK_SIZE + z;
                
                const c = noise.continentalness(wx, wz);
                const e = noise.erosion(wx, wz);
                const p = noise.pv(wx, wz);
                
                const h = getTerrainHeight(c, p, e);
                heightMap[x + z*CHUNK_SIZE] = h;
                
                const localBiome = this.determineBiome(c, e, p, 
                    noise.temperature(wx, wz), 
                    noise.humidity(wx, wz));
                this.biomes.set(`${x},${z}`, localBiome);
                
                this.generateColumn(x, h, z, localBiome, c);
            }
        }
        
        // 洞穴雕刻与矿脉生成（在基础地形完成后进行）
        this.carveCavesAndOres(heightMap);

        this.empty = this.data.size === 0;
        this.isLoaded = true;
    }

    // 判断某位置是否处于洞穴中（3D噪声双通道）
    isCaveAt(wx, y, wz) {
        if (y < 6 || y > 100) return false;
        const a = noise.caveA(wx, y, wz);
        const b = noise.caveB(wx, y, wz);
        // 奶酪洞：宽阔洞室
        if (a > 0.62) return true;
        // 意大利面洞：细长蜿蜒通道
        if (Math.abs(a) < 0.06 && Math.abs(b) < 0.06) return true;
        return false;
    }

    // 矿脉生成：洞穴暴露面矿脉富集，普通石头层也有稀疏矿脉
    generateOreInStone(wx, y, wz, inCave) {
        // (矿石ID, 最低Y, 最高Y, 稀有度阈值, 洞穴内加成)
        // 噪声实际范围约 ±0.66，阈值需在该范围内
        // (矿石ID, 最低Y, 最高Y, 噪声阈值, 概率系数, 洞穴加成)
        const oreTable = [
            [16,  5,  80, 0.30, 0.55, 0.35],  // 煤矿石：常见
            [15,  5,  60, 0.36, 0.50, 0.38],  // 铁矿石
            [130, 5,  34, 0.44, 0.45, 0.40],  // 青金石矿石
            [14,  5,  32, 0.45, 0.45, 0.40],  // 金矿石
            [73,  5,  20, 0.46, 0.45, 0.40],  // 红石矿石
            [56,  5,  16, 0.48, 0.45, 0.42],  // 钻石矿石：稀有深层
            [129, 5,  30, 0.52, 0.45, 0.42],  // 绿宝石矿石：最稀有
        ];
        for (let i = 0; i < oreTable.length; i++) {
            const [id, minY, maxY, threshold, coef, caveBonus] = oreTable[i];
            if (y < minY || y > maxY) continue;
            const n = noise.oreNoise(wx, y, wz, i * 137.5);
            if (n < threshold) continue;
            let chance = (n - threshold) * coef;
            if (inCave) chance += caveBonus * (n - threshold) + 0.02;
            if (noise.hash(wx, y, wz) < chance) return id;
        }
        return 0;
    }

    carveCavesAndOres(heightMap) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
            for (let z = 0; z < CHUNK_SIZE; z++) {
                const wx = this.cx * CHUNK_SIZE + x;
                const wz = this.cz * CHUNK_SIZE + z;
                const h = heightMap[x + z * CHUNK_SIZE];

                // 第一遍：雕刻洞穴（保留基岩层）
                for (let y = 6; y <= h; y++) {
                    if (this.isCaveAt(wx, y, wz)) {
                        this.data.delete(`${x},${y},${z}`);
                    }
                }

                // 清理洞穴顶部的悬空植被（草、花、灌木下方被掏空时移除）
                for (let y = 6; y <= h + 2; y++) {
                    const key = `${x},${y},${z}`;
                    const id = this.data.get(key);
                    if (id === 31 || id === 32 || id === 37 || id === 38) {
                        const below = this.data.get(`${x},${y-1},${z}`);
                        if (below === undefined) this.data.delete(key);
                    }
                }

                // 第二遍：在剩余石头中生成矿脉
                for (let y = 5; y <= h; y++) {
                    const key = `${x},${y},${z}`;
                    if (this.data.get(key) !== 1) continue; // 只替换石头
                    // 检测是否暴露在洞穴空气旁（矿脉富集于洞壁）
                    let exposed = false;
                    if (this.isCaveAt(wx+1, y, wz)) exposed = true;
                    else if (this.isCaveAt(wx-1, y, wz)) exposed = true;
                    else if (this.isCaveAt(wx, y, wz+1)) exposed = true;
                    else if (this.isCaveAt(wx, y, wz-1)) exposed = true;
                    else if (this.isCaveAt(wx, y+1, wz)) exposed = true;
                    else if (this.isCaveAt(wx, y-1, wz)) exposed = true;

                    const oreId = this.generateOreInStone(wx, y, wz, exposed);
                    if (oreId) this.data.set(key, oreId);
                }
            }
        }
    }

    determineBiome(cont, ero, pv, temp, humid) {
        if (temp > 0.6 && humid < -0.3 && Math.random() < 0.3) return 'desert';
        if (temp < -0.5) return 'snow';
        if (cont > 0.4 || pv > 0.6) return 'mountain';
        if (humid > 0.2) return 'forest';
        return 'plains';
    }
    
    generateColumn(x, height, z, biome, continentalness) {
        let surfaceBlock, subsurfaceBlock;
        switch(biome) {
            case 'desert':
                surfaceBlock = 12;
                subsurfaceBlock = 12;
                break;
            case 'snow':
                surfaceBlock = 78;
                subsurfaceBlock = 3;
                break;
            case 'mountain':
                surfaceBlock = continentalness > 0.6 ? 1 : 4;
                subsurfaceBlock = 1;
                break;
            default:
                surfaceBlock = 2;
                subsurfaceBlock = 3;
        }
        
        for (let y = 0; y <= height; y++) {
            let id = 1;
            if (y === height) id = surfaceBlock;
            else if (y > height - 3) id = subsurfaceBlock;
            else if (y < 5) id = 7;
            this.data.set(`${x},${y},${z}`, id);
        }
        
        if (height > 0) {
            this.generateVegetation(x, height, z, biome);
        }
    }
    
    generateVegetation(x, y, z, biome) {
        const rand = Math.random();
        const config = BiomeColors[biome];
        
        if (rand < config.treeDensity) {
            if (biome === 'desert') {
                if (Math.random() < 0.7) {
                    const height = 2 + Math.floor(Math.random() * 2);
                    for(let i=0; i<height; i++) {
                        this.data.set(`${x},${y+1+i},${z}`, 81);
                    }
                }
            } else if (biome === 'snow') {
                this.makeTree(x, y, z, 'spruce');
            } else if (biome === 'forest') {
                const treeType = Math.random() < 0.7 ? 'oak' : 'birch';
                this.makeTree(x, y, z, treeType);
            } else if (biome === 'plains' && Math.random() < 0.3) {
                this.makeTree(x, y, z, 'oak');
            }
        }
        
        if (Math.random() < config.grassDensity) {
            if (biome === 'desert') {
                if (Math.random() < 0.3) this.data.set(`${x},${y+1},${z}`, 32);
            } else if (biome === 'forest') {
                this.data.set(`${x},${y+1},${z}`, 31);
            } else if (biome === 'plains') {
                const flowerChance = Math.random();
                if (flowerChance < 0.1) this.data.set(`${x},${y+1},${z}`, 37);
                else if (flowerChance < 0.15) this.data.set(`${x},${y+1},${z}`, 38);
                else this.data.set(`${x},${y+1},${z}`, 31);
            }
        }
    }
    
    makeTree(x, y, z, type) {
        let logId, leafId, height;
        switch(type) {
            case 'spruce': logId = 162; leafId = 161; height = 4 + Math.floor(Math.random()*3); break;
            case 'birch': logId = 163; leafId = 18; height = 5 + Math.floor(Math.random()*2); break;
            case 'oak': 
            default: logId = 17; leafId = 18; height = 4 + Math.floor(Math.random()*2);
        }
        
        for(let i=0; i<height; i++) this.data.set(`${x},${y+1+i},${z}`, logId);
        
        const leafStart = type === 'spruce' ? 2 : 2;
        for(let ly=leafStart; ly<height+1; ly++) {
            const radius = type === 'spruce' ? (ly < height-1 ? 1 : 0) : (ly === height ? 1 : 2);
            for(let lx=-radius; lx<=radius; lx++) {
                for(let lz=-radius; lz<=radius; lz++) {
                    if (lx===0 && lz===0 && ly<height) continue;
                    if (Math.abs(lx)+Math.abs(lz) > radius+1) continue;
                    const nx = x + lx, nz = z + lz;
                    if (nx >= 0 && nx < CHUNK_SIZE && nz >= 0 && nz < CHUNK_SIZE) {
                        this.data.set(`${nx},${y+1+ly},${nz}`, leafId);
                    }
                }
            }
        }
    }
    
    build() {
        if (!this.dirty) return;
        
        for (const mesh of this.meshes.values()) {
            scene.remove(mesh);
            mesh.geometry.dispose();
        }
        this.meshes.clear();
        
        if (this.empty) {
            this.dirty = false;
            return;
        }
        
        const opaqueBuffers = new Map();
        const transparentBuffers = new Map();
        const crossBuffers = new Map();
        
        const faceDefs = [
            { dir: [1,0,0], verts: [[1,0,1],[1,0,0],[1,1,0],[1,1,1]], uvs: [[0,0],[1,0],[1,1],[0,1]] },
            { dir: [-1,0,0], verts: [[0,0,0],[0,0,1],[0,1,1],[0,1,0]], uvs: [[0,0],[1,0],[1,1],[0,1]] },
            { dir: [0,1,0], verts: [[0,1,1],[1,1,1],[1,1,0],[0,1,0]], uvs: [[0,0],[1,0],[1,1],[0,1]] },
            { dir: [0,-1,0], verts: [[0,0,0],[1,0,0],[1,0,1],[0,0,1]], uvs: [[0,0],[1,0],[1,1],[0,1]] },
            { dir: [0,0,1], verts: [[0,0,1],[1,0,1],[1,1,1],[0,1,1]], uvs: [[0,0],[1,0],[1,1],[0,1]] },
            { dir: [0,0,-1], verts: [[1,0,0],[0,0,0],[0,1,0],[1,1,0]], uvs: [[0,0],[1,0],[1,1],[0,1]] }
        ];
        
        const triIndices = [0,1,2, 0,2,3];
        
        for (const [key, id] of this.data) {
            if (!IsSolid[id] && !IsTransparent[id]) continue;
            
            const [x,y,z] = key.split(',').map(Number);
            const isCross = IsCross[id];
            const isTransparent = IsTransparent[id];
            const def = BlockDefs[id];
            const hasMultiMat = Array.isArray(BlockMaterials[id]);
            
            if (isCross) {
                if (!crossBuffers.has(id)) {
                    crossBuffers.set(id, {
                        positions: [], normals: [], uvs: [], colors: [], indices: [],
                        index: 0
                    });
                }
                const buf = crossBuffers.get(id);
                
                const crossVerts = [
                    [[0,0,0],[1,0,1],[1,1,1],[0,1,0]],
                    [[1,0,0],[0,0,1],[0,1,1],[1,1,0]]
                ];
                
                for (let cross of crossVerts) {
                    for (let ti of triIndices) {
                        const v = cross[ti];
                        buf.positions.push(x + v[0], y + v[1], z + v[2]);
                        buf.normals.push(0, 1, 0);
                        buf.uvs.push(v[0], v[1]);
                        
                        if (id === 31) {
                            const col = this.biomeColor.grass || 0x8BC34A;
                            const r = (col >> 16) & 0xFF;
                            const g = (col >> 8) & 0xFF;
                            const b = col & 0xFF;
                            buf.colors.push(r/255, g/255, b/255);
                        } else {
                            buf.colors.push(1, 1, 1);
                        }
                        
                        buf.indices.push(buf.index++);
                    }
                }
                continue;
            }
            
            for (let fi = 0; fi < 6; fi++) {
                const face = faceDefs[fi];
                const nx = x + face.dir[0];
                const ny = y + face.dir[1];
                const nz = z + face.dir[2];
                
                const neighborId = getBlockGlobal(this.cx, this.cz, nx, ny, nz);
                const neighborSolid = IsSolid[neighborId] && !IsTransparent[neighborId];
                
                if (neighborSolid) continue;
                if (isTransparent && IsTransparent[neighborId]) continue;
                
                let matKey = hasMultiMat ? `${id}_${fi}` : `${id}`;
                const buffers = isTransparent ? transparentBuffers : opaqueBuffers;
                
                if (!buffers.has(matKey)) {
                    buffers.set(matKey, {
                        positions: [], normals: [], uvs: [], colors: [], indices: [],
                        index: 0, blockId: id, faceIndex: hasMultiMat ? fi : -1
                    });
                }
                const buf = buffers.get(matKey);
                
                for (let ti of triIndices) {
                    const v = face.verts[ti];
                    const uv = face.uvs[ti];
                    
                    buf.positions.push(x + v[0], y + v[1], z + v[2]);
                    buf.normals.push(...face.dir);
                    buf.uvs.push(uv[0], uv[1]);
                    
                    if (id === 2 && fi === 2 && def.biomeTint?.[2]) {
                        const col = this.biomeColor.grass || 0x8BC34A;
                        const r = (col >> 16) & 0xFF;
                        const g = (col >> 8) & 0xFF;
                        const b = col & 0xFF;
                        buf.colors.push(r/255, g/255, b/255);
                    } else if (id === 18 && def.tint) {
                        const r = (def.tint >> 16) & 0xFF;
                        const g = (def.tint >> 8) & 0xFF;
                        const b = def.tint & 0xFF;
                        const brightness = fi === 2 ? 1.0 : (fi === 3 ? 0.6 : 0.85);
                        buf.colors.push(r/255*brightness, g/255*brightness, b/255*brightness);
                    } else {
                        let brightness = 1.0;
                        if (fi === 2) brightness = 1.0;
                        else if (fi === 3) brightness = 0.6;
                        else brightness = 0.85;
                        
                        // 添加火把光照
                        const gx = this.cx * CHUNK_SIZE + x;
                        const gy = y;
                        const gz = this.cz * CHUNK_SIZE + z;
                        const torchLight = getTorchBrightness(gx, gy, gz);
                        brightness = Math.min(1.0, brightness + torchLight);
                        
                        buf.colors.push(brightness, brightness, brightness);
                    }
                    
                    buf.indices.push(buf.index++);
                }
            }
        }
        
        for (const [matKey, buf] of opaqueBuffers) {
            if (buf.positions.length === 0) continue;
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(buf.positions, 3));
            geo.setAttribute('normal', new THREE.Float32BufferAttribute(buf.normals, 3));
            geo.setAttribute('uv', new THREE.Float32BufferAttribute(buf.uvs, 2));
            geo.setAttribute('color', new THREE.Float32BufferAttribute(buf.colors, 3));
            geo.setIndex(buf.indices);
            
            const blockId = buf.blockId;
            let mat;
            if (buf.faceIndex >= 0 && Array.isArray(BlockMaterials[blockId])) {
                mat = BlockMaterials[blockId][buf.faceIndex].clone();
                mat.vertexColors = true;
            } else {
                mat = BlockMaterials[blockId].clone();
                mat.vertexColors = true;
            }
            
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(this.cx * CHUNK_SIZE, 0, this.cz * CHUNK_SIZE);
            mesh.frustumCulled = true;
            if (AppleLighting.enabled) { mesh.castShadow = true; mesh.receiveShadow = true; }
            scene.add(mesh);
            this.meshes.set(`opaque_${matKey}`, mesh);
        }
        
        for (const [matKey, buf] of transparentBuffers) {
            if (buf.positions.length === 0) continue;
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(buf.positions, 3));
            geo.setAttribute('normal', new THREE.Float32BufferAttribute(buf.normals, 3));
            geo.setAttribute('uv', new THREE.Float32BufferAttribute(buf.uvs, 2));
            geo.setAttribute('color', new THREE.Float32BufferAttribute(buf.colors, 3));
            geo.setIndex(buf.indices);
            
            const blockId = buf.blockId;
            let mat;
            if (buf.faceIndex >= 0 && Array.isArray(BlockMaterials[blockId])) {
                mat = BlockMaterials[blockId][buf.faceIndex].clone();
                mat.vertexColors = true;
                mat.transparent = true;
            } else {
                mat = BlockMaterials[blockId].clone();
                mat.vertexColors = true;
                mat.transparent = true;
            }
            
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(this.cx * CHUNK_SIZE, 0, this.cz * CHUNK_SIZE);
            mesh.frustumCulled = true;
            mesh.renderOrder = 1;
            if (AppleLighting.enabled) mesh.receiveShadow = true; // 透明物体只接收阴影
            scene.add(mesh);
            this.meshes.set(`trans_${matKey}`, mesh);
        }
        
        for (const [blockId, buf] of crossBuffers) {
            if (buf.positions.length === 0) continue;
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(buf.positions, 3));
            geo.setAttribute('normal', new THREE.Float32BufferAttribute(buf.normals, 3));
            geo.setAttribute('uv', new THREE.Float32BufferAttribute(buf.uvs, 2));
            geo.setAttribute('color', new THREE.Float32BufferAttribute(buf.colors, 3));
            geo.setIndex(buf.indices);
            
            const mat = BlockMaterials[blockId].clone();
            mat.vertexColors = true;
            
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(this.cx * CHUNK_SIZE, 0, this.cz * CHUNK_SIZE);
            mesh.frustumCulled = true;
            mesh.renderOrder = 2;
            if (AppleLighting.enabled) mesh.castShadow = true;
            scene.add(mesh);
            this.meshes.set(`cross_${blockId}`, mesh);
        }
        
        this.dirty = false;
    }
    
    unload() {
        for (const mesh of this.meshes.values()) {
            scene.remove(mesh);
            mesh.geometry.dispose();
        }
        this.meshes.clear();
        this.data.clear();
        this.isLoaded = false;
    }
}

function getBlock(x, y, z) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const iz = Math.floor(z);
    const cx = Math.floor(ix / CHUNK_SIZE);
    const cz = Math.floor(iz / CHUNK_SIZE);
    const c = chunks.get(`${cx},${cz}`);
    if (!c) return 0;
    let lx = ix % CHUNK_SIZE;
    if (lx < 0) lx += CHUNK_SIZE;
    let lz = iz % CHUNK_SIZE;
    if (lz < 0) lz += CHUNK_SIZE;
    return c.get(lx, iy, lz);
}

function setBlock(x, y, z, id, syncNetwork = true) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const iz = Math.floor(z);
    const cx = Math.floor(ix / CHUNK_SIZE);
    const cz = Math.floor(iz / CHUNK_SIZE);
    const c = chunks.get(`${cx},${cz}`);
    if (!c) return false;
    let lx = ix % CHUNK_SIZE;
    if (lx < 0) lx += CHUNK_SIZE;
    let lz = iz % CHUNK_SIZE;
    if (lz < 0) lz += CHUNK_SIZE;
    c.set(lx, iy, lz, id);
    
    // 多人游戏同步
    if (syncNetwork && isMultiplayer) {
        if (id === 0) {
            sendBlockBreak(ix, iy, iz);
        } else {
            sendBlockPlace(ix, iy, iz, id);
        }
    }
    
    return true;
}

function getBiomeAt(x,z) {
    const cx = Math.floor(x/CHUNK_SIZE), cz = Math.floor(z/CHUNK_SIZE);
    const c = chunks.get(`${cx},${cz}`);
    let lx = Math.floor(x) % CHUNK_SIZE;
    if (lx < 0) lx += CHUNK_SIZE;
    let lz = Math.floor(z) % CHUNK_SIZE;
    if (lz < 0) lz += CHUNK_SIZE;
    return c ? c.getBiome(lx, lz) : 'plains';
}

// ==================== 昼夜循环系统 ====================
const DAY_LENGTH = 600;
let gameTime = 0;
let isDay = true;
let sunLight = 1.0;

function updateDayNightCycle(dt) {
    gameTime += dt * 20;
    if (gameTime >= 24000) gameTime = 0;
    
    const dayStart = 0;
    const dayEnd = 12000;
    
    if (gameTime >= dayStart && gameTime < dayEnd) {
        isDay = true;
        if (gameTime < 1000) sunLight = 0.3 + (gameTime / 1000) * 0.7;
        else if (gameTime > 11000) sunLight = 1.0 - ((gameTime - 11000) / 1000) * 0.7;
        else sunLight = 1.0;
    } else {
        isDay = false;
        sunLight = 0.3;
    }
    
    updateSkyColor();
    
    const timeDisplay = document.getElementById('time-display');
    if (isDay) {
        timeDisplay.innerHTML = '<span class="day">☀ 白天</span>';
    } else {
        timeDisplay.innerHTML = '<span class="night">☾ 夜晚</span>';
    }
}

function updateSkyColor() {
    const daySky = [0.5, 0.7, 0.9];
    const nightSky = [0.05, 0.05, 0.15];
    
    const r = daySky[0] * sunLight + nightSky[0] * (1 - sunLight);
    const g = daySky[1] * sunLight + nightSky[1] * (1 - sunLight);
    const b = daySky[2] * sunLight + nightSky[2] * (1 - sunLight);
    
    scene.background.setRGB(r, g, b);
}

// ==================== 生存模式系统 ====================
const survivalStats = isSurvival ? {
    health: 20,
    maxHealth: 20,
    hunger: 20,
    maxHunger: 20,
    hungerTimer: 0,
    healTimer: 0,
    lastY: -9999,
    fallDistance: 0,
    isDead: false,
    score: 0,
    initialized: false
} : null;

function updateSurvivalStats(dt) {
    if (!isSurvival || !survivalStats || survivalStats.isDead) return;
    
    if (!survivalStats.initialized) {
        if (player.spawned) {
            survivalStats.lastY = player.y;
            survivalStats.initialized = true;
        }
        return;
    }
    
    survivalStats.hungerTimer += dt;
    if (survivalStats.hungerTimer >= 80) {
        survivalStats.hungerTimer = 0;
        if (survivalStats.hunger > 0) {
            survivalStats.hunger--;
        }
    }
    
    if (survivalStats.hunger > survivalStats.maxHunger * 0.5 && survivalStats.health < survivalStats.maxHealth) {
        survivalStats.healTimer += dt;
        if (survivalStats.healTimer >= 4) {
            survivalStats.healTimer = 0;
            survivalStats.health = Math.min(survivalStats.maxHealth, survivalStats.health + 1);
        }
    }
    
    if (survivalStats.hunger <= 0) {
        survivalStats.healTimer += dt;
        if (survivalStats.healTimer >= 4) {
            survivalStats.healTimer = 0;
            takeDamage(1, 'starvation');
        }
    }
    
    if (player.onGround) {
        if (survivalStats.fallDistance > 3) {
            const damage = Math.floor(survivalStats.fallDistance - 3);
            if (damage > 0) {
                takeDamage(damage, 'fall');
            }
        }
        survivalStats.fallDistance = 0;
    } else {
        if (player.y < survivalStats.lastY) {
            survivalStats.fallDistance += survivalStats.lastY - player.y;
        }
    }
    survivalStats.lastY = player.y;
    
    updateSurvivalUI();
}

function takeDamage(amount, source) {
    if (!isSurvival || !survivalStats || survivalStats.isDead) return;
    
    survivalStats.health -= amount;
    
    showDamageIndicator(amount, source);
    
    if (survivalStats.health <= 0) {
        die();
    }
    
    updateSurvivalUI();
}

function showDamageIndicator(amount, source) {
    const indicator = document.createElement('div');
    indicator.className = 'damage-indicator';
    indicator.textContent = '-' + amount;
    indicator.style.left = '50%';
    indicator.style.top = '45%';
    indicator.style.transform = 'translate(-50%, -50%)';
    document.body.appendChild(indicator);
    setTimeout(() => indicator.remove(), 1000);
}

function die() {
    if (!survivalStats) return;
    survivalStats.isDead = true;
    survivalStats.health = 0;
    
    document.getElementById('death-score').textContent = '得分: ' + survivalStats.score;
    document.getElementById('death-screen').style.display = 'flex';
}

function respawnPlayer() {
    if (!survivalStats) return;
    
    survivalStats.health = survivalStats.maxHealth;
    survivalStats.hunger = survivalStats.maxHunger;
    survivalStats.isDead = false;
    survivalStats.fallDistance = 0;
    survivalStats.initialized = false;
    
    document.getElementById('death-screen').style.display = 'none';
    
    respawn();
}

function updateSurvivalUI() {
    if (!survivalStats) return;
    
    const healthPercent = (survivalStats.health / survivalStats.maxHealth) * 100;
    const hungerPercent = (survivalStats.hunger / survivalStats.maxHunger) * 100;
    
    document.getElementById('health-fill').style.width = healthPercent + '%';
    document.getElementById('health-value').textContent = survivalStats.health + '/' + survivalStats.maxHealth;
    
    document.getElementById('hunger-fill').style.width = hungerPercent + '%';
    document.getElementById('hunger-value').textContent = survivalStats.hunger + '/' + survivalStats.maxHunger;
}

// ==================== 掉落物系统 ====================
class DroppedItem {
    constructor(blockId, x, y, z) {
        this.blockId = blockId;
        this.x = x;
        this.y = y;
        this.z = z;
        this.vx = (Math.random() - 0.5) * 2;
        this.vy = 2;
        this.vz = (Math.random() - 0.5) * 2;
        this.life = 300;
        this.mesh = null;
        this.createMesh();
    }
    
    createMesh() {
        const def = BlockDefs[this.blockId];
        if (!def) return;
        
        const group = new THREE.Group();
        
        const size = 0.25;
        const geo = new THREE.BoxGeometry(size, size, size);
        let mat;
        
        if (def.tex) {
            mat = BlockMaterials[this.blockId].clone();
        } else if (def.faces) {
            mat = BlockMaterials[this.blockId][0].clone();
        } else {
            mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
        }
        
        const mesh = new THREE.Mesh(geo, mat);
        group.add(mesh);
        
        this.mesh = group;
        this.mesh.position.set(this.x, this.y, this.z);
        scene.add(this.mesh);
    }
    
    update(dt) {
        this.life -= dt;
        
        this.vy -= 20 * dt;
        
        const newX = this.x + this.vx * dt;
        const newY = this.y + this.vy * dt;
        const newZ = this.z + this.vz * dt;
        
        const groundBlock = getBlock(newX, newY - 0.125, newZ);
        if (IsSolid[groundBlock] && !IsTransparent[groundBlock]) {
            this.y = Math.floor(newY - 0.125) + 1 + 0.125;
            this.vy = 0;
            this.vx *= 0.8;
            this.vz *= 0.8;
        } else {
            this.x = newX;
            this.y = newY;
            this.z = newZ;
        }
        
        if (this.mesh) {
            this.mesh.rotation.y += dt * 2;
            this.mesh.position.set(this.x, this.y, this.z);
        }
        
        const dx = player.x - this.x;
        const dy = (player.y + 0.9) - this.y;
        const dz = player.z - this.z;
        const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
        
        if (dist < 1.5) {
            this.pickup();
            return false;
        }
        
        return this.life > 0;
    }
    
    pickup() {
        addItemToInventory(this.blockId, 1);
        
        showPickupNotification(this.blockId);
        
        if (this.mesh) {
            scene.remove(this.mesh);
        }
    }
    
    remove() {
        if (this.mesh) {
            scene.remove(this.mesh);
        }
    }
}

const droppedItems = [];

function spawnDrop(blockId, x, y, z) {
    const dropId = BlockDrops[blockId];
    if (dropId === 0 || dropId === undefined) return;
    
    const item = new DroppedItem(dropId, x + 0.5, y + 0.5, z + 0.5);
    droppedItems.push(item);
}

function updateDroppedItems(dt) {
    for (let i = droppedItems.length - 1; i >= 0; i--) {
        const item = droppedItems[i];
        const alive = item.update(dt);
        if (!alive) {
            if (!item.mesh.parent) {
                item.remove();
            }
            droppedItems.splice(i, 1);
        }
    }
}

function showPickupNotification(blockId) {
    const def = BlockDefs[blockId];
    if (!def) return;
    
    const notif = document.createElement('div');
    notif.style.cssText = `
        position: fixed;
        bottom: 120px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0,0,0,0.7);
        color: #fff;
        padding: 4px 12px;
        border-radius: 4px;
        font-size: 12px;
        z-index: 100;
        animation: fadeOut 2s forwards;
    `;
    notif.textContent = `+1 ${def.name}`;
    document.body.appendChild(notif);
    setTimeout(() => notif.remove(), 2000);
}

const style = document.createElement('style');
style.textContent = `
    @keyframes fadeOut {
        0% { opacity: 1; }
        70% { opacity: 1; }
        100% { opacity: 0; }
    }
`;
document.head.appendChild(style);

// ==================== 物品栏系统 ====================
const hotbar = isSurvival ? [0,0,0,0,0,0,0,0,0] : [2,12,3,17,162,81,31,56,701];
const hotbarCount = isSurvival ? [0,0,0,0,0,0,0,0,0] : [64,64,64,64,64,64,64,64,64];

// 生存模式开局：4个橡木木板（用于合成工作台）
if (isSurvival) {
    hotbar[0] = 5; hotbarCount[0] = 4;  // 4个橡木木板
}

let selected = 0;

// ==================== 挖掘系统 ====================
let miningTarget = null;
let miningProgress = 0;
let isMining = false;

// 获取当前手持物品的工具信息
function getHeldTool() {
    const heldId = hotbar[selected];
    const def = BlockDefs[heldId];
    if (def && def.toolType) {
        return { type: def.toolType, level: def.toolLevel || 1, name: def.name };
    }
    return null; // 徒手或非工具物品
}

// 判断当前工具能否挖掘该方块（等级要求）
function canMineBlock(blockId) {
    const def = BlockDefs[blockId];
    if (!def || def.level === undefined) return { ok: true };
    const held = getHeldTool();
    if (held && held.type === 'pickaxe' && held.level >= def.level) {
        return { ok: true, tool: held };
    }
    const needName = def.level >= 3 ? '铁镐' : def.level === 2 ? '石镐' : '木镐';
    return { ok: false, reason: `需要${needName}或更好的镐子` };
}

function getMiningTime(blockId) {
    const hardness = BlockHardness[blockId] || 1;
    if (hardness < 0) return Infinity;
    if (hardness === 0) return 0.1;
    const def = BlockDefs[blockId];
    const held = getHeldTool();
    // 工具类型匹配时挖掘加速
    if (held && def && def.tool && held.type === def.tool) {
        return hardness * 0.5 / (1 + held.level * 0.8);
    }
    return hardness * 0.5;
}

let lastMineHintTime = 0;
function startMining(x, y, z) {
    if (!isSurvival) return true;

    const blockId = getBlock(x, y, z);
    if (blockId === 0) return false;

    // 基岩不可挖
    if ((BlockHardness[blockId] || 1) < 0) return false;

    // 工具等级检查：徒手或镐子等级不足时无法挖掘
    const check = canMineBlock(blockId);
    if (!check.ok) {
        const now = Date.now();
        if (now - lastMineHintTime > 1500) {
            lastMineHintTime = now;
            if (typeof showNotification === 'function') {
                showNotification('⛏ ' + BlockDefs[blockId].name + '：' + check.reason);
            }
        }
        return false;
    }

    const miningTime = getMiningTime(blockId);
    if (miningTime === Infinity) return false;

    miningTarget = { x, y, z, blockId, time: miningTime };
    miningProgress = 0;
    isMining = true;

    document.getElementById('mining-progress').style.display = 'block';

    return false;
}

function updateMining(dt) {
    if (!isMining || !miningTarget) return;
    
    const ray = window.getRay && window.getRay();
    if (!ray || ray.break.x !== miningTarget.x || ray.break.y !== miningTarget.y || ray.break.z !== miningTarget.z) {
        cancelMining();
        return;
    }
    
    miningProgress += dt;
    
    const progressPercent = Math.min(100, (miningProgress / miningTarget.time) * 100);
    document.getElementById('mining-fill').style.width = progressPercent + '%';
    
    if (miningProgress >= miningTarget.time) {
        const blockId = getBlock(miningTarget.x, miningTarget.y, miningTarget.z);
        if (blockId !== 0) {
            spawnDrop(blockId, miningTarget.x, miningTarget.y, miningTarget.z);
        }
        
        setBlock(miningTarget.x, miningTarget.y, miningTarget.z, 0);
        cancelMining();
        
        if (survivalStats) survivalStats.score++;
    }
}

function cancelMining() {
    isMining = false;
    miningTarget = null;
    miningProgress = 0;
    document.getElementById('mining-progress').style.display = 'none';
    document.getElementById('mining-fill').style.width = '0%';
}

// ==================== 火把系统 ====================
const torches = new Set();
const TORCH_LIGHT_RADIUS = 8; // 火把光照范围
const TORCH_LIGHT_STRENGTH = 0.8; // 火把光照强度

function placeTorch(x, y, z) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const iz = Math.floor(z);
    
    setBlock(ix, iy, iz, 50);
    torches.add(`${ix},${iy},${iz}`);
    
    // 标记周围区块需要重建以应用光照
    markChunksDirtyAroundTorch(ix, iy, iz);
}

// 标记火把周围的区块为脏，需要重建
function markChunksDirtyAroundTorch(tx, ty, tz) {
    const radius = TORCH_LIGHT_RADIUS + 2;
    const minCx = Math.floor((tx - radius) / CHUNK_SIZE);
    const maxCx = Math.floor((tx + radius) / CHUNK_SIZE);
    const minCz = Math.floor((tz - radius) / CHUNK_SIZE);
    const maxCz = Math.floor((tz + radius) / CHUNK_SIZE);
    
    for (let cx = minCx; cx <= maxCx; cx++) {
        for (let cz = minCz; cz <= maxCz; cz++) {
            const chunk = chunks.get(`${cx},${cz}`);
            if (chunk) {
                chunk.dirty = true;
                renderQueue.add(chunk);
            }
        }
    }
}

// 获取指定位置的光照亮度（0-1）
function getTorchBrightness(x, y, z) {
    let maxBrightness = 0;
    
    for (const torchKey of torches) {
        const [tx, ty, tz] = torchKey.split(',').map(Number);
        const dist = Math.sqrt((x-tx)**2 + (y-ty)**2 + (z-tz)**2);
        
        if (dist < TORCH_LIGHT_RADIUS) {
            // 线性衰减
            const brightness = TORCH_LIGHT_STRENGTH * (1 - dist / TORCH_LIGHT_RADIUS);
            maxBrightness = Math.max(maxBrightness, brightness);
        }
    }
    
    return Math.min(maxBrightness, TORCH_LIGHT_STRENGTH);
}

function isNearTorch(px, py, pz, radius = 10) {
    for (const torchKey of torches) {
        const [tx, ty, tz] = torchKey.split(',').map(Number);
        const dist = Math.sqrt((px-tx)**2 + (py-ty)**2 + (pz-tz)**2);
        if (dist < radius) return true;
    }
    return false;
}


// ==================== 生物系统 ====================
class Mob {
    constructor(type, x, y, z) {
        this.type = type;
        this.x = x;
        this.y = y;
        this.z = z;
        this.vx = 0;
        this.vz = 0;
        this.yaw = Math.random() * Math.PI * 2;
        this.targetYaw = this.yaw;
        this.state = 'idle';
        this.stateTimer = 0;
        this.walkSpeed = type === 'chicken' ? 2 : (type === 'pig' ? 1.5 : (type === 'zombie' ? 2.5 : 1));
        this.width = type === 'chicken' ? 0.4 : (type === 'zombie' ? 0.8 : 0.9);
        this.height = type === 'chicken' ? 0.7 : (type === 'zombie' ? 2.0 : 1.4);
        this.mesh = null;
        this.animTime = 0;
        
        this.maxHealth = type === 'chicken' ? 4 : (type === 'pig' ? 10 : (type === 'zombie' ? 20 : 10));
        this.health = this.maxHealth;
        this.dead = false;
        this.hitCooldown = 0;
        this.flashTime = 0;
        this.attackCooldown = 0;
        
        this.createMesh();
    }
    
    createMesh() {
        const group = new THREE.Group();
        
        let bodyColor = this.getBaseColor();
        
        const bodyGeo = new THREE.BoxGeometry(0.9, this.type === 'zombie' ? 1.4 : 0.6, this.type === 'zombie' ? 0.5 : 1.4);
        const bodyMat = new THREE.MeshLambertMaterial({ color: bodyColor });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = this.type === 'zombie' ? 1.2 : 0.9;
        body.name = 'body';
        group.add(body);
        
        const headSize = this.type === 'zombie' ? 0.6 : 0.5;
        const headGeo = new THREE.BoxGeometry(headSize, headSize, headSize);
        const head = new THREE.Mesh(headGeo, bodyMat);
        head.position.set(0, this.type === 'zombie' ? 2.0 : 1.3, this.type === 'zombie' ? 0 : 0.8);
        head.name = 'head';
        group.add(head);
        
        if (this.type === 'zombie') {
            const armGeo = new THREE.BoxGeometry(0.25, 1.0, 0.25);
            const leftArm = new THREE.Mesh(armGeo, bodyMat);
            leftArm.position.set(-0.5, 1.4, 0);
            leftArm.name = 'leftArm';
            group.add(leftArm);
            
            const rightArm = new THREE.Mesh(armGeo, bodyMat);
            rightArm.position.set(0.5, 1.4, 0);
            rightArm.name = 'rightArm';
            group.add(rightArm);
            
            this.arms = [leftArm, rightArm];
        }
        
        this.legs = [];
        const legPositions = this.type === 'zombie' ? 
            [[-0.2, 0.3, 0], [0.2, 0.3, 0]] :
            [[-0.3, 0.3, 0.5], [0.3, 0.3, 0.5], [-0.3, 0.3, -0.5], [0.3, 0.3, -0.5]];
        for (let pos of legPositions) {
            const legGeo = new THREE.BoxGeometry(0.25, this.type === 'zombie' ? 0.9 : 0.6, 0.25);
            const leg = new THREE.Mesh(legGeo, bodyMat);
            leg.position.set(pos[0], pos[1], pos[2]);
            leg.name = 'leg';
            group.add(leg);
            this.legs.push(leg);
        }
        
        if (this.type === 'sheep') {
            const woolGeo = new THREE.BoxGeometry(1.0, 0.7, 1.5);
            const woolMat = new THREE.MeshLambertMaterial({ color: 0xf0f0f0 });
            const wool = new THREE.Mesh(woolGeo, woolMat);
            wool.position.y = 0.95;
            wool.name = 'wool';
            group.add(wool);
        }
        
        this.mesh = group;
        this.mesh.position.set(this.x, this.y, this.z);
        this.mesh.rotation.y = this.yaw;
        this.mesh.userData = { mob: this };
        scene.add(this.mesh);
    }
    
    getBaseColor() {
        switch(this.type) {
            case 'cow': return 0x4a3728;
            case 'sheep': return 0xe8e8e8;
            case 'pig': return 0xff9999;
            case 'chicken': return 0xffffff;
            case 'zombie': return 0x2d4c1e;
            default: return 0xffffff;
        }
    }
    
    takeDamage(damage, attacker) {
        if (this.dead || this.hitCooldown > 0) return;
        
        this.health -= damage;
        this.hitCooldown = 0.5;
        this.flashTime = 0.2;
        
        this.setFlashColor(0xff0000);
        
        this.showDamageNumber(damage);
        
        if (this.type === 'zombie' && attacker) {
            this.state = 'chase';
            this.targetYaw = Math.atan2(attacker.x - this.x, attacker.z - this.z);
        } else {
            this.state = 'flee';
            if (attacker) {
                const dx = this.x - attacker.x;
                const dz = this.z - attacker.z;
                this.targetYaw = Math.atan2(dx, dz);
            }
        }
        this.walkSpeed = this.type === 'zombie' ? 3.5 : 4;
        
        if (this.health <= 0) {
            this.die();
        }
    }
    
    setFlashColor(color) {
        this.mesh.traverse(child => {
            if (child.isMesh && child.material) {
                child.userData.originalColor = child.material.color.getHex();
                child.material = child.material.clone();
                child.material.color.setHex(color);
            }
        });
    }
    
    restoreColor() {
        this.mesh.traverse(child => {
            if (child.isMesh && child.material && child.userData.originalColor !== undefined) {
                child.material.color.setHex(child.userData.originalColor);
            }
        });
    }
    
    showDamageNumber(damage) {
        const indicator = document.createElement('div');
        indicator.className = 'damage-indicator';
        indicator.textContent = Math.floor(damage);
        
        const vector = new THREE.Vector3(this.x, this.y + this.height + 0.5, this.z);
        vector.project(camera);
        
        const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
        const y = (-(vector.y * 0.5) + 0.5) * window.innerHeight;
        
        indicator.style.left = x + 'px';
        indicator.style.top = y + 'px';
        
        document.body.appendChild(indicator);
        setTimeout(() => indicator.remove(), 1000);
    }
    
    die() {
        this.dead = true;
        
        this.setFlashColor(0x550000);
        
        this.dropLoot();
        
        // 3秒后移除尸体
        setTimeout(() => {
            this.remove();
            // 从mobs数组中移除
            const index = mobs.indexOf(this);
            if (index > -1) {
                mobs.splice(index, 1);
            }
        }, 3000);
    }
    
    dropLoot() {
        if (this.type === 'zombie') {
            spawnDrop(4, this.x, this.y, this.z);
        } else if (this.type === 'cow') {
            spawnDrop(42, this.x, this.y, this.z);
        } else if (this.type === 'pig') {
            spawnDrop(600, this.x, this.y, this.z); // 生猪排
        } else if (this.type === 'chicken') {
            spawnDrop(37, this.x, this.y, this.z);
        } else if (this.type === 'sheep') {
            spawnDrop(35, this.x, this.y, this.z); // 羊毛
        }
    }
    
    update(dt, player) {
        if (this.dead) {
            this.mesh.rotation.x = Math.min(this.mesh.rotation.x + dt * 2, Math.PI / 2);
            this.mesh.position.y = Math.max(this.mesh.position.y - dt * 2, this.y - 0.5);
            return;
        }
        
        if (this.hitCooldown > 0) {
            this.hitCooldown -= dt;
            this.flashTime -= dt;
            
            if (this.flashTime <= 0 && this.flashTime > -0.1) {
                this.restoreColor();
            }
        }
        
        if (this.attackCooldown > 0) {
            this.attackCooldown -= dt;
        }
        
        this.stateTimer -= dt;
        this.animTime += dt;
        
        if (this.type === 'zombie') {
            const dx = player.x - this.x;
            const dz = player.z - this.z;
            const dist = Math.sqrt(dx*dx + dz*dz);
            
            if (dist < 20 && dist > 1.5) {
                this.state = 'chase';
                this.targetYaw = Math.atan2(dx, dz);
                this.walkSpeed = 2.5;
            } else if (dist <= 1.5 && this.attackCooldown <= 0) {
                if (isSurvival && survivalStats && !survivalStats.isDead) {
                    takeDamage(3, 'zombie');
                    this.attackCooldown = 1.0;
                }
            } else if (dist >= 20) {
                if (this.stateTimer <= 0) {
                    this.stateTimer = 2 + Math.random() * 3;
                    this.state = Math.random() < 0.6 ? 'idle' : 'walk';
                    if (this.state === 'walk') {
                        this.targetYaw = Math.random() * Math.PI * 2;
                    }
                }
            }
        } else {
            if (this.stateTimer <= 0 && this.state !== 'flee') {
                this.stateTimer = 2 + Math.random() * 3;
                const r = Math.random();
                if (r < 0.6) {
                    this.state = 'idle';
                    this.vx = 0;
                    this.vz = 0;
                } else {
                    this.state = 'walk';
                    this.targetYaw = Math.random() * Math.PI * 2;
                }
            }
            
            const dx = this.x - player.x;
            const dz = this.z - player.z;
            const dist = Math.sqrt(dx*dx + dz*dz);
            
            if (dist < 3 && this.state !== 'flee') {
                this.state = 'flee';
                this.targetYaw = Math.atan2(dx, dz);
                this.walkSpeed = 4;
            } else if (this.state === 'flee' && dist > 8) {
                this.state = 'idle';
                this.walkSpeed = this.type === 'chicken' ? 2 : 1;
            }
        }
        
        let yawDiff = this.targetYaw - this.yaw;
        while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
        while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
        this.yaw += yawDiff * 5 * dt;
        
        if (this.state !== 'idle') {
            const speed = this.walkSpeed;
            this.vx = Math.sin(this.yaw) * speed;
            this.vz = Math.cos(this.yaw) * speed;
            
            this.avoidObstacles(dt);
        }
        
        const newX = this.x + this.vx * dt;
        const newZ = this.z + this.vz * dt;
        
        if (!this.checkCollision(newX, this.y, this.z)) this.x = newX;
        if (!this.checkCollision(this.x, this.y, newZ)) this.z = newZ;
        
        if (!this.onGround()) {
            this.y -= 20 * dt;
        } else {
            const groundY = this.getGroundY();
            if (groundY !== null) this.y = groundY;
        }
        
        this.mesh.position.set(this.x, this.y, this.z);
        this.mesh.rotation.y = -this.yaw + Math.PI;
        
        if (this.state !== 'idle') {
            const legSpeed = this.type === 'chicken' ? 15 : (this.type === 'zombie' ? 12 : 10);
            for (let i = 0; i < this.legs.length; i++) {
                const offset = i < 2 ? 0 : Math.PI;
                this.legs[i].rotation.x = Math.sin(this.animTime * legSpeed + offset) * 0.5;
            }
            
            if (this.type === 'zombie' && this.arms) {
                for (let i = 0; i < this.arms.length; i++) {
                    const offset = i === 0 ? 0 : Math.PI;
                    this.arms[i].rotation.x = Math.sin(this.animTime * 12 + offset) * 0.8;
                }
            }
        } else {
            for (let leg of this.legs) leg.rotation.x = 0;
            if (this.arms) {
                for (let arm of this.arms) arm.rotation.x = 0;
            }
        }
    }
    
    avoidObstacles(dt) {
        const checkDist = 1.5;
        const checkX = this.x + Math.sin(this.yaw) * checkDist;
        const checkZ = this.z + Math.cos(this.yaw) * checkDist;
        
        if (this.checkCollision(checkX, this.y, checkZ)) {
            const leftYaw = this.yaw + Math.PI / 4;
            const leftX = this.x + Math.sin(leftYaw) * checkDist;
            const leftZ = this.z + Math.cos(leftYaw) * checkDist;
            
            if (!this.checkCollision(leftX, this.y, leftZ)) {
                this.targetYaw = leftYaw;
            } else {
                this.targetYaw -= Math.PI / 4;
            }
        }
    }
    
    checkCollision(x, y, z) {
        const minX = Math.floor(x - this.width/2);
        const maxX = Math.ceil(x + this.width/2);
        const minY = Math.floor(y);
        const maxY = Math.ceil(y + this.height);
        const minZ = Math.floor(z - this.width/2);
        const maxZ = Math.ceil(z + this.width/2);
        
        for (let bx = minX; bx < maxX; bx++) {
            for (let by = minY; by < maxY; by++) {
                for (let bz = minZ; bz < maxZ; bz++) {
                    const block = getBlock(bx, by, bz);
                    if (IsSolid[block] && !IsTransparent[block]) return true;
                }
            }
        }
        return false;
    }
    
    onGround() {
        const groundY = this.getGroundY();
        return groundY !== null && Math.abs(this.y - groundY) < 0.1;
    }
    
    getGroundY() {
        for (let y = Math.floor(this.y + this.height); y >= Math.floor(this.y) - 5; y--) {
            const block = getBlock(this.x, y, this.z);
            if (IsSolid[block] && !IsTransparent[block]) {
                return y + 1;
            }
        }
        return null;
    }
    
    remove() {
        scene.remove(this.mesh);
    }
}

const mobs = [];
const MAX_MOBS = 15;
const MAX_PASSIVE_MOBS = 10;
const MAX_ZOMBIES = 5;
const MOB_SPAWN_RADIUS = 40;
const MOB_DESPAWN_RADIUS = 60;

function updateMobs(dt, player) {
    const passiveMobs = mobs.filter(m => !m.dead && m.type !== 'zombie').length;
    const zombies = mobs.filter(m => !m.dead && m.type === 'zombie').length;
    
    if (passiveMobs < MAX_PASSIVE_MOBS && Math.random() < 0.02) {
        spawnMob('passive');
    }
    
    if (!isDay && zombies < MAX_ZOMBIES && Math.random() < 0.03) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 15 + Math.random() * 25;
        const x = player.x + Math.sin(angle) * dist;
        const z = player.z + Math.cos(angle) * dist;
        
        if (!isNearTorch(x, player.y, z, 12)) {
            spawnMob('zombie');
        }
    }
    
    for (let i = mobs.length - 1; i >= 0; i--) {
        const mob = mobs[i];
        mob.update(dt, player);
        
        const dx = mob.x - player.x;
        const dz = mob.z - player.z;
        const dist = Math.sqrt(dx*dx + dz*dz);
        
        // 距离太远或已死亡且尸体已移除的生物，从数组中删除
        if (dist > MOB_DESPAWN_RADIUS) {
            mob.remove();
            mobs.splice(i, 1);
        }
        // 死亡生物会在die()的setTimeout中自动从数组移除
    }
    
    document.getElementById('d-mobs').textContent = mobs.filter(m => !m.dead).length;
}

function spawnMob(type) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 15 + Math.random() * 25;
    const x = player.x + Math.sin(angle) * dist;
    const z = player.z + Math.cos(angle) * dist;
    
    let mobType;
    if (type === 'zombie') {
        mobType = 'zombie';
    } else {
        const biome = getBiomeAt(x, z);
        if (biome === 'desert') {
            mobType = Math.random() < 0.5 ? 'pig' : 'chicken';
        } else if (biome === 'snow') {
            mobType = 'sheep';
        } else {
            const r = Math.random();
            if (r < 0.25) mobType = 'cow';
            else if (r < 0.5) mobType = 'sheep';
            else if (r < 0.75) mobType = 'pig';
            else mobType = 'chicken';
        }
    }
    
    let y = 100;
    for (; y > 0; y--) {
        const block = getBlock(x, y, z);
        if (IsSolid[block] && !IsTransparent[block]) {
            y = y + 1;
            break;
        }
    }
    
    if (y > 0 && y < 120) {
        mobs.push(new Mob(mobType, x, y, z));
    }
}

function attackMob() {
    const ray = new THREE.Raycaster();
    const center = new THREE.Vector2(0,0);
    ray.setFromCamera(center, camera);
    
    const mobMeshes = [];
    mobs.forEach(mob => {
        if (!mob.dead) mobMeshes.push(mob.mesh);
    });
    
    const hits = ray.intersectObjects(mobMeshes, true);
    if (hits.length > 0 && hits[0].distance < 5) {
        let targetMesh = hits[0].object;
        while (targetMesh.parent && !targetMesh.userData.mob) {
            targetMesh = targetMesh.parent;
        }
        
        if (targetMesh.userData && targetMesh.userData.mob) {
            const mob = targetMesh.userData.mob;
            mob.takeDamage(3, player);
            
            const knockbackX = Math.sin(player.yaw) * 0.5;
            const knockbackZ = Math.cos(player.yaw) * 0.5;
            mob.x += knockbackX;
            mob.z += knockbackZ;
            
            return true;
        }
    }
    return false;
}

const player = { 
    x:0, y:90, z:0, 
    vx:0, vy:0, vz:0, 
    yaw:0, pitch:-0.3, 
    onGround:false, 
    height:1.8, 
    eyeHeight:1.6, 
    width:0.6, 
    spawned:false, 
    isCrouching:false,
    canFly: false,
    flying: false,
    speed: 4.3
};

const CHUNK_LOAD_RADIUS = 4;
const CHUNK_UNLOAD_RADIUS = 6;

function getPlayerChunk() {
    return { 
        x: Math.floor(player.x / CHUNK_SIZE), 
        z: Math.floor(player.z / CHUNK_SIZE) 
    };
}

function updateChunks() {
    const pc = getPlayerChunk();
    
    const toLoad = [];
    for (let dx = -CHUNK_LOAD_RADIUS; dx <= CHUNK_LOAD_RADIUS; dx++) {
        for (let dz = -CHUNK_LOAD_RADIUS; dz <= CHUNK_LOAD_RADIUS; dz++) {
            const dist = Math.sqrt(dx*dx + dz*dz);
            if (dist > CHUNK_LOAD_RADIUS) continue;
            const cx = pc.x + dx, cz = pc.z + dz;
            const key = `${cx},${cz}`;
            if (!chunks.has(key)) toLoad.push({cx, cz, dist, key});
        }
    }
    toLoad.sort((a, b) => a.dist - b.dist);
    
    if (toLoad.length > 0) {
        const {cx, cz, key} = toLoad[0];
        const chunk = new Chunk(cx, cz);
        chunks.set(key, chunk);
        renderQueue.add(chunk);
    }
    
    for (const [key, chunk] of chunks) {
        const [cx, cz] = key.split(',').map(Number);
        const dist = Math.sqrt((cx-pc.x)**2 + (cz-pc.z)**2);
        if (dist > CHUNK_UNLOAD_RADIUS) {
            chunk.unload();
            chunks.delete(key);
        }
    }
}

function processDirtyChunks() {
    if (renderQueue.size === 0) return;
    let processed = 0;
    const maxPerFrame = 2;
    
    for (const chunk of renderQueue) {
        if (!chunk.dirty) continue;
        chunk.build();
        processed++;
        if (processed >= maxPerFrame) break;
    }
    
    for (const chunk of Array.from(renderQueue)) {
        if (!chunk.dirty) renderQueue.delete(chunk);
    }
}

const PLAYER_WIDTH = 0.6;
const PLAYER_HEIGHT = 1.8;
const HALF_WIDTH = PLAYER_WIDTH / 2;
const GRAVITY = -28.0;
const JUMP_VEL = 9.0;
const MOVE_SPEED = 4.3;
const MAX_FALL_SPEED = 25.0;
const MAX_H_SPEED = 30.0;
const SUBSTEPS = 8;

function getPlayerAABB(x, y, z) {
    return {
        minX: x - HALF_WIDTH, maxX: x + HALF_WIDTH,
        minY: y,              maxY: y + player.height,
        minZ: z - HALF_WIDTH, maxZ: z + HALF_WIDTH
    };
}

function testAABBCollision(aabb) {
    const minX = Math.floor(aabb.minX);
    const maxX = Math.ceil(aabb.maxX);
    const minY = Math.floor(aabb.minY);
    const maxY = Math.ceil(aabb.maxY);
    const minZ = Math.floor(aabb.minZ);
    const maxZ = Math.ceil(aabb.maxZ);

    for (let x = minX; x < maxX; x++) {
        for (let y = minY; y < maxY; y++) {
            for (let z = minZ; z < maxZ; z++) {
                const block = getBlock(x, y, z);
                if (IsSolid[block] && !IsTransparent[block]) {
                    return { hit: true, x, y, z };
                }
            }
        }
    }
    return { hit: false };
}

function getGroundDistance(x, y, z) {
    const startY = Math.floor(y);
    const endY = Math.max(0, startY - 5);
    
    for (let checkY = startY; checkY >= endY; checkY--) {
        const block = getBlock(Math.floor(x), checkY, Math.floor(z));
        if (IsSolid[block] && !IsTransparent[block]) {
            const groundTop = checkY + 1;
            const playerFeet = y;
            return playerFeet - groundTop;
        }
    }
    return null;
}

// 碰撞缓存，减少重复碰撞检测
const _collisionCache = new Map();
let _collisionCacheFrame = 0;

function clearCollisionCache() {
    _collisionCache.clear();
}

function updatePhysics(dt) {
    if (!player.spawned) return;

    // 使用玩家自定义速度（如果设置了）
    let speed = player.speed || MOVE_SPEED;
    if (player.isCrouching) speed *= 0.3;

    let dx = 0, dz = 0;
    if (joystick.active) {
        const fwd = -joystick.dy;
        const strafe = joystick.dx;
        const cos = Math.cos(player.yaw);
        const sin = Math.sin(player.yaw);
        dx = (cos * strafe - sin * fwd) * speed;
        dz = (-sin * strafe - cos * fwd) * speed;
    }

    // 飞行模式下不应用重力
    if (player.flying) {
        player.vy = 0;
        // 飞行模式下可以垂直移动
        if (window.keys && window.keys[' ']) player.vy = speed * 0.8; // 空格上升
        else if (window.keys && window.keys['Shift']) player.vy = -speed * 0.8; // Shift下降
    } else {
        player.vy += GRAVITY * dt;
    }
    if (player.vy < -MAX_FALL_SPEED) player.vy = -MAX_FALL_SPEED;
    if (Math.abs(player.vx) > MAX_H_SPEED) player.vx = Math.sign(player.vx) * MAX_H_SPEED;
    if (Math.abs(player.vz) > MAX_H_SPEED) player.vz = Math.sign(player.vz) * MAX_H_SPEED;

    const totalVx = dx + player.vx;
    const totalVy = player.vy;
    const totalVz = dz + player.vz;

    const maxMoveDist = Math.max(Math.abs(totalVx), Math.abs(totalVy), Math.abs(totalVz)) * dt;
    const dynamicSubsteps = Math.max(SUBSTEPS, Math.ceil(maxMoveDist / 0.5));
    const stepDt = dt / dynamicSubsteps;

    player.onGround = false;

    for (let step = 0; step < dynamicSubsteps; step++) {
        const stepVx = totalVx * stepDt;
        const nextX = player.x + stepVx;
        const collideX = testAABBCollision(getPlayerAABB(nextX, player.y, player.z));

        if (collideX.hit) {
            player.vx = 0;
            if (stepVx > 0) player.x = collideX.x - HALF_WIDTH - 0.001;
            else if (stepVx < 0) player.x = collideX.x + 1 + HALF_WIDTH + 0.001;
        } else {
            player.x = nextX;
        }

        const stepVz = totalVz * stepDt;
        const nextZ = player.z + stepVz;
        const collideZ = testAABBCollision(getPlayerAABB(player.x, player.y, nextZ));

        if (collideZ.hit) {
            player.vz = 0;
            if (stepVz > 0) player.z = collideZ.z - HALF_WIDTH - 0.001;
            else if (stepVz < 0) player.z = collideZ.z + 1 + HALF_WIDTH + 0.001;
        } else {
            player.z = nextZ;
        }

        if (totalVy <= 0) {
            const groundDist = getGroundDistance(player.x, player.y, player.z);
            if (groundDist !== null && groundDist < 0.5 && groundDist > -0.1) {
                player.y -= groundDist;
                player.onGround = true;
                player.vy = 0;
                continue;
            }
        }

        const stepVy = totalVy * stepDt;
        const nextY = player.y + stepVy;
        const collideY = testAABBCollision(getPlayerAABB(player.x, nextY, player.z));

        if (collideY.hit) {
            if (totalVy < 0) {
                player.onGround = true;
                player.vy = 0;
                player.y = collideY.y + 1;
            } else if (totalVy > 0) {
                player.vy = 0;
                player.y = collideY.y - player.height - 0.001;
            }
        } else {
            player.y = nextY;
        }
    }

    const finalCheck = testAABBCollision(getPlayerAABB(player.x, player.y, player.z));
    if (finalCheck.hit) {
        player.y = finalCheck.y + player.height + 0.001;
        player.vy = 0;
        player.onGround = true;
    }

    player.vx *= 0.98;
    player.vz *= 0.98;

    if (player.y < -50) respawn();
}

function respawn() {
    player.x = 0; 
    player.z = 0;
    player.vy = 0;
    for (let y = 100; y > 0; y--) {
        if (IsSolid[getBlock(0,y,0)] && !IsTransparent[getBlock(0,y,0)]) {
            player.y = y + 2;
            return;
        }
    }
    player.y = 80;
}

// ==================== 熔炉交互系统 ====================
let nearFurnace = null; // 当前靠近的熔炉位置
let furnaceUIOpen = false;
let furnaceState = {
    input: null,    // { id: blockId, count: count }
    fuel: null,     // { id: blockId, count: count }
    output: null,   // { id: blockId, count: count }
    progress: 0,    // 0-100
    isCooking: false
};

// 检测附近是否有熔炉
function checkNearbyBlocks() {
    if (furnaceUIOpen) return; // UI打开时不检测
    
    const px = Math.floor(player.x);
    const py = Math.floor(player.y);
    const pz = Math.floor(player.z);
    const range = 2; // 检测范围
    
    let foundFurnace = null;
    
    for (let dx = -range; dx <= range; dx++) {
        for (let dy = -range; dy <= range; dy++) {
            for (let dz = -range; dz <= range; dz++) {
                const x = px + dx;
                const y = py + dy;
                const z = pz + dz;
                const blockId = getBlock(x, y, z);
                
                if (blockId === 501) { // 熔炉ID
                    foundFurnace = { x, y, z };
                }
            }
        }
    }
    
    nearFurnace = foundFurnace;
    
    // 更新熔炉按钮显示
    const furnaceBtn = document.getElementById('furnace-interact-btn');
    if (nearFurnace) {
        furnaceBtn.style.display = 'block';
    } else {
        furnaceBtn.style.display = 'none';
    }
}

// 打开熔炉界面
function openFurnaceUI() {
    if (!nearFurnace) return;
    
    furnaceUIOpen = true;
    document.getElementById('furnace-ui').style.display = 'flex';
    document.getElementById('furnace-interact-btn').style.display = 'none';
    
    // 暂停玩家控制
    if (player) player.controlsEnabled = false;
    
    // 更新熔炉界面
    updateFurnaceUI();
    renderFurnaceInventory();
}

// 关闭熔炉界面
function closeFurnaceUI() {
    furnaceUIOpen = false;
    document.getElementById('furnace-ui').style.display = 'none';
    
    // 恢复玩家控制
    if (player) player.controlsEnabled = true;
    
    // 重新检测附近方块
    checkNearbyBlocks();
}

// 渲染熔炉背包 - 显示更多物品格子
function renderFurnaceInventory() {
    const grid = document.getElementById('furnace-inventory-grid');
    grid.innerHTML = '';
    
    // 收集所有可用的物品（包括快捷栏和已知的方块）
    const availableItems = [];
    
    // 添加快捷栏物品
    for (let i = 0; i < 9; i++) {
        if (hotbar[i] !== 0) {
            const existing = availableItems.find(item => item.id === hotbar[i]);
            if (existing) {
                existing.count += hotbarCount[i];
            } else {
                availableItems.push({ id: hotbar[i], count: hotbarCount[i] });
            }
        }
    }
    
    // 添加常用燃料和可熔炼物品（创造模式显示所有）
    if (!isSurvival) {
        // 创造模式：显示所有可熔炼物品和燃料
        const smeltableItems = [4, 15, 14, 56, 130, 129]; // 圆石、铁矿石、金矿石、钻石矿石、青金石矿石、绿宝石矿石
        const fuelItems = [263, 5, 17, 18, 327, 369, 289, 385]; // 煤炭、木板、原木、白桦木、熔岩桶、烈焰棒、火药、烈焰粉
        
        [...smeltableItems, ...fuelItems].forEach(id => {
            if (!availableItems.find(item => item.id === id)) {
                availableItems.push({ id: id, count: isSurvival ? 0 : 64 });
            }
        });
    }
    
    // 渲染物品格子（最多显示27个）
    const maxSlots = Math.min(availableItems.length, 27);
    for (let i = 0; i < maxSlots; i++) {
        const item = availableItems[i];
        const def = BlockDefs[item.id];
        const slot = document.createElement('div');
        slot.className = 'furnace-inv-slot';
        
        // 使用 ccvaults.com 的图片源
        let tex = '';
        if (def) {
            if (def.isItem) {
                tex = `https://ccvaults.com/images/items/${def.tex}.png`;
            } else {
                tex = `https://ccvaults.com/images/blocks/${def.tex}.png`;
            }
        }
        
        slot.innerHTML = `
            <img src="${tex}" alt="${def ? def.name : ''}" onerror="this.onerror=null; this.src='${def ? (def.isItem ? BASE_URL + 'items/' + def.tex + '.png' : BASE_URL + 'blocks/' + def.tex + '.png') : ''}'">
            <span class="slot-count">${isSurvival ? item.count : '∞'}</span>
        `;
        slot.onclick = () => putItemToFurnaceById(item.id);
        
        grid.appendChild(slot);
    }
}

// 通过物品ID放入熔炉
function putItemToFurnaceById(itemId) {
    // 检查物品类型
    if (canSmelt(itemId)) {
        // 可熔炼物品 -> 放入原料槽
        if (!furnaceState.input) {
            furnaceState.input = { id: itemId, count: 0 };
        }
        if (furnaceState.input.id === itemId) {
            furnaceState.input.count++;
            // 创造模式不消耗背包物品
            if (isSurvival) {
                for (let i = 0; i < 9; i++) {
                    if (hotbar[i] === itemId && hotbarCount[i] > 0) {
                        hotbarCount[i]--;
                        if (hotbarCount[i] <= 0) hotbar[i] = 0;
                        break;
                    }
                }
                updateHotbar();
            }
            updateFurnaceUI();
            renderFurnaceInventory();
            startSmelting();
        }
    } else if (isFuel(itemId)) {
        // 燃料 -> 放入燃料槽
        if (!furnaceState.fuel) {
            furnaceState.fuel = { id: itemId, count: 0 };
        }
        if (furnaceState.fuel.id === itemId) {
            furnaceState.fuel.count++;
            // 创造模式不消耗背包物品
            if (isSurvival) {
                for (let i = 0; i < 9; i++) {
                    if (hotbar[i] === itemId && hotbarCount[i] > 0) {
                        hotbarCount[i]--;
                        if (hotbarCount[i] <= 0) hotbar[i] = 0;
                        break;
                    }
                }
                updateHotbar();
            }
            updateFurnaceUI();
            renderFurnaceInventory();
            startSmelting();
        }
    }
}

// 将背包物品放入熔炉
function putItemToFurnace(slotIndex) {
    const itemId = hotbar[slotIndex];
    const count = hotbarCount[slotIndex];
    
    if (itemId === 0 || count <= 0) return;
    
    // 检查物品类型
    if (canSmelt(itemId)) {
        // 可熔炼物品 -> 放入原料槽
        if (!furnaceState.input) {
            furnaceState.input = { id: itemId, count: 0 };
        }
        if (furnaceState.input.id === itemId) {
            furnaceState.input.count++;
            hotbarCount[slotIndex]--;
            if (hotbarCount[slotIndex] <= 0) {
                hotbar[slotIndex] = 0;
            }
            updateHotbar();
            updateFurnaceUI();
            renderFurnaceInventory();
            startSmelting();
        }
    } else if (isFuel(itemId)) {
        // 燃料 -> 放入燃料槽
        if (!furnaceState.fuel) {
            furnaceState.fuel = { id: itemId, count: 0 };
        }
        if (furnaceState.fuel.id === itemId) {
            furnaceState.fuel.count++;
            hotbarCount[slotIndex]--;
            if (hotbarCount[slotIndex] <= 0) {
                hotbar[slotIndex] = 0;
            }
            updateHotbar();
            updateFurnaceUI();
            renderFurnaceInventory();
            startSmelting();
        }
    }
}

// 点击熔炉槽位
function clickFurnaceSlot(slot) {
    if (slot === 'output') {
        // 取出产物
        if (furnaceState.output) {
            // 尝试放入背包
            for (let i = 0; i < 9; i++) {
                if (hotbar[i] === 0) {
                    hotbar[i] = furnaceState.output.id;
                    hotbarCount[i] = furnaceState.output.count;
                    furnaceState.output = null;
                    updateHotbar();
                    updateFurnaceUI();
                    renderFurnaceInventory();
                    return;
                } else if (hotbar[i] === furnaceState.output.id) {
                    hotbarCount[i] += furnaceState.output.count;
                    furnaceState.output = null;
                    updateHotbar();
                    updateFurnaceUI();
                    renderFurnaceInventory();
                    return;
                }
            }
            alert('背包已满！');
        }
    }
    // 原料和燃料槽点击不执行操作（通过背包放入）
}

// 获取物品图片URL（优先使用ccvaults.com）
function getItemImageUrl(itemId, isItem = false) {
    const def = BlockDefs[itemId];
    if (!def) return '';
    
    // 尝试使用ccvaults.com的图片
    const ccvaultsBase = 'https://ccvaults.com/images';
    if (def.isItem || isItem) {
        return `${ccvaultsBase}/items/${def.tex}.png`;
    } else if (def.faces) {
        return `${ccvaultsBase}/blocks/${def.faces[2] || def.tex}.png`;
    } else {
        return `${ccvaultsBase}/blocks/${def.tex}.png`;
    }
}

// 更新熔炉界面显示
function updateFurnaceUI() {
    // 更新原料槽
    const inputContent = document.getElementById('furnace-input-content');
    if (furnaceState.input) {
        const def = BlockDefs[furnaceState.input.id];
        const tex = getItemImageUrl(furnaceState.input.id);
        const fallbackTex = def ? (def.isItem ? BASE_URL + 'items/' + def.tex + '.png' : BASE_URL + 'blocks/' + def.tex + '.png') : '';
        inputContent.innerHTML = `
            <img src="${tex}" style="width: 48px; height: 48px; object-fit: contain;" onerror="this.onerror=null; this.src='${fallbackTex}'">
            <span class="slot-count" style="position: absolute; bottom: 2px; right: 4px; font-size: 14px; color: #fff; text-shadow: 1px 1px 0 #000; font-weight: bold;">${furnaceState.input.count}</span>
        `;
        inputContent.style.position = 'relative';
    } else {
        inputContent.innerHTML = '';
    }
    
    // 更新燃料槽
    const fuelContent = document.getElementById('furnace-fuel-content');
    if (furnaceState.fuel) {
        const def = BlockDefs[furnaceState.fuel.id];
        const tex = getItemImageUrl(furnaceState.fuel.id, true);
        const fallbackTex = def ? (def.isItem ? BASE_URL + 'items/' + def.tex + '.png' : BASE_URL + 'blocks/' + def.tex + '.png') : '';
        fuelContent.innerHTML = `
            <img src="${tex}" style="width: 48px; height: 48px; object-fit: contain;" onerror="this.onerror=null; this.src='${fallbackTex}'">
            <span class="slot-count" style="position: absolute; bottom: 2px; right: 4px; font-size: 14px; color: #fff; text-shadow: 1px 1px 0 #000; font-weight: bold;">${furnaceState.fuel.count}</span>
        `;
        fuelContent.style.position = 'relative';
    } else {
        fuelContent.innerHTML = '';
    }
    
    // 更新产物槽
    const outputContent = document.getElementById('furnace-output-content');
    if (furnaceState.output) {
        const def = BlockDefs[furnaceState.output.id];
        const tex = getItemImageUrl(furnaceState.output.id, true);
        const fallbackTex = def ? (def.isItem ? BASE_URL + 'items/' + def.tex + '.png' : BASE_URL + 'blocks/' + def.tex + '.png') : '';
        outputContent.innerHTML = `
            <img src="${tex}" style="width: 48px; height: 48px; object-fit: contain;" onerror="this.onerror=null; this.src='${fallbackTex}'">
            <span class="slot-count" style="position: absolute; bottom: 2px; right: 4px; font-size: 14px; color: #fff; text-shadow: 1px 1px 0 #000; font-weight: bold;">${furnaceState.output.count}</span>
        `;
        outputContent.style.position = 'relative';
    } else {
        outputContent.innerHTML = '';
    }
    
    // 更新进度条
    document.getElementById('furnace-progress-bar').style.width = furnaceState.progress + '%';
}

// 检查物品是否可以熔炼
function canSmelt(itemId) {
    // 可熔炼物品列表：圆石->石头，各类矿石->对应矿锭
    const smeltableItems = [4, 15, 14, 56, 130, 129];
    return smeltableItems.includes(itemId);
}

// 检查物品是否是燃料
function isFuel(itemId) {
    // 燃料列表
    const fuelItems = [5, 17, 18, 263]; // 木板, 原木, 煤炭等
    return fuelItems.includes(itemId);
}

// 获取熔炼产物
function getSmeltResult(itemId) {
    const results = {
        4: 1,    // 圆石 -> 石头
        15: 265, // 铁矿石 -> 铁锭
        14: 266, // 金矿石 -> 金锭
        56: 264, // 钻石矿石 -> 钻石
        130: 351,// 青金石矿石 -> 青金石
        129: 388 // 绿宝石矿石 -> 绿宝石
    };
    return results[itemId] || null;
}

// 更新熔炉状态（每帧调用）
function updateFurnace(dt) {
    if (!furnaceState.isCooking) return;
    
    if (furnaceState.input && furnaceState.fuel) {
        furnaceState.progress += dt * 10; // 每秒增加10%
        
        if (furnaceState.progress >= 100) {
            furnaceState.progress = 0;
            
            // 完成熔炼
            const resultId = getSmeltResult(furnaceState.input.id);
            if (resultId) {
                if (!furnaceState.output) {
                    furnaceState.output = { id: resultId, count: 0 };
                }
                furnaceState.output.count++;
                
                // 消耗原料
                furnaceState.input.count--;
                if (furnaceState.input.count <= 0) {
                    furnaceState.input = null;
                }
                
                // 消耗燃料
                furnaceState.fuel.count--;
                if (furnaceState.fuel.count <= 0) {
                    furnaceState.fuel = null;
                    furnaceState.isCooking = false;
                }
            }
            
            if (furnaceUIOpen) {
                updateFurnaceUI();
            }
        }
    } else {
        furnaceState.isCooking = false;
        furnaceState.progress = 0;
    }
}

// 开始熔炼
function startSmelting() {
    if (furnaceState.input && furnaceState.fuel && !furnaceState.isCooking) {
        furnaceState.isCooking = true;
    }
}

const joystick = { active:false, dx:0, dy:0 };

function setupInput() {
    const left = document.getElementById('left-stick');
    const knob = document.getElementById('knob-left');
    let tid = null;
    
    left.addEventListener('touchstart', e => {
        e.preventDefault();
        const t = e.changedTouches[0];
        tid = t.identifier;
        joystick.active = true;
        updateJoy(t.clientX, t.clientY);
    }, {passive:false});
    
    document.addEventListener('touchmove', e => {
        for (let t of e.changedTouches) {
            if (t.identifier === tid) updateJoy(t.clientX, t.clientY);
        }
    }, {passive:false});
    
    document.addEventListener('touchend', e => {
        for (let t of e.changedTouches) {
            if (t.identifier === tid) {
                joystick.active = false;
                joystick.dx = joystick.dy = 0;
                knob.style.transform = 'translate(-50%,-50%)';
                tid = null;
            }
        }
    });
    
    function updateJoy(cx, cy) {
        const rect = left.getBoundingClientRect();
        const x = cx - (rect.left + rect.width/2);
        const y = cy - (rect.top + rect.height/2);
        const dist = Math.sqrt(x*x + y*y);
        const max = 35, scl = dist > max ? max/dist : 1;
        knob.style.transform = `translate(calc(-50% + ${x*scl}px), calc(-50% + ${y*scl}px))`;
        joystick.dx = (x*scl)/max;
        joystick.dy = (y*scl)/max;
    }
    
    // 右半屏幕滑动 = 移动视角（不再局限于右下角圆圈）
    const viewport = document.getElementById('viewport');
    let rtid = null, rlx, rly;
    
    viewport.addEventListener('touchstart', e => {
        for (let t of e.changedTouches) {
            // 只接管右半屏幕、且未被按钮/摇杆占用的触摸
            if (rtid !== null) continue;
            if (t.clientX < window.innerWidth / 2) continue;
            if (t.target.closest('.control-btn, .stick, button, .hotbar-container, .ui-panel, .furnace-interact-btn')) continue;
            rtid = t.identifier;
            rlx = t.clientX;
            rly = t.clientY;
        }
    }, {passive:true});
    
    document.addEventListener('touchmove', e => {
        for (let t of e.changedTouches) {
            if (t.identifier === rtid) {
                const dx = (t.clientX - rlx) * 0.006;
                const dy = (t.clientY - rly) * 0.006;
                player.yaw -= dx;
                player.pitch -= dy;
                player.pitch = Math.max(-Math.PI/2+0.1, Math.min(Math.PI/2-0.1, player.pitch));
                rlx = t.clientX; 
                rly = t.clientY;
            }
        }
    }, {passive:false});
    
    document.addEventListener('touchend', e => {
        for (let t of e.changedTouches) if (t.identifier === rtid) rtid = null;
    });
    
    // 键盘控制（用于飞行模式）
    const keys = {};
    document.addEventListener('keydown', e => {
        keys[e.key] = true;
        // 按T键打开命令控制台（允许作弊时）
        if (e.key === 't' || e.key === 'T') {
            if (allowCheats && !commandConsoleOpen) {
                e.preventDefault();
                openCommandConsole();
            }
        }
        // ESC关闭命令控制台
        if (e.key === 'Escape' && commandConsoleOpen) {
            closeCommandConsole();
        }
    });
    document.addEventListener('keyup', e => {
        keys[e.key] = false;
    });
    window.keys = keys; // 全局访问
    
    document.getElementById('btn-jump').addEventListener('touchstart', e => {
        e.preventDefault();
        if (player.flying) {
            // 飞行模式下上升
            player.vy = (player.speed || MOVE_SPEED) * 0.8;
        } else if (player.onGround) {
            player.vy = JUMP_VEL;
            player.onGround = false;
        }
    }, {passive:false});

    document.getElementById('btn-crouch').addEventListener('touchstart', e => {
        e.preventDefault();
        player.isCrouching = true; 
        player.height = 1.4;
        player.eyeHeight = 1.2;
    }, {passive:false});

    document.getElementById('btn-crouch').addEventListener('touchend', e => {
        e.preventDefault();
        player.isCrouching = false; 
        player.height = 1.8; 
        player.eyeHeight = 1.6;
    });
    
    const ray = new THREE.Raycaster();
    const center = new THREE.Vector2(0,0);
    
    function getRay() {
        ray.setFromCamera(center, camera);
        const hits = [];
        chunks.forEach(c => c.meshes.forEach(m => hits.push(m)));
        const hit = ray.intersectObjects(hits)[0];
        if (hit && hit.distance < 6) {
            const p = hit.point, n = hit.face.normal;
            const epsilon = 0.001;
            return {
                break: { 
                    x: Math.floor(p.x - n.x*epsilon), 
                    y: Math.floor(p.y - n.y*epsilon), 
                    z: Math.floor(p.z - n.z*epsilon) 
                },
                place: { 
                    x: Math.floor(p.x + n.x*epsilon), 
                    y: Math.floor(p.y + n.y*epsilon), 
                    z: Math.floor(p.z + n.z*epsilon) 
                }
            };
        }
        return null;
    }
    window.getRay = getRay;
    
    document.getElementById('btn-break').addEventListener('touchstart', e => {
        e.preventDefault();
        
        if (attackMob()) {
            return;
        }
        
        const r = getRay();
        if (r) {
            if (isSurvival) {
                startMining(r.break.x, r.break.y, r.break.z);
            } else {
                setBlock(r.break.x, r.break.y, r.break.z, 0);
            }
        }
    }, {passive:false});
    
    document.getElementById('btn-break').addEventListener('touchend', e => {
        e.preventDefault();
        if (isSurvival) {
            cancelMining();
        }
    });
    
    // 放置按钮长按检测（用于吃食物）
    let placeLongPressTimer = null;
    let isLongPress = false;
    const LONG_PRESS_TIME = 400; // 长按时间阈值（毫秒）
    
    document.getElementById('btn-place').addEventListener('touchstart', e => {
        e.preventDefault();
        const blockId = hotbar[selected];
        
        // 如果手持食物，启动长按检测
        if (isFood(blockId) && (isSurvival || isMultiplayer)) {
            isLongPress = false;
            placeLongPressTimer = setTimeout(() => {
                isLongPress = true;
                // 长按触发吃食物
                eatFood(selected);
            }, LONG_PRESS_TIME);
        }
        // 注意：非食物情况不在touchstart放置，只在touchend放置，避免重复放置
    }, {passive:false});
    
    document.getElementById('btn-place').addEventListener('touchend', e => {
        e.preventDefault();
        if (placeLongPressTimer) {
            clearTimeout(placeLongPressTimer);
            placeLongPressTimer = null;
        }
        // 如果不是长按，执行放置
        if (!isLongPress) {
            const blockId = hotbar[selected];
            if (!isFood(blockId)) {
                placeBlock();
            }
        }
        isLongPress = false;
    });
    
    // 放置方块函数
    function placeBlock() {
        const r = getRay();
        if (r) {
            const p = r.place;
            if (Math.abs(p.x-player.x)>0.8 || Math.abs(p.z-player.z)>0.8 || p.y < player.y || p.y > player.y+player.height) {
                const blockId = hotbar[selected];
                if (blockId === 50) {
                    placeTorch(p.x, p.y, p.z);
                } else if (blockId === 701) {
                    // 打火石 - 点燃火焰
                    useFlintAndSteel();
                } else if (blockId !== 0 && !isFood(blockId)) {
                    setBlock(p.x, p.y, p.z, blockId);
                }
                
                // 创造模式不消耗物品
                if ((isSurvival || isMultiplayer) && hotbarCount[selected] > 0 && !isFood(blockId)) {
                    hotbarCount[selected]--;
                    if (hotbarCount[selected] <= 0) {
                        hotbar[selected] = 0;
                    }
                    updateHotbar();
                }
            }
        }
    }
    
    // 桌面端鼠标长按支持
    let mouseLongPressTimer = null;
    let isMouseLongPress = false;
    
    document.getElementById('btn-place').addEventListener('mousedown', e => {
        e.preventDefault();
        const blockId = hotbar[selected];
        
        // 如果手持食物，启动长按检测
        if (isFood(blockId) && (isSurvival || isMultiplayer)) {
            isMouseLongPress = false;
            mouseLongPressTimer = setTimeout(() => {
                isMouseLongPress = true;
                // 长按触发吃食物
                eatFood(selected);
            }, LONG_PRESS_TIME);
        }
    });
    
    document.getElementById('btn-place').addEventListener('mouseup', e => {
        e.preventDefault();
        if (mouseLongPressTimer) {
            clearTimeout(mouseLongPressTimer);
            mouseLongPressTimer = null;
        }
        // 如果不是长按，执行放置
        if (!isMouseLongPress) {
            const blockId = hotbar[selected];
            if (!isFood(blockId)) {
                placeBlock();
            }
        }
        isMouseLongPress = false;
    });
    
    document.getElementById('btn-place').addEventListener('mouseleave', e => {
        // 鼠标离开按钮时取消长按
        if (mouseLongPressTimer) {
            clearTimeout(mouseLongPressTimer);
            mouseLongPressTimer = null;
        }
        isMouseLongPress = false;
    });
}

function createBlockPreviewHTML(blockId) {
    const def = BlockDefs[blockId];
    if (!def || blockId === 0) return '<div style="width:24px;height:24px;background:rgba(255,255,255,0.05);"></div>';
    
    // 2D物品（如木棍、工具）显示平面图片
    if (def.isItem && def.tex) {
        const imgUrl = BASE_URL + 'items/' + def.tex + '.png';
        return `<img src="${imgUrl}" style="width:24px;height:24px;object-fit:contain;image-rendering:pixelated;" onerror="this.style.display='none'">`;
    }
    
    // 3D方块显示6面预览
    const faces = [];
    if (def.faces) {
        for (let i = 0; i < 6; i++) faces.push(BASE_URL + 'blocks/' + def.faces[i] + '.png');
    } else if (def.tex) {
        for (let i = 0; i < 6; i++) faces.push(BASE_URL + 'blocks/' + def.tex + '.png');
    } else {
        return '<div style="width:24px;height:24px;background:rgba(255,255,255,0.05);"></div>';
    }
    
    return `
        <div class="block-preview">
            <div class="block-face face-front" style="background-image: url('${faces[4]}'); background-size: cover;"></div>
            <div class="block-face face-back" style="background-image: url('${faces[5]}'); background-size: cover;"></div>
            <div class="block-face face-right" style="background-image: url('${faces[0]}'); background-size: cover;"></div>
            <div class="block-face face-left" style="background-image: url('${faces[1]}'); background-size: cover;"></div>
            <div class="block-face face-top" style="background-image: url('${faces[2]}'); background-size: cover;"></div>
            <div class="block-face face-bottom" style="background-image: url('${faces[3]}'); background-size: cover;"></div>
        </div>
    `;
}

function updateHotbar() {
    const hb = document.getElementById('hotbar');
    hb.innerHTML = '';
    hotbar.forEach((id, i) => {
        const d = document.createElement('div');
        d.className = 'slot ' + (i === selected ? 'active' : '');
        d.innerHTML = createBlockPreviewHTML(id);
        
        if (id !== 0) {
            const count = document.createElement('span');
            count.className = 'item-count';
            // 创造模式显示无限符号
            count.textContent = isSurvival ? hotbarCount[i] : '∞';
            d.appendChild(count);
        }
        
        d.onclick = () => { 
            selected = i; 
            updateHotbar(); 
        };
        hb.appendChild(d);
    });
}

function initInventory() {
    const grid = document.getElementById('inv-grid');
    grid.innerHTML = '';
    
    if (isSurvival) {
        const ownedBlocks = [];
        for (let i = 0; i < 9; i++) {
            if (hotbar[i] !== 0) {
                ownedBlocks.push({ id: hotbar[i], count: hotbarCount[i] });
            }
        }
        
        const uniqueBlocks = [];
        const seen = new Set();
        for (const item of ownedBlocks) {
            if (!seen.has(item.id)) {
                seen.add(item.id);
                uniqueBlocks.push(item);
            }
        }
        
        if (uniqueBlocks.length === 0) {
            grid.innerHTML = '<div style="color: #64748b; text-align: center; padding: 20px;">物品栏为空</div>';
            return;
        }
        
        uniqueBlocks.forEach(item => {
            const slot = document.createElement('div');
            slot.className = 'slot';
            slot.style.width = '52px';
            slot.style.height = '52px';
            slot.innerHTML = createBlockPreviewHTML(item.id);
            slot.title = BlockDefs[item.id].name + ' x' + item.count;
            slot.onclick = () => {
                hotbar[selected] = item.id;
                updateHotbar();
                toggleInventory();
            };
            grid.appendChild(slot);
        });
    } else {
        const allBlocks = Object.keys(BlockDefs).map(Number).filter(id => id !== 0);
        allBlocks.forEach(id => {
            const slot = document.createElement('div');
            slot.className = 'slot';
            slot.style.width = '52px';
            slot.style.height = '52px';
            slot.innerHTML = createBlockPreviewHTML(id);
            slot.title = BlockDefs[id].name;
            slot.onclick = () => {
                hotbar[selected] = id;
                updateHotbar();
                toggleInventory();
            };
            grid.appendChild(slot);
        });
    }
}

function toggleInventory() {
    const inv = document.getElementById('inventory');
    inv.style.display = inv.style.display === 'flex' ? 'none' : 'flex';
    if (inv.style.display === 'flex') {
        initInventory();
    }
}

function toggleFS() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
    } else {
        document.exitFullscreen();
    }
}

function initGame() {
    try {
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        
        camera.rotation.order = 'YXZ';
        
        if (AppleLighting.enabled) {
            // 苹果光照模组：PCF软阴影 + 双光源 + 色调映射
            AppleLighting.init();
        } else {
            scene.add(new THREE.AmbientLight(0xffffff, 0.6));
            const sun = new THREE.DirectionalLight(0xffffff, 0.8);
            sun.position.set(50, 100, 50);
            scene.add(sun);
            window.sunLight = sun;
        }
        Clouds.init();
        
        const hl = new THREE.LineSegments(
            new THREE.EdgesGeometry(new THREE.BoxGeometry(1.02, 1.02, 1.02)),
            new THREE.LineBasicMaterial({color: 0xffffff, transparent: true, opacity: 0.8})
        );
        scene.add(hl);
        window.hl = hl;
        
        const spawnCx = 0, spawnCz = 0;
        for (let dx = -CHUNK_LOAD_RADIUS; dx <= CHUNK_LOAD_RADIUS; dx++) {
            for (let dz = -CHUNK_LOAD_RADIUS; dz <= CHUNK_LOAD_RADIUS; dz++) {
                const dist = Math.sqrt(dx*dx + dz*dz);
                if (dist > CHUNK_LOAD_RADIUS) continue;
                const cx = spawnCx + dx, cz = spawnCz + dz;
                const key = `${cx},${cz}`;
                if (!chunks.has(key)) {
                    const chunk = new Chunk(cx, cz);
                    chunks.set(key, chunk);
                    renderQueue.add(chunk);
                }
            }
        }
        
        let safety = 0;
        while (renderQueue.size > 0 && safety < 1000) {
            for (const chunk of Array.from(renderQueue)) {
                if (chunk.dirty) chunk.build();
            }
            renderQueue.clear();
            safety++;
        }
        
        for (let y=90; y>0; y--) {
            if (IsSolid[getBlock(0,y,0)] && !IsTransparent[getBlock(0,y,0)]) {
                player.y = y + 1;
                player.spawned = true;
                player.onGround = true;
                break;
            }
        }
        setupInput();
        
        // 加载存档（如果有）
        if (shouldLoadSave && saveIdToLoad) {
            setTimeout(() => {
                loadWorld(saveIdToLoad);
            }, 100);
        }
        
        // 初始化Rose多人游戏连接
        if (isMultiplayer) {
            initRoseGameConnection();
        }
        
        window.addEventListener('resize', () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        });
        
        requestAnimationFrame(animate);
        
    } catch(e) {
        console.error('Init error:', e);
        document.getElementById('loading-text').textContent = '初始化错误: ' + e.message;
        document.getElementById('loading').style.display = 'flex';
        document.getElementById('loading').style.opacity = 1;
    }
}

let lastTime = 0;
let frameCount = 0;
let lastFpsTime = 0;
let uiTick = 0;
let _hudEls = null;
// HUD DOM 引用缓存：避免每帧重复 getElementById
function getHudEls() {
    if (!_hudEls) {
        const $ = id => document.getElementById(id);
        _hudEls = {
            fps: $('d-fps'), xyz: $('d-xyz'), chunk: $('s-chunk'),
            ground: $('d-ground'), biome: $('s-biome'),
            biomeDisplay: $('biome-display'), poly: $('s-poly')
        };
    }
    return _hudEls;
}

// ==================== 云朵系统 ====================
const Clouds = {
    group: null,
    mesh: null,
    dummy: null,
    list: [],
    CLOUD_Y: 118,
    SPEED: 2.2, // 格/秒，缓慢飘动

    init() {
        this.group = new THREE.Group();
        this.group.renderOrder = 5;
        const mat = new THREE.MeshLambertMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.72,
            depthWrite: false
        });
        const geo = new THREE.BoxGeometry(1, 1, 1);
        this.dummy = new THREE.Object3D();

        // 生成 28 朵随机云朵，每朵由 3-6 个扁平方块组成
        const rand = () => Math.random();
        for (let i = 0; i < 28; i++) {
            const cx = (rand() - 0.5) * 700;
            const cz = (rand() - 0.5) * 700;
            const puffs = 3 + Math.floor(rand() * 4);
            for (let j = 0; j < puffs; j++) {
                this.list.push({
                    x: cx + (rand() - 0.5) * 14,
                    y: this.CLOUD_Y + (rand() - 0.5) * 2,
                    z: cz + (rand() - 0.5) * 14,
                    sx: 8 + rand() * 16,
                    sy: 2.2 + rand() * 1.2,
                    sz: 6 + rand() * 10
                });
            }
        }

        this.mesh = new THREE.InstancedMesh(geo, mat, this.list.length);
        this.mesh.frustumCulled = false;
        this.group.add(this.mesh);
        scene.add(this.group);
        this.updateMatrices(0);
    },

    updateMatrices(dt) {
        const range = 750;
        for (let i = 0; i < this.list.length; i++) {
            const c = this.list[i];
            c.x += this.SPEED * dt;
            // 围绕玩家循环包裹，保证头顶始终有云
            if (c.x - player.x > range) c.x -= range * 2;
            else if (c.x - player.x < -range) c.x += range * 2;
            if (c.z - player.z > range) c.z -= range * 2;
            else if (c.z - player.z < -range) c.z += range * 2;
            this.dummy.position.set(c.x, c.y, c.z);
            this.dummy.scale.set(c.sx, c.sy, c.sz);
            this.dummy.updateMatrix();
            this.mesh.setMatrixAt(i, this.dummy.matrix);
        }
        this.mesh.instanceMatrix.needsUpdate = true;
    }
};

function animate(currentTime) {
    requestAnimationFrame(animate);
    
    const dt = Math.min((currentTime - lastTime) / 1000, 0.1);
    lastTime = currentTime;
    
    updateDayNightCycle(dt);
    if (Clouds.mesh) Clouds.updateMatrices(dt);
    updateSurvivalStats(dt);
    updateMining(dt);
    updateDroppedItems(dt);
    updateChunks();
    updateMobs(dt, player);
    updatePhysics(dt);
    
    // 熔炉检测和更新
    if (frameCount % 10 === 0) { // 每10帧检测一次附近方块
        checkNearbyBlocks();
    }
    updateFurnace(dt);
    
    const eyeHeight = player.isCrouching ? 1.2 : 1.6;
    camera.position.set(player.x, player.y + eyeHeight, player.z);
    camera.rotation.x = player.pitch;
    camera.rotation.y = player.yaw;
    
    // 多人游戏：同步玩家位置
    if (isMultiplayer && frameCount % 10 === 0) { // 每10帧发送一次位置
        sendPlayerPosition();
    }
    
    if (AppleLighting.enabled) {
        // 苹果光照模组：阴影相机跟随 + 群系光照自适应
        AppleLighting.update();
    } else if (window.sunLight) {
        window.sunLight.intensity = sunLight * 0.8;
    }
    
    processDirtyChunks();
    
    const ray = window.getRay && window.getRay();
    if (ray && window.hl) {
        window.hl.visible = true;
        window.hl.position.set(ray.break.x + 0.5, ray.break.y + 0.5, ray.break.z + 0.5);
    } else if (window.hl) {
        window.hl.visible = false;
    }
    
    renderer.render(scene, camera);
    
    frameCount++;
    uiTick++;
    const ui = getHudEls();
    if (currentTime - lastFpsTime >= 1000) {
        ui.fps.textContent = frameCount;
        frameCount = 0;
        lastFpsTime = currentTime;
    }

    // 每3帧更新一次坐标显示，减少DOM操作
    if (uiTick % 3 === 0) {
        ui.xyz.textContent =
            `${Math.floor(player.x)},${Math.floor(player.y)},${Math.floor(player.z)}`;
        ui.chunk.textContent = chunks.size;
        ui.ground.textContent = player.onGround ? '是' : '否';
    }

    // 群系显示每30帧更新一次（原每帧2次DOM写入+群系计算）
    if (uiTick % 30 === 0) {
        const biome = getBiomeAt(player.x, player.z).toUpperCase();
        ui.biome.textContent = biome;
        ui.biomeDisplay.textContent = biome;
    }

    // 面数统计每2秒更新一次
    if (uiTick % 120 === 0) {
        let faces = 0;
        chunks.forEach(c => {
            c.meshes.forEach(m => {
                if (m.geometry.index) faces += m.geometry.index.count / 3;
            });
        });
        ui.poly.textContent = Math.floor(faces);
    }
}



// ==================== 对象池系统（性能优化） ====================
const DOMObjectPool = {
    pool: [],
    maxSize: 50,

    acquire(className) {
        // 查找可用的元素
        for (let i = 0; i < this.pool.length; i++) {
            const item = this.pool[i];
            if (item.available && item.className === className) {
                item.available = false;
                item.element.style.display = '';
                return item.element;
            }
        }
        // 创建新元素
        const el = document.createElement('div');
        el.className = className;
        if (this.pool.length < this.maxSize) {
            this.pool.push({ element: el, className, available: false });
        }
        return el;
    },

    release(element) {
        for (const item of this.pool) {
            if (item.element === element) {
                item.available = true;
                element.style.display = 'none';
                if (element.parentNode) {
                    element.parentNode.removeChild(element);
                }
                return;
            }
        }
        // 不在池中，直接移除
        if (element.parentNode) {
            element.parentNode.removeChild(element);
        }
    },

    // 清理所有元素
    clear() {
        for (const item of this.pool) {
            if (item.element.parentNode) {
                item.element.parentNode.removeChild(item.element);
            }
        }
        this.pool = [];
    }
};

// ==================== 火焰粒子系统 ====================
const FireSystem = {
    fires: new Map(), // 存储所有火焰位置 "x,y,z" -> {created, lifetime}
    particles: [],
    maxFires: 200, // 最大火焰数量

    // 添加火焰
    addFire(x, y, z) {
        const key = `${x},${y},${z}`;
        if (this.fires.has(key)) return false; // 已有火焰
        if (this.fires.size >= this.maxFires) {
            // 移除最早的火焰
            const firstKey = this.fires.keys().next().value;
            this.removeFireFromWorld(firstKey);
        }

        // 设置火焰方块
        setBlock(x, y, z, 700);
        this.fires.set(key, {
            created: Date.now(),
            lifetime: 30000 + Math.random() * 30000, // 30-60秒寿命
            x, y, z
        });

        // 添加火焰光照
        this.updateFireLight(x, y, z, true);
        return true;
    },

    // 移除火焰
    removeFire(x, y, z) {
        const key = `${x},${y},${z}`;
        this.removeFireFromWorld(key);
    },

    removeFireFromWorld(key) {
        const fire = this.fires.get(key);
        if (!fire) return;

        // 移除方块
        const [x, y, z] = key.split(',').map(Number);
        if (getBlock(x, y, z) === 700) {
            setBlock(x, y, z, 0);
        }

        // 移除光照
        this.updateFireLight(x, y, z, false);
        this.fires.delete(key);
    },

    // 更新火焰光照
    updateFireLight(x, y, z, add) {
        // 标记周围区块为脏，重新构建光照
        for (let dx = -2; dx <= 2; dx++) {
            for (let dy = -2; dy <= 2; dy++) {
                for (let dz = -2; dz <= 2; dz++) {
                    const cx = Math.floor((x + dx * 16) / 16);
                    const cz = Math.floor((z + dz * 16) / 16);
                    const chunk = chunks.get(`${cx},${cz}`);
                    if (chunk) {
                        chunk.dirty = true;
                        renderQueue.add(chunk);
                    }
                }
            }
        }
    },

    // 尝试点燃方块
    tryIgnite(x, y, z) {
        const blockId = getBlock(x, y, z);
        // 不能点燃空气和已有火焰
        if (blockId === 0) return false;
        if (blockId === 700) return false;
        // 不能点燃不可燃方块（石头、泥土等）
        if (!this.isFlammable(blockId)) return false;

        // 在方块上方放置火焰
        const aboveId = getBlock(x, y + 1, z);
        if (aboveId === 0) {
            return this.addFire(x, y + 1, z);
        }
        return false;
    },

    // 判断方块是否可燃
    isFlammable(blockId) {
        const flammableBlocks = [2, 3, 5, 17, 18, 19, 20, 21, 22, 23, 47, 48, 50, 53, 54, 55, 56, 57, 58, 100];
        return flammableBlocks.includes(blockId);
    },

    // 更新所有火焰
    update(dt) {
        const now = Date.now();
        const toRemove = [];

        for (const [key, fire] of this.fires) {
            // 检查寿命
            if (now - fire.created > fire.lifetime) {
                toRemove.push(key);
                continue;
            }

            // 检查下方是否有支撑方块
            const belowId = getBlock(fire.x, fire.y - 1, fire.z);
            if (belowId === 0 || belowId === 700) {
                // 火焰悬空，提前熄灭
                toRemove.push(key);
                continue;
            }

            // 随机产生粒子效果
            if (Math.random() < 0.3) {
                this.spawnParticle(fire.x, fire.y, fire.z);
            }

            // 蔓延逻辑（每5秒尝试一次）
            if (Math.random() < dt * 0.02) {
                this.trySpread(fire.x, fire.y, fire.z);
            }
        }

        // 移除过期的火焰
        for (const key of toRemove) {
            this.removeFireFromWorld(key);
        }

        // 清理过期粒子
        this.cleanupParticles();
    },

    // 火焰蔓延
    trySpread(x, y, z) {
        const directions = [
            [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]
        ];
        const dir = directions[Math.floor(Math.random() * directions.length)];
        const nx = x + dir[0];
        const ny = y + dir[1];
        const nz = z + dir[2];

        const blockId = getBlock(nx, ny, nz);
        if (blockId === 0) {
            // 点燃旁边的可燃方块
            const belowId = getBlock(nx, ny - 1, nz);
            if (belowId !== 0 && this.isFlammable(belowId)) {
                this.addFire(nx, ny, nz);
            }
        } else if (this.isFlammable(blockId)) {
            const aboveId = getBlock(nx, ny + 1, nz);
            if (aboveId === 0) {
                this.addFire(nx, ny + 1, nz);
            }
        }
    },

    // 生成火焰粒子
    spawnParticle(x, y, z) {
        const viewport = document.getElementById('viewport');
        if (!viewport) return;

        // 限制同时显示的粒子数量
        if (this.particles.length > 30) return;

        // 火焰粒子（使用对象池）
        const particle = DOMObjectPool.acquire('fire-particle');

        // 计算屏幕位置
        const worldPos = new THREE.Vector3(x + 0.5, y + 0.8, z + 0.5);
        worldPos.project(camera);
        const sx = (worldPos.x * 0.5 + 0.5) * window.innerWidth;
        const sy = (-worldPos.y * 0.5 + 0.5) * window.innerHeight;

        if (worldPos.z > 1) return; // 在相机后面

        particle.style.left = (sx + (Math.random() - 0.5) * 20) + 'px';
        particle.style.top = sy + 'px';
        particle.style.width = (3 + Math.random() * 5) + 'px';
        particle.style.height = particle.style.width;

        viewport.appendChild(particle);
        this.particles.push({
            element: particle,
            created: Date.now()
        });

        // 偶尔产生烟雾
        if (Math.random() < 0.1) {
            const smoke = DOMObjectPool.acquire('smoke-particle');
            smoke.style.left = sx + 'px';
            smoke.style.top = (sy - 10) + 'px';
            viewport.appendChild(smoke);
            this.particles.push({
                element: smoke,
                created: Date.now()
            });
        }
    },

    // 清理过期粒子
    cleanupParticles() {
        const now = Date.now();
        this.particles = this.particles.filter(p => {
            if (now - p.created > 1500) {
                DOMObjectPool.release(p.element);
                return false;
            }
            return true;
        });
    },

    // 扑灭火焰（用于水等）
    extinguish(x, y, z) {
        // 扑灭指定位置的火焰
        if (getBlock(x, y, z) === 700) {
            this.removeFire(x, y, z);
            return true;
        }
        // 扑灭周围的火焰
        let extinguished = false;
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                for (let dz = -1; dz <= 1; dz++) {
                    if (getBlock(x + dx, y + dy, z + dz) === 700) {
                        this.removeFire(x + dx, y + dy, z + dz);
                        extinguished = true;
                    }
                }
            }
        }
        return extinguished;
    },

    // 保存火焰数据
    save() {
        const data = {};
        for (const [key, fire] of this.fires) {
            data[key] = {
                remaining: fire.lifetime - (Date.now() - fire.created)
            };
        }
        return data;
    },

    // 加载火焰数据
    load(data) {
        if (!data) return;
        for (const [key, fireData] of Object.entries(data)) {
            const [x, y, z] = key.split(',').map(Number);
            if (getBlock(x, y, z) === 0 || getBlock(x, y, z) === 700) {
                this.addFire(x, y, z);
                const fire = this.fires.get(key);
                if (fire && fireData.remaining) {
                    fire.lifetime = fireData.remaining;
                }
            }
        }
    }
};

// 使用打火石点燃
function useFlintAndSteel() {
    const r = getRay();
    if (!r) return false;

    const p = r.place;
    const targetId = getBlock(p.x, p.y, p.z);

    // 如果点击的位置是空气，在那里点火
    if (targetId === 0) {
        // 检查下方是否有可燃物
        const belowId = getBlock(p.x, p.y - 1, p.z);
        if (belowId !== 0 && FireSystem.isFlammable(belowId)) {
            return FireSystem.addFire(p.x, p.y, p.z);
        }
        return false;
    }

    // 尝试点燃目标方块
    return FireSystem.tryIgnite(p.x, p.y, p.z);
}

// ==================== 命令系统 ====================
let commandConsoleOpen = false;

// 打开命令控制台
function openCommandConsole() {
    if (!allowCheats) return;
    commandConsoleOpen = true;
    document.getElementById('command-console').style.display = 'flex';
    document.getElementById('command-input').focus();
    if (player) player.controlsEnabled = false;
}

// 关闭命令控制台
function closeCommandConsole() {
    commandConsoleOpen = false;
    document.getElementById('command-console').style.display = 'none';
    if (player) player.controlsEnabled = true;
}

// 处理命令输入框按键
function handleCommandKey(event) {
    if (event.key === 'Enter') {
        executeCommand();
    } else if (event.key === 'Escape') {
        closeCommandConsole();
    }
}

// 添加命令输出
function addCommandOutput(text, type = 'output') {
    const output = document.getElementById('command-output');
    const line = document.createElement('div');
    line.className = `command-line command-${type}-line`;
    line.textContent = text;
    output.appendChild(line);
    output.scrollTop = output.scrollHeight;
}

// 执行命令
function executeCommand() {
    const input = document.getElementById('command-input');
    const cmd = input.value.trim();
    if (!cmd) return;
    
    // 显示输入的命令
    addCommandOutput('> ' + cmd, 'input');
    
    // 解析命令
    const parts = cmd.split(' ');
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);
    
    // 执行对应命令
    switch (command) {
        case 'help':
        case '?':
            showHelp();
            break;
        case 'gamemode':
        case 'gm':
            cmdGamemode(args);
            break;
        case 'give':
        case 'g':
            cmdGive(args);
            break;
        case 'tp':
        case 'teleport':
            cmdTeleport(args);
            break;
        case 'time':
            cmdTime(args);
            break;
        case 'weather':
            cmdWeather(args);
            break;
        case 'kill':
            cmdKill();
            break;
        case 'heal':
            cmdHeal(args);
            break;
        case 'fly':
            cmdFly();
            break;
        case 'speed':
            cmdSpeed(args);
            break;
        case 'clear':
            cmdClear();
            break;
        case 'save':
            cmdSave();
            break;
        case 'day':
            setTimeOfDay(6000);
            addCommandOutput('时间已设置为白天', 'success');
            break;
        case 'night':
            setTimeOfDay(18000);
            addCommandOutput('时间已设置为夜晚', 'success');
            break;
        case 'coords':
            addCommandOutput(`当前坐标: X=${Math.floor(player.x)} Y=${Math.floor(player.y)} Z=${Math.floor(player.z)}`, 'info');
            break;
        default:
            addCommandOutput(`未知命令: ${command}，输入 /help 查看可用命令`, 'error');
    }
    
    input.value = '';
}

// 显示帮助
function showHelp() {
    addCommandOutput('=== 可用命令列表 ===', 'info');
    addCommandOutput('/help 或 /? - 显示此帮助', 'output');
    addCommandOutput('/gamemode <0|1|survival|creative> - 切换游戏模式', 'output');
    addCommandOutput('/give <物品ID> [数量] - 给予物品', 'output');
    addCommandOutput('/tp <x> <y> <z> - 传送到指定坐标', 'output');
    addCommandOutput('/time <day|night|数字> - 设置时间', 'output');
    addCommandOutput('/weather <clear|rain|thunder> - 设置天气', 'output');
    addCommandOutput('/kill - 自杀', 'output');
    addCommandOutput('/heal [数值] - 恢复生命值', 'output');
    addCommandOutput('/fly - 切换飞行模式', 'output');
    addCommandOutput('/speed <数值> - 设置移动速度', 'output');
    addCommandOutput('/clear - 清空聊天', 'output');
    addCommandOutput('/save - 保存世界', 'output');
    addCommandOutput('/day - 设置为白天', 'output');
    addCommandOutput('/night - 设置为夜晚', 'output');
    addCommandOutput('/coords - 显示当前坐标', 'output');
}

// 游戏模式命令
function cmdGamemode(args) {
    if (args.length === 0) {
        addCommandOutput('用法: /gamemode <0|1|survival|creative>', 'error');
        return;
    }
    const mode = args[0].toLowerCase();
    if (mode === '0' || mode === 'survival') {
        window.isSurvival = true;
        addCommandOutput('游戏模式已切换为: 生存模式', 'success');
    } else if (mode === '1' || mode === 'creative') {
        window.isSurvival = false;
        addCommandOutput('游戏模式已切换为: 创造模式', 'success');
    } else {
        addCommandOutput('无效的游戏模式，使用 0/survival 或 1/creative', 'error');
    }
}

// 给予物品命令
function cmdGive(args) {
    if (args.length === 0) {
        addCommandOutput('用法: /give <物品ID> [数量]', 'error');
        addCommandOutput('常用物品ID: 1=石头 2=草方块 3=泥土 4=圆石 5=木板 17=原木 263=煤炭 264=钻石', 'info');
        return;
    }
    const itemId = parseInt(args[0]);
    const count = parseInt(args[1]) || 64;
    
    if (isNaN(itemId) || itemId < 1 || itemId > 1023) {
        addCommandOutput('无效的物品ID', 'error');
        return;
    }
    
    // 添加到背包
    addItemToInventory(itemId, count);
    const itemName = BlockDefs[itemId]?.name || `物品#${itemId}`;
    addCommandOutput(`已给予 ${count} 个 ${itemName}`, 'success');
}

// 传送命令
function cmdTeleport(args) {
    if (args.length < 3) {
        addCommandOutput('用法: /tp <x> <y> <z>', 'error');
        return;
    }
    const x = parseFloat(args[0]);
    const y = parseFloat(args[1]);
    const z = parseFloat(args[2]);
    
    if (isNaN(x) || isNaN(y) || isNaN(z)) {
        addCommandOutput('坐标必须是数字', 'error');
        return;
    }
    
    player.x = x;
    player.y = y;
    player.z = z;
    player.vx = 0;
    player.vy = 0;
    player.vz = 0;
    addCommandOutput(`已传送到: ${x}, ${y}, ${z}`, 'success');
}

// 时间命令
function cmdTime(args) {
    if (args.length === 0) {
        addCommandOutput(`当前时间: ${Math.floor(gameTime)}`, 'info');
        addCommandOutput('用法: /time <day|night|0-24000>', 'error');
        return;
    }
    const time = args[0].toLowerCase();
    if (time === 'day') {
        setTimeOfDay(6000);
        addCommandOutput('时间已设置为白天', 'success');
    } else if (time === 'night') {
        setTimeOfDay(18000);
        addCommandOutput('时间已设置为夜晚', 'success');
    } else {
        const t = parseInt(time);
        if (!isNaN(t) && t >= 0 && t <= 24000) {
            setTimeOfDay(t);
            addCommandOutput(`时间已设置为: ${t}`, 'success');
        } else {
            addCommandOutput('无效的时间值 (0-24000)', 'error');
        }
    }
}

// 天气命令
function cmdWeather(args) {
    if (args.length === 0) {
        addCommandOutput('用法: /weather <clear|rain|thunder>', 'error');
        return;
    }
    const weather = args[0].toLowerCase();
    if (weather === 'clear') {
        currentWeather = 'clear';
        addCommandOutput('天气已设置为: 晴朗', 'success');
    } else if (weather === 'rain') {
        currentWeather = 'rain';
        addCommandOutput('天气已设置为: 下雨', 'success');
    } else if (weather === 'thunder') {
        currentWeather = 'thunder';
        addCommandOutput('天气已设置为: 雷暴', 'success');
    } else {
        addCommandOutput('无效的天气类型', 'error');
    }
}

// 自杀命令
function cmdKill() {
    if (isSurvival && survivalStats) {
        survivalStats.health = 0;
        die();
        addCommandOutput('你杀死了自己', 'success');
    } else {
        // 创造模式也执行死亡逻辑
        addCommandOutput('你杀死了自己', 'success');
        respawn();
    }
}

// 恢复生命命令
function cmdHeal(args) {
    const amount = parseInt(args[0]) || 20;
    if (isSurvival && survivalStats) {
        survivalStats.health = Math.min(survivalStats.health + amount, survivalStats.maxHealth);
        updateSurvivalUI();
        addCommandOutput(`恢复了 ${amount} 点生命值`, 'success');
    } else {
        addCommandOutput('当前不是生存模式', 'error');
    }
}

// 飞行命令
function cmdFly() {
    if (player) {
        player.canFly = !player.canFly;
        player.flying = player.canFly;
        addCommandOutput(player.canFly ? '飞行模式已开启' : '飞行模式已关闭', 'success');
    }
}

// 速度命令
function cmdSpeed(args) {
    if (args.length === 0) {
        addCommandOutput('用法: /speed <数值> (默认: 4.3)', 'error');
        return;
    }
    const speed = parseFloat(args[0]);
    if (!isNaN(speed) && speed > 0 && speed <= 20) {
        player.speed = speed;
        addCommandOutput(`移动速度已设置为: ${speed}`, 'success');
    } else {
        addCommandOutput('无效的速度值 (0.1-20)', 'error');
    }
}

// 清空聊天
function cmdClear() {
    document.getElementById('command-output').innerHTML = '';
    addCommandOutput('聊天已清空', 'info');
}

// 保存世界
function cmdSave() {
    saveWorld();
    addCommandOutput('世界已保存', 'success');
}

// 添加物品到背包
function addItemToInventory(itemId, count) {
    // 先尝试添加到快捷栏
    for (let i = 0; i < 9; i++) {
        if (hotbar[i] === 0) {
            hotbar[i] = itemId;
            hotbarCount[i] = count;
            updateHotbar();
            return;
        } else if (hotbar[i] === itemId) {
            hotbarCount[i] += count;
            updateHotbar();
            return;
        }
    }
    // 快捷栏满了，显示提示
    addCommandOutput('快捷栏已满，物品已丢弃', 'error');
}

// 设置时间
function setTimeOfDay(time) {
    gameTime = time % 24000;
    updateDayNightCycle(0);
}

// 天气变量
let currentWeather = 'clear';

initMaterials();