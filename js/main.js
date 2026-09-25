// 获取菜单元素
        const mainMenu = document.getElementById('main-menu');
        const modeSelect = document.getElementById('mode-select');
        const settingsMenu = document.getElementById('settings-menu');
        const aboutMenu = document.getElementById('about-menu');
        const roseMenu = document.getElementById('rose-menu');
        // 设置默认值
        const settings = {
            renderDistance: 4,
            fov: 75,
            sound: true,
            smoothLighting: true,
            showFps: true,
            music: false
        };
        
        // 背景音乐音频对象
        let bgMusic = null;
        let musicPending = false;
        
        // 初始化背景音乐
        function initBackgroundMusic() {
            if (settings.music && !bgMusic) {
                bgMusic = new Audio('https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3');
                bgMusic.loop = true;
                bgMusic.volume = 0.5;
            }
        }
        
        // 播放背景音乐
        function playBackgroundMusic() {
            if (settings.music && bgMusic) {
                bgMusic.play().catch(e => {
                    console.log('音乐播放失败:', e);
                });
            }
        }
        
        // 停止背景音乐
        function stopBackgroundMusic() {
            if (bgMusic) {
                bgMusic.pause();
                bgMusic.currentTime = 0;
            }
        }
        
        // 暂停背景音乐（页面不可见时）
        function pauseBackgroundMusic() {
            if (bgMusic) {
                bgMusic.pause();
            }
        }
        
        // 恢复背景音乐（页面可见时）
        function resumeBackgroundMusic() {
            if (settings.music && bgMusic) {
                bgMusic.play().catch(e => {
                    console.log('音乐恢复失败:', e);
                });
            }
        }
        
        // 监听页面可见性变化
        document.addEventListener('visibilitychange', function() {
            if (document.hidden) {
                // 页面不可见时暂停音乐
                pauseBackgroundMusic();
            } else {
                // 页面可见时恢复音乐
                resumeBackgroundMusic();
            }
        });
        
        // 背景音乐开关处理
        function toggleMusicSetting() {
            if (!settings.music) {
                // 尝试开启音乐，显示版权提示
                musicPending = true;
                showCopyrightModal();
            } else {
                // 关闭音乐
                settings.music = false;
                updateToggle('music', false);
                stopBackgroundMusic();
                if (bgMusic) {
                    bgMusic = null;
                }
                saveSettings();
            }
        }
        
        // 显示版权提示弹窗
        function showCopyrightModal() {
            document.getElementById('copyright-modal').style.display = 'flex';
        }
        
        // 隐藏版权提示弹窗
        function hideCopyrightModal() {
            document.getElementById('copyright-modal').style.display = 'none';
        }
        
        // 版权提示 - 退出按钮
        function onMusicCancel() {
            hideCopyrightModal();
            musicPending = false;
            // 开关保持关闭状态
            updateToggle('music', false);
        }
        
        // 版权提示 - 知道了按钮
        function onMusicConfirm() {
            hideCopyrightModal();
            // 开启音乐
            settings.music = true;
            updateToggle('music', true);
            saveSettings();
            // 初始化并播放音乐
            initBackgroundMusic();
            playBackgroundMusic();
            musicPending = false;
        }
        
        // 从localStorage加载设置
        function loadSettings() {
            const saved = localStorage.getItem('mcSettings');
            if (saved) {
                Object.assign(settings, JSON.parse(saved));
                updateSettingsUI();
            }
        }
        
        // 保存设置到localStorage
        function saveSettings() {
            localStorage.setItem('mcSettings', JSON.stringify(settings));
        }
        
        // 更新设置界面显示
        function updateSettingsUI() {
            document.getElementById('renderDistance-value').textContent = settings.renderDistance;
            document.getElementById('fov-value').textContent = settings.fov;
            updateToggle('sound', settings.sound);
            updateToggle('smoothLighting', settings.smoothLighting);
            updateToggle('showFps', settings.showFps);
            updateToggle('music', settings.music);
            // 如果音乐已开启，初始化音频对象
            if (settings.music) {
                initBackgroundMusic();
            }
        }
        
        // 更新开关状态
        function updateToggle(key, value) {
            const toggle = document.getElementById(key + '-toggle');
            if (toggle) {
                if (value) {
                    toggle.classList.add('active');
                } else {
                    toggle.classList.remove('active');
                }
            }
        }
        
        // 显示世界选择菜单
        function showWorldMenu() {
            // 隐藏主菜单
            mainMenu.classList.remove('menu-visible');
            mainMenu.classList.add('menu-hidden');
            
            // 隐藏模式选择（创建世界）
            modeSelect.classList.remove('menu-visible');
            modeSelect.classList.add('menu-hidden');
            
            // 隐藏读取存档界面
            document.getElementById('load-world-menu').classList.remove('menu-visible');
            document.getElementById('load-world-menu').classList.add('menu-hidden');
            
            // 显示世界选择菜单
            document.getElementById('world-menu').classList.remove('menu-hidden');
            document.getElementById('world-menu').classList.add('menu-visible');
        }
        
        // 显示模式选择界面
        function showModeSelect() {
            // 隐藏其他所有界面
            mainMenu.classList.remove('menu-visible');
            mainMenu.classList.add('menu-hidden');
            document.getElementById('world-menu').classList.remove('menu-visible');
            document.getElementById('world-menu').classList.add('menu-hidden');
            document.getElementById('load-world-menu').classList.remove('menu-visible');
            document.getElementById('load-world-menu').classList.add('menu-hidden');
            
            modeSelect.classList.remove('menu-hidden');
            modeSelect.classList.add('menu-visible');
            renderModSelection();
        }
        
        // 显示读取存档界面
        function showLoadWorld() {
            // 隐藏其他所有界面
            mainMenu.classList.remove('menu-visible');
            mainMenu.classList.add('menu-hidden');
            document.getElementById('world-menu').classList.remove('menu-visible');
            document.getElementById('world-menu').classList.add('menu-hidden');
            
            document.getElementById('load-world-menu').classList.remove('menu-hidden');
            document.getElementById('load-world-menu').classList.add('menu-visible');
            
            renderSaveList();
        }
        
        // 渲染存档列表
        function renderSaveList() {
            const saveList = document.getElementById('save-list');
            const noSaves = document.getElementById('no-saves');
            const saves = getSaveList();
            
            if (saves.length === 0) {
                saveList.style.display = 'none';
                noSaves.style.display = 'block';
                return;
            }
            
            saveList.style.display = 'block';
            noSaves.style.display = 'none';
            saveList.innerHTML = '';
            
            saves.forEach(save => {
                const saveItem = document.createElement('div');
                saveItem.className = 'save-item';
                
                const modeClass = save.mode === 'creative' ? 'creative' : '';
                const modeText = save.mode === 'creative' ? '创造' : '生存';
                
                saveItem.innerHTML = `
                    <div class="save-icon" onclick="loadSave('${save.id}')">🌍</div>
                    <div class="save-info" onclick="loadSave('${save.id}')">
                        <div class="save-name">${save.name}</div>
                        <div class="save-details">
                            <span class="save-mode ${modeClass}">${modeText}</span>
                            <span>${save.date}</span>
                        </div>
                    </div>
                    <button class="save-delete-btn" onclick="event.stopPropagation(); deleteSave('${save.id}')" title="删除存档">🗑️</button>
                `;
                
                saveList.appendChild(saveItem);
            });
        }
        
        // 获取存档列表
        function getSaveList() {
            const saves = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('mcSave_')) {
                    try {
                        const saveData = JSON.parse(localStorage.getItem(key));
                        saves.push({
                            id: key.replace('mcSave_', ''),
                            name: saveData.name || '未命名世界',
                            mode: saveData.mode || 'survival',
                            date: saveData.date || '未知时间'
                        });
                    } catch (e) {
                        console.error('读取存档失败:', key);
                    }
                }
            }
            // 按时间倒序排列
            return saves.sort((a, b) => new Date(b.date) - new Date(a.date));
        }
        
        // 加载存档
        function loadSave(saveId) {
            localStorage.setItem('loadSaveId', saveId);
            // 恢复该存档创建时选择的模组（没有记录则用原版）
            let mods = {};
            try {
                const saveData = JSON.parse(localStorage.getItem('mcSave_' + saveId) || '{}');
                mods = saveData.mods || {};
            } catch(e) {}
            localStorage.setItem('activeMods', JSON.stringify(mods));
            window.location.href = 'game.html?load=1';
        }
        
        // 删除存档
        function deleteSave(saveId) {
            if (confirm('确定要删除这个存档吗？此操作不可恢复！')) {
                localStorage.removeItem('mcSave_' + saveId);
                // 如果删除的是当前正在使用的存档，清除当前存档ID
                const currentSaveId = localStorage.getItem('currentSaveId');
                if (currentSaveId === saveId) {
                    localStorage.removeItem('currentSaveId');
                }
                // 刷新存档列表
                renderSaveList();
            }
        }
        
        // 显示加入我们菜单
        function showJoinUsMenu() {
            mainMenu.classList.remove('menu-visible');
            mainMenu.classList.add('menu-hidden');
            
            roseMenu.classList.remove('menu-hidden');
            roseMenu.classList.add('menu-visible');
        }
        // ==================== 模组商城 ====================
        const ModCatalog = [
            {
                id: 'smoothLighting',
                name: '平滑光照',
                nameEn: 'Smooth Lighting',
                icon: '💡',
                version: '1.0.0',
                author: 'Apple',
                desc: 'PCF软阴影映射、双光源系统、群系光照自适应（沙漠/雪地效果不同）、电影级色调映射 ACESFilmic、动态阴影相机跟随，让方块世界拥有柔和真实的阳光与阴影。'
            }
        ];
        
        function getInstalledMods() {
            try {
                const mods = JSON.parse(localStorage.getItem('mcMods') || '{}');
                // 兼容旧ID：appleLighting → smoothLighting
                if (mods.appleLighting === true && mods.smoothLighting !== true) {
                    mods.smoothLighting = true;
                    delete mods.appleLighting;
                    localStorage.setItem('mcMods', JSON.stringify(mods));
                }
                return mods;
            }
            catch(e) { return {}; }
        }
        
        function showModStore() {
            mainMenu.classList.remove('menu-visible');
            mainMenu.classList.add('menu-hidden');
            document.getElementById('mod-store-menu').classList.remove('menu-hidden');
            document.getElementById('mod-store-menu').classList.add('menu-visible');
            renderModStore();
        }
        
        function renderModStore() {
            const list = document.getElementById('mod-list');
            const installed = getInstalledMods();
            list.innerHTML = ModCatalog.map(mod => {
                const isOn = installed[mod.id] === true;
                return `
                    <div class="mod-card ${isOn ? 'installed' : ''}">
                        <div class="mod-icon">${mod.icon}</div>
                        <div class="mod-info">
                            <div class="mod-name">${mod.name} <span class="mod-name-en">${mod.nameEn}</span></div>
                            <div class="mod-meta">v${mod.version} · by ${mod.author}</div>
                            <div class="mod-desc">${mod.desc}</div>
                        </div>
                        <button class="mod-install-btn ${isOn ? 'uninstall' : ''}" onclick="toggleMod('${mod.id}')">
                            ${isOn ? '卸载' : '安装'}
                        </button>
                    </div>
                `;
            }).join('');
        }
        
        function toggleMod(modId) {
            const installed = getInstalledMods();
            installed[modId] = installed[modId] === true ? false : true;
            localStorage.setItem('mcMods', JSON.stringify(installed));
            renderModStore();
        }
        
        // 显示设置界面
        function showSettings() {
            mainMenu.classList.remove('menu-visible');
            mainMenu.classList.add('menu-hidden');
            
            settingsMenu.classList.remove('menu-hidden');
            settingsMenu.classList.add('menu-visible');
            loadSettings();
        }
        
        // 返回主菜单
        function showMainMenu() {
            modeSelect.classList.remove('menu-visible');
            modeSelect.classList.add('menu-hidden');
            
            settingsMenu.classList.remove('menu-visible');
            settingsMenu.classList.add('menu-hidden');
            
            aboutMenu.classList.remove('menu-visible');
            aboutMenu.classList.add('menu-hidden');
            
            roseMenu.classList.remove('menu-visible');
            roseMenu.classList.add('menu-hidden');
            
            document.getElementById('world-menu').classList.remove('menu-visible');
            document.getElementById('world-menu').classList.add('menu-hidden');
            
            document.getElementById('load-world-menu').classList.remove('menu-visible');
            document.getElementById('load-world-menu').classList.add('menu-hidden');
            
            document.getElementById('mod-store-menu').classList.remove('menu-visible');
            document.getElementById('mod-store-menu').classList.add('menu-hidden');
            
            mainMenu.classList.remove('menu-hidden');
            mainMenu.classList.add('menu-visible');
        }
        
        // 显示关于页面
        function showAbout() {
            settingsMenu.classList.remove('menu-visible');
            settingsMenu.classList.add('menu-hidden');
            
            aboutMenu.classList.remove('menu-hidden');
            aboutMenu.classList.add('menu-visible');
        }
        
        // 从关于页面返回设置
        function showSettingsFromAbout() {
            aboutMenu.classList.remove('menu-visible');
            aboutMenu.classList.add('menu-hidden');
            
            settingsMenu.classList.remove('menu-hidden');
            settingsMenu.classList.add('menu-visible');
        }
        
        // 修改数值设置
        function changeSetting(key, delta) {
            if (key === 'renderDistance') {
                settings.renderDistance = Math.max(2, Math.min(8, settings.renderDistance + delta));
            } else if (key === 'fov') {
                settings.fov = Math.max(60, Math.min(110, settings.fov + delta));
            }
            document.getElementById(key + '-value').textContent = settings[key];
            saveSettings();
        }
        
        // 切换开关设置
        function toggleSetting(key) {
            settings[key] = !settings[key];
            updateToggle(key, settings[key]);
            saveSettings();
        }
        
        // 渲染创建世界界面的模组选择列表（只列出已下载的模组）
        function renderModSelection() {
            const box = document.getElementById('mod-select-list');
            if (!box) return;
            const installed = getInstalledMods();
            const available = ModCatalog.filter(m => installed[m.id] === true);
            if (available.length === 0) {
                box.innerHTML = '<div class="mod-select-empty">暂无已下载的模组，将使用原版体验</div>';
                return;
            }
            box.innerHTML = available.map(m => `
                <label class="mod-select-item">
                    <input type="checkbox" class="mod-select-checkbox" value="${m.id}" />
                    <span class="checkmark"></span>
                    <span class="mod-select-icon">${m.icon}</span>
                    <span class="mod-select-name">${m.name}</span>
                    <span class="mod-select-en">${m.nameEn}</span>
                </label>
            `).join('');
        }
        
        // 开始游戏（创建新世界）
        function startGame(mode) {
            localStorage.setItem('gameMode', mode);
            // 保存作弊设置
            const allowCheats = document.getElementById('allow-cheats').checked;
            localStorage.setItem('allowCheats', allowCheats ? 'true' : 'false');
            // 收集本次世界启用的模组（不选 = 原版）
            const activeMods = {};
            document.querySelectorAll('.mod-select-checkbox:checked').forEach(cb => {
                activeMods[cb.value] = true;
            });
            localStorage.setItem('activeMods', JSON.stringify(activeMods));
            // 清除之前的存档ID，表示创建新世界
            localStorage.removeItem('currentSaveId');
            // 如果音乐正在播放，让它继续播放（页面跳转不会中断）
            window.location.href = 'game.html';
        }
        
        // 防止触摸设备上的双击缩放
        document.addEventListener('touchstart', function(e) {
            if (e.touches.length > 1) {
                e.preventDefault();
            }
        }, { passive: false });
        
        // 防止右键菜单
        document.addEventListener('contextmenu', function(e) {
            e.preventDefault();
        });
        
        // 页面加载时初始化设置
        loadSettings();
// ==================== 字体就绪后显示主页 ====================
(function() {
    let shown = false;
    function showMainMenu() {
        if (shown) return;
        shown = true;
        document.body.classList.add('ready');
        // 等淡出动画结束后移除加载层，避免残留
        setTimeout(() => {
            const el = document.getElementById('font-loading');
            if (el) el.remove();
        }, 600);
    }
    // 等待像素字体加载完成
    if (document.fonts && document.fonts.load) {
        document.fonts.load('16px "PixelWeb"').then(showMainMenu).catch(showMainMenu);
    }
    // 兜底：字体服务不可用时最多等3秒
    setTimeout(showMainMenu, 3000);
})();
