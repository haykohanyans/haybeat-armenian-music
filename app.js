/**
 * HAYBEAT — Armenian Music Trends Intelligence Hub
 * Frontend Application Controller (app.js)
 */

(function () {
  "use strict";

  const STATE = {
    data: window.HAYBEAT_INITIAL_DATA || null,
    activeTab: "radar",
    sceneFilter: "all",
    signalFilter: "all",
    artistFilter: "all",
    localOnly: false,
    sortBy: "score",
    viewMode: "grid", // 'grid' | 'table'
    searchQuery: "",
    platformChart: "apple", // 'apple' | 'youtube' | 'itunes'
    fhTier: "all", // 'all' | 'micro' | 'underground' | 'mid' | 'major'
    fhSource: "all", // 'all' | 'yt_today' | 'yt_week' | 'yt_month' | 'yt_underground' | 'itunes_am_new' | 'deezer_indie' | 'chart_premiere'
    fhSort: "newest", // 'newest' | 'yt_views_asc' | 'views_asc' | 'views_desc'
    fhView: "grid", // 'grid' | 'table'
    fhSearch: "",
    fhHideMixes: true,
    fhHideAi: false,
    favorites: [],
    queue: [],
    queueIndex: -1,
    currentTrack: null,
    isPlaying: false,
    queueLabel: "Радар",
  };

  const DEFAULT_FAVORITES = [
    "sirusho__chemneri",
    "brunette__anhetanam",
    "arkadidumikyan__shnorhavorumem",
    "dlittegharib__txtevarder",
    "ladaniva__margarita",
  ];

  // Utility: Format numbers with spaces (1 234 567)
  function fmtNum(n) {
    if (n === null || n === undefined || isNaN(n)) return "—";
    return Number(n).toLocaleString("ru-RU");
  }

  function fmtCompact(n) {
    if (!n || isNaN(n)) return "—";
    if (n >= 1e6) return (n / 1e6).toFixed(2).replace(".00", "") + " млн";
    if (n >= 1e3) return (n / 1e3).toFixed(1).replace(".0", "") + " тыс.";
    return String(n);
  }

  function fmtTime(sec) {
    if (!sec || isNaN(sec)) return "0:00";
    const s = Math.floor(sec);
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return m + ":" + (rem < 10 ? "0" + rem : rem);
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatDeltaBadge(deltaStr) {
    if (!deltaStr) return "";
    if (deltaStr === "NEW" || deltaStr === "RE") {
      return `<span class="px-1.5 py-0.5 text-[11px] font-bold rounded bg-violet-500/20 text-violet-300 border border-violet-500/30">${deltaStr}</span>`;
    }
    if (deltaStr === "=") {
      return `<span class="text-xs text-[var(--text-muted)] font-semibold">=</span>`;
    }
    if (deltaStr.startsWith("+")) {
      return `<span class="text-xs font-bold text-emerald-400">▲ ${deltaStr}</span>`;
    }
    if (deltaStr.startsWith("-")) {
      return `<span class="text-xs font-medium text-rose-400">▼ ${deltaStr}</span>`;
    }
    return `<span class="text-xs text-[var(--text-secondary)]">${escapeHtml(deltaStr)}</span>`;
  }

  function getBadgeHtml(badge) {
    if (!badge) return "";
    const colorMap = {
      amber: "bg-amber-500/15 text-amber-300 border-amber-500/30",
      emerald: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
      violet: "bg-violet-500/15 text-violet-300 border-violet-500/30",
      cyan: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
      blue: "bg-blue-500/15 text-blue-300 border-blue-500/30",
      slate: "bg-slate-500/15 text-slate-300 border-slate-500/30",
    };
    const cls = colorMap[badge.color] || colorMap.slate;
    return `<span class="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border ${cls}">${escapeHtml(badge.label)}</span>`;
  }

  function getScoreClass(score) {
    if (score >= 58) return "score-high";
    if (score >= 40) return "score-mid";
    return "score-base";
  }

  // Load Favorites from localStorage
  function loadFavorites() {
    try {
      const raw = localStorage.getItem("haybeat_favorites_v1");
      if (raw) {
        STATE.favorites = JSON.parse(raw);
      } else {
        STATE.favorites = [...DEFAULT_FAVORITES];
        saveFavorites();
      }
    } catch (e) {
      STATE.favorites = [...DEFAULT_FAVORITES];
    }
    updateFavoritesBadge();
  }

  function saveFavorites() {
    try {
      localStorage.setItem("haybeat_favorites_v1", JSON.stringify(STATE.favorites));
    } catch (e) {}
    updateFavoritesBadge();
  }

  function updateFavoritesBadge() {
    const el = document.getElementById("badge-count-fav");
    if (el) el.textContent = String(STATE.favorites.length);
  }

  function isFavorite(trackId) {
    return STATE.favorites.includes(trackId);
  }

  function toggleFavorite(trackId, ev) {
    if (ev) ev.stopPropagation();
    const idx = STATE.favorites.indexOf(trackId);
    if (idx >= 0) {
      STATE.favorites.splice(idx, 1);
      showToast("Удалено из вашей коллекции", "⭐");
    } else {
      STATE.favorites.unshift(trackId);
      showToast("Трек добавлен в вашу коллекцию!", "⭐");
    }
    saveFavorites();
    renderActiveTab();
  }

  // Toast Notification
  let toastTimer = null;
  function showToast(msg, icon = "✅") {
    const box = document.getElementById("toast-box");
    const ic = document.getElementById("toast-icon");
    const tx = document.getElementById("toast-msg");
    if (!box || !ic || !tx) return;
    ic.textContent = icon;
    tx.textContent = msg;
    box.classList.remove("hidden");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      box.classList.add("hidden");
    }, 3600);
  }

  // =========================================================================
  // RENDERING: HERO SPOTLIGHTS & QUICK ARTIST PILLS
  // =========================================================================

  function renderHeaderStats() {
    if (!STATE.data) return;
    const lbl = document.getElementById("updated-at-label");
    if (lbl) lbl.textContent = STATE.data.updated_at || "Сегодня";

    const rBadge = document.getElementById("badge-count-radar");
    if (rBadge) rBadge.textContent = String((STATE.data.tracks || []).length);

    const fhBadge = document.getElementById("badge-count-firehose");
    if (fhBadge) fhBadge.textContent = String((STATE.data.firehose_releases || []).length);

    const aBadge = document.getElementById("badge-count-artists");
    if (aBadge) aBadge.textContent = String((STATE.data.artists || []).length);
  }

  function renderHeroSpotlights() {
    const container = document.getElementById("hero-spotlights");
    if (!container || !STATE.data) return;

    const tracks = STATE.data.tracks || [];
    const topApple = tracks.find((t) => t.apple_pos === 1) || tracks[0];
    const topYT = tracks.find((t) => t.yt_pos === 1) || tracks[0];

    // Top Risers
    const risers = tracks
      .filter((t) => {
        if (!t.apple_delta) return false;
        const n = parseInt(t.apple_delta.replace("+", ""), 10);
        return !isNaN(n) && n >= 20;
      })
      .sort((a, b) => parseInt(b.apple_delta.replace("+", ""), 10) - parseInt(a.apple_delta.replace("+", ""), 10))
      .slice(0, 4);

    // Unfiltered Firehose micro/fresh drops for Card 4
    const fhAll = STATE.data.firehose_releases || [];
    const fhMicroSample = fhAll
      .filter((x) => !x.is_mix && !x.is_ai && x.tier_id === "micro")
      .slice(0, 3);

    container.innerHTML = `
      <!-- Card 1: #1 Apple Music AM -->
      <div class="hb-card p-4 flex flex-col justify-between relative overflow-hidden">
        <div class="flex items-center justify-between gap-2 mb-3">
          <span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
            🍎 #1 Apple Music Армения
          </span>
          <span class="text-xs text-[var(--text-secondary)]">Релиз: ${escapeHtml(topApple?.release_date || "Окт 2026")}</span>
        </div>
        <div class="flex items-center gap-3.5 my-1">
          <img src="${escapeHtml(topApple?.artwork_url || "")}" alt="" class="w-16 h-16 rounded-xl object-cover border border-white/10 shadow-md flex-shrink-0" />
          <div class="min-w-0 flex-1">
            <h3 class="text-base font-extrabold truncate">${escapeHtml(topApple?.title || "")}</h3>
            <p class="text-xs font-semibold text-amber-400 truncate cursor-pointer hover:underline"
               onclick="window.HB.filterByArtist('${escapeHtml(topApple?.artist_canonical || "")}')">
              ${escapeHtml(topApple?.artist || "")}
            </p>
            <p class="text-xs text-[var(--text-secondary)] mt-1">
              YouTube: <strong class="text-[var(--text-primary)]">${fmtCompact(topApple?.youtube_views)}</strong> просм. (${escapeHtml(topApple?.youtube_published || "12д")})
            </p>
          </div>
        </div>
        <div class="flex items-center gap-2 mt-3 pt-2.5 border-t border-[var(--border-subtle)]">
          <button onclick="window.HB.playTrackById('${escapeHtml(topApple?.id || "")}')"
                  class="flex-1 py-1.5 px-3 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition cursor-pointer">
            ▶ Слушать
          </button>
          <button onclick="window.HB.openVideoById('${escapeHtml(topApple?.id || "")}')"
                  class="py-1.5 px-3 rounded-lg text-xs font-semibold bg-white/10 hover:bg-white/20 text-amber-300 transition cursor-pointer">
            🎬 Клип
          </button>
        </div>
      </div>

      <!-- Card 2: #1 YouTube Armenia -->
      <div class="hb-card p-4 flex flex-col justify-between relative overflow-hidden">
        <div class="flex items-center justify-between gap-2 mb-3">
          <span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
            ▶️ #1 YouTube Армения
          </span>
          <span class="text-xs text-emerald-400 font-bold">+${fmtNum(topYT?.yt_weekly_delta)} за нед.</span>
        </div>
        <div class="flex items-center gap-3.5 my-1">
          <img src="${escapeHtml(topYT?.artwork_url || "")}" alt="" class="w-16 h-16 rounded-xl object-cover border border-white/10 shadow-md flex-shrink-0" />
          <div class="min-w-0 flex-1">
            <h3 class="text-base font-extrabold truncate">${escapeHtml(topYT?.title || "")}</h3>
            <p class="text-xs font-semibold text-amber-400 truncate cursor-pointer hover:underline"
               onclick="window.HB.filterByArtist('${escapeHtml(topYT?.artist_canonical || "")}')">
              ${escapeHtml(topYT?.artist || "")}
            </p>
            <p class="text-xs text-[var(--text-secondary)] mt-1">
              Неделя: <strong class="text-[var(--text-primary)]">${fmtNum(topYT?.yt_weekly_streams)}</strong> • Всего: <strong class="text-[var(--text-primary)]">${fmtCompact(topYT?.youtube_views)}</strong>
            </p>
          </div>
        </div>
        <div class="flex items-center gap-2 mt-3 pt-2.5 border-t border-[var(--border-subtle)]">
          <button onclick="window.HB.playTrackById('${escapeHtml(topYT?.id || "")}')"
                  class="flex-1 py-1.5 px-3 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition cursor-pointer">
            ▶ Слушать
          </button>
          <button onclick="window.HB.openVideoById('${escapeHtml(topYT?.id || "")}')"
                  class="py-1.5 px-3 rounded-lg text-xs font-semibold bg-white/10 hover:bg-white/20 text-amber-300 transition cursor-pointer">
            🎬 Клип
          </button>
        </div>
      </div>

      <!-- Card 3: Fastest Risers of the Week -->
      <div class="hb-card p-4 flex flex-col justify-between">
        <div class="flex items-center justify-between gap-2 mb-2">
          <span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-violet-500/20 text-violet-300 border border-violet-500/30">
            🚀 Главные взлёты недели
          </span>
          <button onclick="window.HB.switchTab('radar'); window.HB.setSignalFilter('riser');"
                  class="text-xs text-violet-300 hover:underline cursor-pointer">Все взлёты →</button>
        </div>
        <div class="space-y-1.5 my-1">
          ${risers
            .map(
              (r) => `
            <div onclick="window.HB.playTrackById('${escapeHtml(r.id)}')"
                 class="flex items-center justify-between gap-2 px-2 py-1 rounded-lg hover:bg-white/5 cursor-pointer text-xs">
              <span class="truncate font-medium"><strong class="text-[var(--text-primary)]">${escapeHtml(r.artist)}</strong> — ${escapeHtml(r.title)}</span>
              <span class="text-emerald-400 font-bold flex-shrink-0">▲ ${escapeHtml(r.apple_delta)}</span>
            </div>
          `
            )
            .join("")}
        </div>
        <div class="text-xs text-[var(--text-muted)] pt-2 border-t border-[var(--border-subtle)]">
          Динамика позиций в Apple Music AM Top 200
        </div>
      </div>

      <!-- Card 4: Unfiltered New Releases Firehose (0+ Views) -->
      <div class="hb-card p-4 flex flex-col justify-between border border-emerald-500/30 bg-emerald-950/10">
        <div class="flex items-center justify-between gap-2 mb-2">
          <span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
            📡 Поток новинок 0+ (${fhAll.length})
          </span>
          <span class="text-[11px] text-emerald-300 font-semibold">Без цензуры чартов</span>
        </div>
        <div class="space-y-1.5 my-1">
          ${fhMicroSample
            .map(
              (m) => `
            <div onclick="window.HB.switchTab('firehose'); window.HB.playFirehoseById('${escapeHtml(m.id)}');"
                 class="flex items-center justify-between gap-2 px-2 py-1 rounded-lg hover:bg-white/5 cursor-pointer text-xs">
              <span class="truncate font-medium"><strong class="text-[var(--text-primary)]">${escapeHtml(m.artist)}</strong> — ${escapeHtml(m.title)}</span>
              <span class="text-amber-300 font-semibold flex-shrink-0">${m.views > 0 ? m.views + " просм." : "Сингл"}</span>
            </div>
          `
            )
            .join("")}
        </div>
        <div class="pt-2 border-t border-[var(--border-subtle)]">
          <button onclick="window.HB.switchTab('firehose')"
                  class="w-full py-1.5 px-3 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition cursor-pointer">
            📡 Открыть все ${fhAll.length} новинок (от 0 просм.) →
          </button>
        </div>
      </div>
    `;
  }

  function renderQuickArtistPills() {
    const container = document.getElementById("quick-artist-pills");
    if (!container || !STATE.data) return;

    const artists = (STATE.data.artists || []).slice(0, 14);
    let html = `
      <span class="text-xs font-semibold text-[var(--text-muted)] mr-1 flex-shrink-0">Топ-артисты:</span>
      <button onclick="window.HB.filterByArtist('all')"
              class="chip-btn ${STATE.artistFilter === "all" ? "active" : ""}">
        Все (${(STATE.data.tracks || []).length})
      </button>
    `;

    for (const a of artists) {
      const isAct = STATE.artistFilter.toLowerCase() === a.name.toLowerCase();
      html += `
        <button onclick="window.HB.filterByArtist('${escapeHtml(a.name)}')"
                class="chip-btn ${isAct ? "active" : ""}">
          <span>${escapeHtml(a.name)}</span>
          <span class="px-1.5 py-0.2 rounded-full text-[11px] bg-black/25">${a.tracks_count}</span>
        </button>
      `;
    }
    container.innerHTML = html;
  }

  // =========================================================================
  // FILTERING & SORTING ENGINE FOR RADAR TRACKS
  // =========================================================================

  function getFilteredRadarTracks() {
    if (!STATE.data || !STATE.data.tracks) return [];
    let list = [...STATE.data.tracks];

    if (STATE.localOnly) {
      list = list.filter((t) => !t.is_diaspora);
    }

    if (STATE.sceneFilter !== "all") {
      list = list.filter((t) => t.scene_id === STATE.sceneFilter);
    }

    if (STATE.signalFilter !== "all") {
      list = list.filter((t) => (t.badges || []).some((b) => b.id === STATE.signalFilter));
    }

    if (STATE.artistFilter !== "all") {
      const af = STATE.artistFilter.toLowerCase();
      list = list.filter(
        (t) =>
          (t.artist_canonical || "").toLowerCase() === af ||
          (t.artist || "").toLowerCase().includes(af)
      );
    }

    if (STATE.searchQuery.trim() !== "") {
      const q = STATE.searchQuery.trim().toLowerCase();
      list = list.filter(
        (t) =>
          (t.artist || "").toLowerCase().includes(q) ||
          (t.title || "").toLowerCase().includes(q) ||
          (t.artist_canonical || "").toLowerCase().includes(q) ||
          (t.scene || "").toLowerCase().includes(q)
      );
    }

    // Sort
    if (STATE.sortBy === "score") {
      list.sort((a, b) => b.trend_score - a.trend_score || (b.yt_weekly_streams || 0) - (a.yt_weekly_streams || 0));
    } else if (STATE.sortBy === "apple") {
      list.sort((a, b) => (a.apple_pos || 999) - (b.apple_pos || 999));
    } else if (STATE.sortBy === "yt_weekly") {
      list.sort((a, b) => (b.yt_weekly_streams || 0) - (a.yt_weekly_streams || 0) || (b.youtube_views || 0) - (a.youtube_views || 0));
    } else if (STATE.sortBy === "yt_total") {
      list.sort((a, b) => (b.youtube_views || 0) - (a.youtube_views || 0));
    } else if (STATE.sortBy === "fresh") {
      list.sort((a, b) => {
        const aFresh = (a.badges || []).some((x) => x.id === "fresh") ? 1 : 0;
        const bFresh = (b.badges || []).some((x) => x.id === "fresh") ? 1 : 0;
        if (bFresh !== aFresh) return bFresh - aFresh;
        return (b.release_date || "").localeCompare(a.release_date || "");
      });
    }

    return list;
  }

  // =========================================================================
  // RENDERING: TAB 1 — ГЛАВНЫЙ РАДАР (GRID & TABLE)
  // =========================================================================

  function renderRadarTab() {
    const container = document.getElementById("radar-tracks-container");
    if (!container) return;

    const tracks = getFilteredRadarTracks();
    const countEl = document.getElementById("visible-tracks-count");
    if (countEl) countEl.textContent = String(tracks.length);

    if (tracks.length === 0) {
      container.innerHTML = `
        <div class="hb-card p-10 text-center space-y-3">
          <div class="text-3xl">🔍</div>
          <h3 class="text-base font-bold">По выбранным фильтрам треков не найдено</h3>
          <p class="text-xs text-[var(--text-secondary)]">Попробуйте сбросить фильтры или используйте кнопку «🌐 Живой поиск в YouTube & Apple Music» выше.</p>
          <button onclick="window.HB.resetAllFilters()"
                  class="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 text-white cursor-pointer">
            Сбросить все фильтры
          </button>
        </div>
      `;
      return;
    }

    if (STATE.viewMode === "grid") {
      container.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          ${tracks.map((t, idx) => renderTrackCardHtml(t, idx + 1)).join("")}
        </div>
      `;
    } else {
      container.innerHTML = renderTracksTableHtml(tracks);
    }
  }

  function renderTrackCardHtml(t, displayRank) {
    const isPlayingThis = STATE.currentTrack && STATE.currentTrack.id === t.id && STATE.isPlaying;
    const fav = isFavorite(t.id);
    const cover = t.artwork_url || t.youtube_thumbnail || "https://via.placeholder.com/300x300?text=HAYBEAT";

    const appleMetric = t.apple_pos
      ? `<div class="px-2.5 py-1 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs flex items-center gap-1.5">
           <span>🍎 Apple AM:</span>
           <strong class="text-[var(--text-primary)]">#${t.apple_pos}</strong>
           ${formatDeltaBadge(t.apple_delta)}
         </div>`
      : "";

    const ytWeeklyMetric = t.yt_pos
      ? `<div class="px-2.5 py-1 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs flex items-center gap-1.5">
           <span>▶️ YT AM:</span>
           <strong class="text-amber-400">#${t.yt_pos}</strong>
           <span class="text-[var(--text-secondary)]">(${fmtCompact(t.yt_weekly_streams)}/нед)</span>
         </div>`
      : "";

    const itunesMetric = t.itunes_pos
      ? `<div class="px-2.5 py-1 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs flex items-center gap-1.5">
           <span>💿 iTunes AM:</span>
           <strong class="text-cyan-400">#${t.itunes_pos}</strong>
         </div>`
      : "";

    const ytTotalMetric = t.youtube_views
      ? `<div class="px-2.5 py-1 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs flex items-center gap-1.5">
           <span>👁 Всего YT:</span>
           <strong class="text-[var(--text-primary)]">${fmtCompact(t.youtube_views)}</strong>
           ${t.youtube_published ? `<span class="text-[var(--text-muted)]">• ${escapeHtml(t.youtube_published)}</span>` : ""}
         </div>`
      : "";

    return `
      <div class="hb-card hb-card-interactive p-4 flex flex-col justify-between gap-3 ${isPlayingThis ? "track-is-playing" : ""}">
        <div>
          <!-- Top Bar: Rank, Badges & Score -->
          <div class="flex items-center justify-between gap-2 mb-3">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="w-7 h-7 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] flex items-center justify-center text-xs font-extrabold text-amber-400">
                #${displayRank}
              </span>
              ${(t.badges || []).slice(0, 2).map(getBadgeHtml).join("")}
            </div>
            <div class="flex items-center gap-1.5">
              <span class="score-pill ${getScoreClass(t.trend_score)}" title="Индекс тренда HayBeat (0-99)">
                ⚡ ${t.trend_score}
              </span>
              <button onclick="window.HB.toggleFavorite('${escapeHtml(t.id)}', event)"
                      class="w-7 h-7 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] flex items-center justify-center text-sm hover:border-amber-500/40 cursor-pointer"
                      title="${fav ? "Убрать из избранного" : "Добавить в мою коллекцию"}">
                ${fav ? "⭐" : "☆"}
              </button>
            </div>
          </div>

          <!-- Track Main Identity -->
          <div class="flex items-center gap-3.5">
            <div class="cover-wrap w-20 h-20 ${isPlayingThis ? "active-cover" : ""} cursor-pointer"
                 onclick="window.HB.playTrackById('${escapeHtml(t.id)}')">
              <img src="${escapeHtml(cover)}" alt="" loading="lazy" class="w-20 h-20 object-cover rounded-xl border border-white/10" />
              <div class="cover-overlay">
                ${
                  isPlayingThis
                    ? `<div class="eq-bars"><span class="eq-bar"></span><span class="eq-bar"></span><span class="eq-bar"></span></div>`
                    : `<span class="w-10 h-10 rounded-full bg-rose-600/95 text-white flex items-center justify-center font-bold shadow-lg">▶</span>`
                }
              </div>
            </div>

            <div class="min-w-0 flex-1">
              <h3 class="text-base font-bold leading-snug truncate" title="${escapeHtml(t.title)}">
                ${escapeHtml(t.title)}
              </h3>
              <p class="text-sm font-semibold text-amber-400 hover:underline cursor-pointer truncate mt-0.5"
                 onclick="window.HB.filterByArtist('${escapeHtml(t.artist_canonical)}')">
                ${escapeHtml(t.artist)}
              </p>
              <div class="flex items-center gap-2 mt-1.5 flex-wrap">
                <span class="px-2 py-0.5 rounded text-xs bg-white/5 text-[var(--text-secondary)] border border-[var(--border-subtle)]">
                  ${escapeHtml(t.scene)}
                </span>
                ${
                  t.release_date
                    ? `<span class="text-xs text-[var(--text-muted)]">📅 ${escapeHtml(t.release_date)}</span>`
                    : ""
                }
              </div>
            </div>
          </div>

          <!-- Platform Metrics Pills -->
          <div class="flex flex-wrap gap-1.5 mt-3.5">
            ${appleMetric}
            ${ytWeeklyMetric}
            ${itunesMetric}
            ${ytTotalMetric}
          </div>
        </div>

        <!-- Bottom Action Buttons -->
        <div class="flex items-center justify-between gap-2 pt-3 border-t border-[var(--border-subtle)]">
          <button onclick="window.HB.playTrackById('${escapeHtml(t.id)}')"
                  class="flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                    isPlayingThis
                      ? "bg-amber-500 text-slate-950"
                      : "bg-rose-600/90 hover:bg-rose-500 text-white"
                  }">
            <span>${isPlayingThis ? "⏸ Пауза" : "▶ Слушать превью"}</span>
          </button>

          ${
            t.youtube_video_id
              ? `<button onclick="window.HB.openVideoById('${escapeHtml(t.id)}')"
                         class="py-2 px-3 rounded-xl text-xs font-semibold bg-[var(--bg-elevated)] hover:bg-white/10 text-amber-300 border border-[var(--border-subtle)] transition cursor-pointer flex items-center gap-1">
                   <span>🎬</span>
                   <span>Клип</span>
                 </button>`
              : ""
          }

          ${
            t.youtube_url
              ? `<a href="${escapeHtml(t.youtube_url)}" target="_blank" rel="noopener"
                    class="py-2 px-2.5 rounded-xl text-xs bg-[var(--bg-elevated)] hover:bg-white/10 text-[var(--text-secondary)] border border-[var(--border-subtle)] transition"
                    title="Открыть на YouTube">↗</a>`
              : ""
          }
        </div>
      </div>
    `;
  }

  function renderTracksTableHtml(tracks) {
    return `
      <div class="hb-card overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="border-b border-[var(--border-subtle)] text-xs font-bold uppercase text-[var(--text-muted)] bg-[var(--bg-elevated)]">
              <th class="py-3 px-4 w-12">#</th>
              <th class="py-3 px-4">Трек и Артист</th>
              <th class="py-3 px-4">Сцена / Статус</th>
              <th class="py-3 px-4 text-center">🍎 Apple AM</th>
              <th class="py-3 px-4 text-right">▶️ YouTube AM (нед.)</th>
              <th class="py-3 px-4 text-right">👁 Всего на YouTube</th>
              <th class="py-3 px-4 text-center">⚡ Индекс</th>
              <th class="py-3 px-4 text-right">Действия</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[var(--border-subtle)] text-sm">
            ${tracks
              .map((t, i) => {
                const isPlayingThis = STATE.currentTrack && STATE.currentTrack.id === t.id && STATE.isPlaying;
                const fav = isFavorite(t.id);
                return `
                  <tr class="hover:bg-white/5 transition ${isPlayingThis ? "bg-amber-500/10" : ""}">
                    <td class="py-3 px-4 font-bold text-amber-400">${i + 1}</td>
                    <td class="py-3 px-4">
                      <div class="flex items-center gap-3">
                        <img src="${escapeHtml(t.artwork_url || t.youtube_thumbnail || "")}" alt="" class="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                        <div class="min-w-0">
                          <div class="font-bold truncate max-w-xs">${escapeHtml(t.title)}</div>
                          <div class="text-xs text-amber-400 cursor-pointer hover:underline"
                               onclick="window.HB.filterByArtist('${escapeHtml(t.artist_canonical)}')">
                            ${escapeHtml(t.artist)}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td class="py-3 px-4">
                      <div class="flex flex-col gap-1 items-start">
                        <span class="text-xs text-[var(--text-secondary)]">${escapeHtml(t.scene)}</span>
                        ${getBadgeHtml(t.primary_badge)}
                      </div>
                    </td>
                    <td class="py-3 px-4 text-center">
                      ${
                        t.apple_pos
                          ? `<span class="font-bold">#${t.apple_pos}</span> <span class="ml-1">${formatDeltaBadge(t.apple_delta)}</span>`
                          : `<span class="text-[var(--text-muted)]">—</span>`
                      }
                    </td>
                    <td class="py-3 px-4 text-right">
                      ${
                        t.yt_pos
                          ? `<div class="font-bold text-amber-400">#${t.yt_pos} • ${fmtNum(t.yt_weekly_streams)}</div>
                             <div class="text-xs text-[var(--text-secondary)]">${t.yt_weeks} нед. в чарте</div>`
                          : `<span class="text-[var(--text-muted)]">—</span>`
                      }
                    </td>
                    <td class="py-3 px-4 text-right">
                      ${
                        t.youtube_views
                          ? `<div class="font-semibold">${fmtCompact(t.youtube_views)}</div>
                             <div class="text-xs text-[var(--text-muted)]">${escapeHtml(t.youtube_published || "")}</div>`
                          : `<span class="text-[var(--text-muted)]">—</span>`
                      }
                    </td>
                    <td class="py-3 px-4 text-center">
                      <span class="score-pill ${getScoreClass(t.trend_score)}">${t.trend_score}</span>
                    </td>
                    <td class="py-3 px-4 text-right whitespace-nowrap">
                      <button onclick="window.HB.playTrackById('${escapeHtml(t.id)}')"
                              class="px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white mr-1.5 cursor-pointer">
                        ${isPlayingThis ? "⏸" : "▶"}
                      </button>
                      ${
                        t.youtube_video_id
                          ? `<button onclick="window.HB.openVideoById('${escapeHtml(t.id)}')"
                                     class="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white/10 hover:bg-white/20 text-amber-300 mr-1.5 cursor-pointer">
                               🎬
                             </button>`
                          : ""
                      }
                      <button onclick="window.HB.toggleFavorite('${escapeHtml(t.id)}', event)"
                              class="px-2 py-1.5 rounded-lg text-xs bg-white/5 hover:bg-white/15 cursor-pointer">
                        ${fav ? "⭐" : "☆"}
                      </button>
                    </td>
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  // =========================================================================
  // RENDERING: TAB 2 — ЧАРТЫ ПЛАТФОРМ (APPLE MUSIC / YOUTUBE / ITUNES AM)
  // =========================================================================

  function findEnrichedMatch(artist, title) {
    if (!STATE.data || !STATE.data.tracks) return null;
    const al = (artist || "").toLowerCase();
    const tl = (title || "").toLowerCase();
    return STATE.data.tracks.find(
      (t) =>
        (t.artist.toLowerCase() === al && t.title.toLowerCase() === tl) ||
        (t.artist.toLowerCase().includes(al) && t.title.toLowerCase().includes(tl))
    );
  }

  function renderPlatformChart() {
    const container = document.getElementById("platform-chart-container");
    if (!container || !STATE.data || !STATE.data.raw_charts) return;

    const armOnlyChk = document.getElementById("chk-chart-armenian-only");
    const onlyArmenian = armOnlyChk ? armOnlyChk.checked : true;

    let rows = [];
    let titleHeader = "";
    const isYT = STATE.platformChart === "youtube";

    if (STATE.platformChart === "apple") {
      rows = STATE.data.raw_charts.apple_am_top100 || [];
      titleHeader = "🍎 Официальный чарт Apple Music Армения (Top 100)";
    } else if (STATE.platformChart === "youtube") {
      rows = STATE.data.raw_charts.youtube_am_top20 || [];
      titleHeader = "▶️ Официальный чарт YouTube Армения (Weekly Music Insights Top 20)";
    } else {
      rows = STATE.data.raw_charts.itunes_am_top20 || [];
      titleHeader = "💿 Чарт цифровых покупок iTunes Армения";
    }

    if (onlyArmenian) {
      rows = rows.filter((r) => r.is_armenian);
    }

    container.innerHTML = `
      <div class="px-5 py-4 border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)] flex flex-wrap items-center justify-between gap-2">
        <h3 class="text-base font-bold">${titleHeader}</h3>
        <span class="text-xs text-[var(--text-secondary)]">Показано позиций: <strong>${rows.length}</strong></span>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="border-b border-[var(--border-subtle)] text-xs font-bold uppercase text-[var(--text-muted)]">
              <th class="py-3 px-4 w-16">Поз.</th>
              <th class="py-3 px-4 w-20">Динамика</th>
              <th class="py-3 px-4">Артист и Трек</th>
              <th class="py-3 px-4">Сцена / Маркер</th>
              ${
                isYT
                  ? `<th class="py-3 px-4 text-center">Недель в топе</th>
                     <th class="py-3 px-4 text-right">Просмотры за нед.</th>
                     <th class="py-3 px-4 text-right">Прирост за нед.</th>`
                  : ""
              }
              <th class="py-3 px-4 text-right">Слушать / Клип</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[var(--border-subtle)] text-sm">
            ${rows
              .map((r) => {
                const match = findEnrichedMatch(r.artist, r.title);
                return `
                  <tr class="hover:bg-white/5 transition ${r.is_armenian ? "bg-amber-500/[0.03]" : ""}">
                    <td class="py-3 px-4 font-extrabold text-base ${r.pos <= 5 ? "text-amber-400" : ""}">#${r.pos}</td>
                    <td class="py-3 px-4">${formatDeltaBadge(r.delta)}</td>
                    <td class="py-3 px-4">
                      <div class="flex items-center gap-3">
                        ${
                          match && match.artwork_url
                            ? `<img src="${escapeHtml(match.artwork_url)}" class="w-10 h-10 rounded-lg object-cover flex-shrink-0" />`
                            : `<div class="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center text-xs font-bold">♪</div>`
                        }
                        <div>
                          <div class="font-bold">${escapeHtml(r.title)}</div>
                          <div class="text-xs text-[var(--text-secondary)]">${escapeHtml(r.artist)}</div>
                        </div>
                      </div>
                    </td>
                    <td class="py-3 px-4">
                      ${
                        r.is_armenian
                          ? `<span class="px-2 py-0.5 rounded-md text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                               🇦🇲 ${escapeHtml(r.scene)}
                             </span>`
                          : `<span class="text-xs text-[var(--text-muted)]">Мировой / СНГ релиз</span>`
                      }
                    </td>
                    ${
                      isYT
                        ? `<td class="py-3 px-4 text-center text-xs font-semibold">${r.weeks} нед. (пик #${r.peak} ${escapeHtml(r.peak_times || "")})</td>
                           <td class="py-3 px-4 text-right font-bold text-amber-400">${fmtNum(r.weekly_streams)}</td>
                           <td class="py-3 px-4 text-right text-xs font-bold ${
                             r.weekly_streams_delta > 0 ? "text-emerald-400" : "text-[var(--text-secondary)]"
                           }">
                             ${r.weekly_streams_delta > 0 ? "+" + fmtNum(r.weekly_streams_delta) : r.weekly_streams_delta < 0 ? fmtNum(r.weekly_streams_delta) : "NEW"}
                           </td>`
                        : ""
                    }
                    <td class="py-3 px-4 text-right whitespace-nowrap">
                      ${
                        match
                          ? `<button onclick="window.HB.playTrackById('${escapeHtml(match.id)}')"
                                     class="px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white mr-1.5 cursor-pointer">
                               ▶ Превью
                             </button>
                             ${
                               match.youtube_video_id
                                 ? `<button onclick="window.HB.openVideoById('${escapeHtml(match.id)}')"
                                            class="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white/10 hover:bg-white/20 text-amber-300 cursor-pointer">
                                      🎬 Клип
                                    </button>`
                                 : ""
                             }`
                          : `<button onclick="window.HB.quickWebPlay('${escapeHtml(r.artist + " " + r.title)}')"
                                     class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/10 hover:bg-white/20 text-[var(--text-primary)] cursor-pointer">
                               🌐 Найти и включить
                             </button>`
                      }
                    </td>
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  // =========================================================================
  // RENDERING: TAB 1.5 — ВСЕ НОВИНКИ 0+ (НЕФИЛЬТРОВАННЫЙ ПОТОК ИЗ ВСЕХ ИСТОЧНИКОВ)
  // =========================================================================

  function getTierPillClass(tierId) {
    if (tierId === "micro") return "bg-emerald-500/20 text-emerald-300 border-emerald-500/40";
    if (tierId === "underground") return "bg-cyan-500/20 text-cyan-300 border-cyan-500/40";
    if (tierId === "mid") return "bg-amber-500/20 text-amber-300 border-amber-500/40";
    return "bg-rose-500/20 text-rose-300 border-rose-500/40";
  }

  function getSourcePillClass(srcId) {
    if (srcId === "yt_today") return "bg-rose-500/20 text-rose-300 border-rose-500/40";
    if (srcId === "itunes_am_new") return "bg-pink-500/20 text-pink-300 border-pink-500/40";
    if (srcId === "deezer_indie") return "bg-violet-500/20 text-violet-300 border-violet-500/40";
    if (srcId === "yt_underground") return "bg-cyan-500/20 text-cyan-300 border-cyan-500/40";
    return "bg-white/10 text-[var(--text-secondary)] border-white/15";
  }

  function getFilteredFirehoseItems() {
    if (!STATE.data || !STATE.data.firehose_releases) return [];
    let base = [...STATE.data.firehose_releases];

    if (STATE.fhHideMixes) {
      base = base.filter((x) => !x.is_mix);
    }
    if (STATE.fhHideAi) {
      base = base.filter((x) => !x.is_ai);
    }
    if (STATE.fhSource !== "all") {
      base = base.filter((x) => x.source_id === STATE.fhSource);
    }

    const q = (STATE.fhSearch || STATE.searchQuery || "").trim().toLowerCase();
    if (q) {
      base = base.filter(
        (x) =>
          (x.artist || "").toLowerCase().includes(q) ||
          (x.title || "").toLowerCase().includes(q) ||
          (x.full_title || "").toLowerCase().includes(q) ||
          (x.channel || "").toLowerCase().includes(q) ||
          (x.genre || "").toLowerCase().includes(q) ||
          (x.source_label || "").toLowerCase().includes(q)
      );
    }

    // Update tier badge counters before applying tier filter
    const counts = { all: base.length, micro: 0, underground: 0, mid: 0, major: 0 };
    base.forEach((x) => {
      if (counts[x.tier_id] !== undefined) counts[x.tier_id]++;
    });
    ["all", "micro", "underground", "mid", "major"].forEach((k) => {
      const el = document.getElementById(`fh-count-${k}`);
      if (el) el.textContent = String(counts[k] || 0);
    });

    if (STATE.fhTier !== "all") {
      base = base.filter((x) => x.tier_id === STATE.fhTier);
    }

    // Sort
    if (STATE.fhSort === "newest") {
      base.sort((a, b) => a.age_hours - b.age_hours || a.views - b.views);
    } else if (STATE.fhSort === "yt_views_asc") {
      base.sort((a, b) => {
        const aYt = a.platform === "YouTube" ? 0 : 1;
        const bYt = b.platform === "YouTube" ? 0 : 1;
        if (aYt !== bYt) return aYt - bYt;
        return a.views - b.views || a.age_hours - b.age_hours;
      });
    } else if (STATE.fhSort === "views_asc") {
      base.sort((a, b) => a.views - b.views || a.age_hours - b.age_hours);
    } else if (STATE.fhSort === "views_desc") {
      base.sort((a, b) => b.views - a.views || a.age_hours - b.age_hours);
    }

    return base;
  }

  function renderFirehoseCardHtml(item, idx) {
    const isPlayingThis = STATE.currentTrack && STATE.currentTrack.id === item.id && STATE.isPlaying;
    const tierCls = getTierPillClass(item.tier_id);
    const srcCls = getSourcePillClass(item.source_id);
    const extUrl = item.youtube_url || item.apple_music_url || item.deezer_url || "";

    return `
      <div class="hb-card hb-card-interactive p-4 flex flex-col justify-between gap-3 relative ${
        isPlayingThis ? "ring-2 ring-emerald-400" : ""
      }">
        <div>
          <!-- Top Source & Views Scale Row -->
          <div class="flex items-center justify-between gap-1.5 mb-2.5 flex-wrap">
            <span class="px-2 py-0.5 rounded-md text-[11px] font-bold border ${srcCls}">
              ${escapeHtml(item.source_label)}
            </span>
            <span class="px-2 py-0.5 rounded-md text-[11px] font-bold border ${tierCls}">
              ${escapeHtml(item.tier_label)}
            </span>
          </div>

          <!-- Cover + Track Metadata -->
          <div class="flex items-start gap-3.5">
            <div class="relative w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 border border-white/10 bg-black cursor-pointer group"
                 onclick="${
                   item.youtube_video_id
                     ? `window.HB.openFirehoseVideo('${escapeHtml(item.id)}')`
                     : `window.HB.playFirehoseById('${escapeHtml(item.id)}')`
                 }">
              <img src="${escapeHtml(item.artwork_url || "")}" alt="" loading="lazy"
                   class="w-full h-full object-cover group-hover:scale-105 transition" />
              <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                <span class="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center font-bold shadow">
                  ${item.youtube_video_id ? "🎬" : "▶"}
                </span>
              </div>
              ${
                item.duration_text
                  ? `<span class="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/80 text-[10px] font-mono text-white">${escapeHtml(
                      item.duration_text
                    )}</span>`
                  : ""
              }
            </div>

            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5">
                <span class="text-[11px] font-bold text-[var(--text-muted)]">#${idx}</span>
                <span class="text-xs font-bold text-amber-400 truncate">${escapeHtml(item.artist)}</span>
                ${
                  item.is_ai
                    ? `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">🤖 AI</span>`
                    : ""
                }
              </div>
              <h3 class="text-sm sm:text-base font-extrabold leading-snug line-clamp-2 mt-0.5" title="${escapeHtml(item.full_title)}">
                ${escapeHtml(item.title)}
              </h3>
              <div class="text-[11px] text-[var(--text-muted)] truncate mt-1">
                Канал / Источник: <strong class="text-[var(--text-secondary)]">${escapeHtml(item.channel)}</strong> • ${escapeHtml(item.genre)}
              </div>
            </div>
          </div>

          <!-- Published Time & Views Telemetry Box -->
          <div class="grid grid-cols-2 gap-2 mt-3 p-2.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs">
            <div>
              <div class="text-[10px] uppercase text-[var(--text-muted)]">Когда вышло</div>
              <div class="font-bold text-emerald-300 truncate mt-0.5">🕒 ${escapeHtml(item.published_text)}</div>
            </div>
            <div>
              <div class="text-[10px] uppercase text-[var(--text-muted)]">Просмотры / Статус</div>
              <div class="font-bold text-[var(--text-primary)] truncate mt-0.5">
                👁 ${item.views > 0 ? fmtNum(item.views) + " просм." : escapeHtml(item.views_text)}
              </div>
            </div>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="flex items-center gap-2 pt-1">
          <button onclick="window.HB.playFirehoseById('${escapeHtml(item.id)}')"
                  class="flex-1 py-2 px-3 rounded-xl text-xs font-bold ${
                    isPlayingThis
                      ? "bg-amber-500 text-slate-950"
                      : "bg-emerald-600 hover:bg-emerald-500 text-white"
                  } transition cursor-pointer">
            ${isPlayingThis ? "⏸ Играет" : item.preview_url ? "▶ Слушать (30с)" : "▶ Слушать"}
          </button>
          ${
            item.youtube_video_id
              ? `<button onclick="window.HB.openFirehoseVideo('${escapeHtml(item.id)}')"
                         class="py-2 px-3 rounded-xl text-xs font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 transition cursor-pointer">
                   🎬 Клип
                 </button>`
              : ""
          }
          ${
            extUrl
              ? `<a href="${escapeHtml(extUrl)}" target="_blank" rel="noopener"
                    class="py-2 px-2.5 rounded-xl text-xs bg-[var(--bg-elevated)] hover:bg-white/10 text-[var(--text-secondary)] border border-[var(--border-subtle)] transition"
                    title="Открыть оригинал">↗</a>`
              : ""
          }
        </div>
      </div>
    `;
  }

  function renderFirehoseTableHtml(items) {
    return `
      <div class="hb-card overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="border-b border-[var(--border-subtle)] text-xs font-bold uppercase text-[var(--text-muted)] bg-[var(--bg-elevated)]">
              <th class="py-3 px-4 w-12">#</th>
              <th class="py-3 px-4">Когда вышло</th>
              <th class="py-3 px-4">Артист и Новая Песня</th>
              <th class="py-3 px-4">Источник и Жанр</th>
              <th class="py-3 px-4 text-right">Просмотры / Масштаб</th>
              <th class="py-3 px-4 text-right">Слушать / Видео</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[var(--border-subtle)] text-sm">
            ${items
              .map((item, i) => {
                const isPlayingThis = STATE.currentTrack && STATE.currentTrack.id === item.id && STATE.isPlaying;
                const tierCls = getTierPillClass(item.tier_id);
                const extUrl = item.youtube_url || item.apple_music_url || item.deezer_url || "";
                return `
                  <tr class="hover:bg-white/5 transition ${isPlayingThis ? "bg-emerald-500/10" : ""}">
                    <td class="py-3 px-4 font-bold text-[var(--text-muted)]">${i + 1}</td>
                    <td class="py-3 px-4 whitespace-nowrap">
                      <span class="text-xs font-bold text-emerald-300">🕒 ${escapeHtml(item.published_text)}</span>
                      ${
                        item.duration_text
                          ? `<div class="text-[11px] font-mono text-[var(--text-muted)]">⏱ ${escapeHtml(item.duration_text)}</div>`
                          : ""
                      }
                    </td>
                    <td class="py-3 px-4">
                      <div class="flex items-center gap-3">
                        <img src="${escapeHtml(item.artwork_url || "")}" alt="" class="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                        <div class="min-w-0">
                          <div class="font-bold truncate max-w-md" title="${escapeHtml(item.full_title)}">
                            ${escapeHtml(item.title)}
                            ${item.is_ai ? `<span class="ml-1 text-[10px] text-purple-300">[🤖 AI]</span>` : ""}
                          </div>
                          <div class="text-xs text-amber-400 font-medium truncate max-w-md">
                            ${escapeHtml(item.artist)} <span class="text-[var(--text-muted)]">• ${escapeHtml(item.channel)}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td class="py-3 px-4">
                      <div class="text-xs font-semibold">${escapeHtml(item.source_label)}</div>
                      <div class="text-[11px] text-[var(--text-muted)]">${escapeHtml(item.genre)}</div>
                    </td>
                    <td class="py-3 px-4 text-right whitespace-nowrap">
                      <div class="font-bold">${item.views > 0 ? fmtNum(item.views) + " просм." : escapeHtml(item.views_text)}</div>
                      <span class="inline-block mt-0.5 px-2 py-0.5 rounded text-[10px] font-bold border ${tierCls}">
                        ${escapeHtml(item.tier_label)}
                      </span>
                    </td>
                    <td class="py-3 px-4 text-right whitespace-nowrap">
                      <button onclick="window.HB.playFirehoseById('${escapeHtml(item.id)}')"
                              class="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white mr-1.5 cursor-pointer">
                        ${isPlayingThis ? "⏸" : "▶"}
                      </button>
                      ${
                        item.youtube_video_id
                          ? `<button onclick="window.HB.openFirehoseVideo('${escapeHtml(item.id)}')"
                                     class="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 mr-1.5 cursor-pointer">
                               🎬
                             </button>`
                          : ""
                      }
                      ${
                        extUrl
                          ? `<a href="${escapeHtml(extUrl)}" target="_blank" rel="noopener"
                                class="px-2 py-1.5 rounded-lg text-xs bg-white/5 hover:bg-white/15 text-[var(--text-secondary)]">↗</a>`
                          : ""
                      }
                    </td>
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderFirehoseTab() {
    const container = document.getElementById("firehose-container");
    if (!container || !STATE.data) return;

    const items = getFilteredFirehoseItems();
    const visCount = document.getElementById("visible-tracks-count");
    if (visCount) visCount.textContent = String(items.length);

    const totalAll = (STATE.data.firehose_releases || []).length;
    const microTotal = (STATE.data.firehose_releases || []).filter((x) => x.tier_id === "micro").length;
    const pill = document.getElementById("firehose-stats-pill");
    if (pill) {
      pill.textContent = `В базе потока: ${totalAll} релизов (из них ${microTotal} — малые/слабые релизы 0–1.5K просм. и синглы вне чартов)`;
    }

    if (items.length === 0) {
      container.innerHTML = `
        <div class="hb-card p-10 text-center space-y-3">
          <div class="text-3xl">📡</div>
          <h3 class="text-base font-bold">По выбранным фильтрам новинок не найдено</h3>
          <p class="text-xs text-[var(--text-secondary)]">Попробуйте переключить масштаб на «Все новинки» или сбросить фильтр источника.</p>
          <button onclick="window.HB.setFirehoseTier('all'); window.HB.setFirehoseSource('all'); window.HB.setFirehoseSearch('');"
                  class="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 text-white cursor-pointer">
            Показать все новинки потока
          </button>
        </div>
      `;
      return;
    }

    if (STATE.fhView === "grid") {
      container.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          ${items.map((item, idx) => renderFirehoseCardHtml(item, idx + 1)).join("")}
        </div>
      `;
    } else {
      container.innerHTML = renderFirehoseTableHtml(items);
    }
  }

  function playFirehoseById(fhId) {
    if (!STATE.data || !STATE.data.firehose_releases) return;
    const item = STATE.data.firehose_releases.find((x) => x.id === fhId);
    if (!item) return;
    const currentList = getFilteredFirehoseItems();
    playTrackObject(
      {
        id: item.id,
        artist: item.artist,
        title: item.title,
        scene: item.source_label,
        artwork_url: item.artwork_url,
        preview_url: item.preview_url,
        youtube_video_id: item.youtube_video_id,
        youtube_title: item.full_title,
        youtube_views: item.views,
        youtube_views_text: item.views_text,
        youtube_published: item.published_text,
      },
      currentList.map((x) => ({
        id: x.id,
        artist: x.artist,
        title: x.title,
        scene: x.source_label,
        artwork_url: x.artwork_url,
        preview_url: x.preview_url,
        youtube_video_id: x.youtube_video_id,
        youtube_title: x.full_title,
        youtube_views: x.views,
        youtube_views_text: x.views_text,
        youtube_published: x.published_text,
      })),
      "Поток Новинок 0+"
    );
  }

  function openFirehoseVideo(fhId) {
    if (!STATE.data || !STATE.data.firehose_releases) return;
    const item = STATE.data.firehose_releases.find((x) => x.id === fhId);
    if (!item) return;
    openVideoModal({
      id: item.id,
      artist: item.artist,
      title: item.title,
      youtube_video_id: item.youtube_video_id,
      youtube_title: item.full_title,
      youtube_views: item.views,
      youtube_views_text: item.views_text,
      youtube_published: item.published_text,
    });
  }

  function playFirehoseQueue() {
    const items = getFilteredFirehoseItems();
    const playable = items.filter((x) => x.preview_url);
    const listToUse = playable.length > 0 ? playable : items;
    if (listToUse.length === 0) return;
    STATE.currentTrack = null;
    playFirehoseById(listToUse[0].id);
    showToast(`Запущен поток новинок 0+ (${listToUse.length} релизов)`, "📡");
  }

  // =========================================================================
  // RENDERING: TAB 3 — СВЕЖИЕ РЕЛИЗЫ И КЛИПЫ 2026
  // =========================================================================

  function getFreshTracks() {
    if (!STATE.data || !STATE.data.tracks) return [];
    return STATE.data.tracks
      .filter((t) => (t.badges || []).some((b) => b.id === "fresh") || (t.release_date && t.release_date >= "2026-04-01"))
      .sort((a, b) => (b.release_date || "").localeCompare(a.release_date || "") || b.trend_score - a.trend_score);
  }

  function renderFreshTab() {
    const grid = document.getElementById("fresh-releases-grid");
    if (!grid) return;

    const freshList = getFreshTracks();
    grid.innerHTML = freshList
      .map((t) => {
        const thumb = t.youtube_thumbnail || t.artwork_url || "";
        return `
          <div class="hb-card hb-card-interactive overflow-hidden flex flex-col justify-between">
            <div>
              <div class="relative aspect-video bg-black cursor-pointer group"
                   onclick="window.HB.openVideoById('${escapeHtml(t.id)}')">
                <img src="${escapeHtml(thumb)}" alt="" loading="lazy" class="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition" />
                <div class="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent flex items-end p-3.5">
                  <div class="w-full flex items-center justify-between gap-2">
                    <span class="px-2.5 py-1 rounded-lg bg-violet-600/90 text-white text-xs font-bold shadow">
                      ✨ ${escapeHtml(t.release_date || t.youtube_published || "Премьера 2026")}
                    </span>
                    <span class="px-2.5 py-1 rounded-lg bg-black/75 text-amber-300 text-xs font-bold">
                      🎬 Смотреть клип
                    </span>
                  </div>
                </div>
              </div>

              <div class="p-4">
                <div class="flex items-center justify-between gap-2 mb-1">
                  <span class="text-xs font-semibold text-amber-400 cursor-pointer hover:underline"
                        onclick="window.HB.filterByArtist('${escapeHtml(t.artist_canonical)}')">
                    ${escapeHtml(t.artist)}
                  </span>
                  <span class="text-xs text-[var(--text-muted)]">${escapeHtml(t.scene)}</span>
                </div>
                <h3 class="text-base font-extrabold truncate">${escapeHtml(t.title)}</h3>
                <div class="flex flex-wrap items-center gap-2 mt-2.5 text-xs text-[var(--text-secondary)]">
                  ${t.apple_pos ? `<span class="px-2 py-0.5 rounded bg-white/5">🍎 Apple AM #${t.apple_pos}</span>` : ""}
                  ${t.yt_pos ? `<span class="px-2 py-0.5 rounded bg-white/5">▶️ YT AM #${t.yt_pos}</span>` : ""}
                  ${t.youtube_views ? `<span>👁 ${fmtCompact(t.youtube_views)} просм. (${escapeHtml(t.youtube_published)})</span>` : ""}
                </div>
              </div>
            </div>

            <div class="px-4 pb-4 flex items-center gap-2">
              <button onclick="window.HB.playTrackById('${escapeHtml(t.id)}')"
                      class="flex-1 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition cursor-pointer">
                ▶ Аудио-превью
              </button>
              <button onclick="window.HB.openVideoById('${escapeHtml(t.id)}')"
                      class="flex-1 py-2 rounded-xl text-xs font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 transition cursor-pointer">
                🎬 Видеоклип
              </button>
            </div>
          </div>
        `;
      })
      .join("");
  }

  // =========================================================================
  // RENDERING: TAB 4 — АРТИСТЫ И АНАЛИТИКА СЦЕН
  // =========================================================================

  function renderArtistsAndAnalyticsTab() {
    const analyticsBox = document.getElementById("scene-analytics-container");
    const artistsGrid = document.getElementById("artists-grid-container");
    if (!analyticsBox || !artistsGrid || !STATE.data) return;

    const scenes = STATE.data.scenes || [];
    const totalTracks = (STATE.data.tracks || []).length || 1;

    analyticsBox.innerHTML = `
      <!-- Scene Distribution Card -->
      <div class="hb-card p-5 lg:col-span-2 space-y-3.5">
        <h3 class="text-base font-bold flex items-center gap-2">
          <span>📊</span>
          <span>Структура трендов по музыкальным сценам Армении</span>
        </h3>
        <div class="space-y-3">
          ${scenes
            .sort((a, b) => b.count - a.count)
            .map((s) => {
              const pct = Math.round((s.count / totalTracks) * 100);
              return `
                <div class="space-y-1 cursor-pointer" onclick="window.HB.switchTab('radar'); window.HB.setSceneFilter('${escapeHtml(s.scene_id)}');">
                  <div class="flex items-center justify-between text-xs">
                    <span class="font-bold text-[var(--text-primary)] hover:text-amber-400">${escapeHtml(s.scene_name)}</span>
                    <span class="text-[var(--text-secondary)]">
                      <strong>${s.count}</strong> треков (${pct}%) • YouTube всего: <strong>${fmtCompact(s.total_yt_views)}</strong>
                    </span>
                  </div>
                  <div class="w-full h-2.5 rounded-full bg-[var(--bg-elevated)] overflow-hidden">
                    <div class="h-full rounded-full" style="width: ${pct}%; background: linear-gradient(90deg, #e11d48, #f59e0b);"></div>
                  </div>
                </div>
              `;
            })
            .join("")}
        </div>
      </div>

      <!-- Key Market Insight Card -->
      <div class="hb-card p-5 flex flex-col justify-between space-y-3">
        <div>
          <span class="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
            💡 Главный инсайт рынка
          </span>
          <h3 class="text-base font-bold mt-2.5">Два полюса прослушиваний в Армении</h3>
          <p class="text-xs text-[var(--text-secondary)] leading-relaxed mt-2">
            <strong>1. Apple Music Армения (Ереванский стриминг):</strong> доминируют новая поп-волна, R&B, инди и хип-хоп —
            <em>Sirusho (#1), Brunette (7 треков), D'Litte (8 треков), Misho (5 треков), yellowheart., Valkar & Lyov</em>.
          </p>
          <p class="text-xs text-[var(--text-secondary)] leading-relaxed mt-2">
            <strong>2. YouTube Армения (Массовый видео-трафик):</strong> безоговорочно лидируют городской поп и Kef-хиты —
            <em>Аркадий Думикян (6 клипов в Топ-20, >2 млн просм./нед), Анетт Агабекян (24 нед. в топе), Аршавир Мартиросян, Лилит Оганесян</em>.
          </p>
        </div>
        <div class="text-xs text-emerald-400 font-semibold pt-2 border-t border-[var(--border-subtle)]">
          ✓ Оба сегмента объединены в единый индекс HayBeat
        </div>
      </div>
    `;

    const artists = STATE.data.artists || [];
    artistsGrid.innerHTML = artists
      .map(
        (a) => `
        <div class="hb-card hb-card-interactive p-4 flex flex-col justify-between gap-3">
          <div>
            <div class="flex items-center gap-3.5">
              <img src="${escapeHtml(a.avatar_url || "")}" alt="" class="w-16 h-16 rounded-2xl object-cover border border-white/10 shadow flex-shrink-0" />
              <div class="min-w-0 flex-1">
                <div class="flex items-center justify-between gap-1">
                  <span class="text-xs font-extrabold text-amber-400">#${a.rank} Power Rank</span>
                  <span class="px-2 py-0.5 rounded text-[11px] font-semibold bg-white/5 text-[var(--text-secondary)]">
                    ${escapeHtml(a.origin)}
                  </span>
                </div>
                <h3 class="text-base font-extrabold truncate mt-0.5">${escapeHtml(a.name_ru)}</h3>
                <span class="inline-block text-xs text-rose-400 font-medium">${escapeHtml(a.scene)}</span>
              </div>
            </div>

            <p class="text-xs text-[var(--text-secondary)] mt-3 leading-relaxed">
              ${escapeHtml(a.bio_ru)}
            </p>

            <!-- Artist Stats Pills -->
            <div class="grid grid-cols-3 gap-2 mt-3 p-2.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-center">
              <div>
                <div class="text-xs text-[var(--text-muted)]">Треков</div>
                <div class="text-sm font-extrabold text-[var(--text-primary)]">${a.tracks_count}</div>
              </div>
              <div>
                <div class="text-xs text-[var(--text-muted)]">Лучший Чарт</div>
                <div class="text-sm font-extrabold text-amber-400">
                  ${a.best_yt_pos ? `YT #${a.best_yt_pos}` : a.best_apple_pos ? `AM #${a.best_apple_pos}` : "Радар"}
                </div>
              </div>
              <div>
                <div class="text-xs text-[var(--text-muted)]">Просмотры YT</div>
                <div class="text-sm font-extrabold text-emerald-400">${fmtCompact(a.total_yt_views)}</div>
              </div>
            </div>

            <!-- Artist Top Tracks List -->
            <div class="mt-3 space-y-1">
              <div class="text-xs font-semibold text-[var(--text-muted)]">Треки на радаре:</div>
              ${(a.top_tracks || [])
                .slice(0, 4)
                .map(
                  (tr) => `
                  <div onclick="window.HB.playTrackById('${escapeHtml(tr.id)}')"
                       class="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-[var(--bg-elevated)] hover:bg-white/10 text-xs cursor-pointer transition">
                    <span class="truncate font-medium">▶ ${escapeHtml(tr.title)}</span>
                    <span class="text-[var(--text-secondary)] flex-shrink-0">
                      ${tr.apple_pos ? `🍎#${tr.apple_pos}` : ""} ${tr.yt_pos ? `▶️#${tr.yt_pos}` : ""}
                    </span>
                  </div>
                `
                )
                .join("")}
            </div>
          </div>

          <button onclick="window.HB.filterByArtist('${escapeHtml(a.name)}')"
                  class="w-full py-2 rounded-xl text-xs font-bold bg-white/5 hover:bg-rose-600 hover:text-white border border-[var(--border-subtle)] transition cursor-pointer">
            Показать все треки артиста (${a.tracks_count}) →
          </button>
        </div>
      `
      )
      .join("");
  }

  // =========================================================================
  // RENDERING: TAB 5 — МОЯ КОЛЛЕКЦИЯ (ИЗБРАННОЕ)
  // =========================================================================

  function renderFavoritesTab() {
    const container = document.getElementById("favorites-container");
    if (!container || !STATE.data) return;

    const favTracks = STATE.favorites
      .map((id) => (STATE.data.tracks || []).find((t) => t.id === id))
      .filter(Boolean);

    if (favTracks.length === 0) {
      container.innerHTML = `
        <div class="hb-card p-10 text-center space-y-3">
          <div class="text-3xl">⭐</div>
          <h3 class="text-base font-bold">В вашей коллекции пока нет сохранённых треков</h3>
          <p class="text-xs text-[var(--text-secondary)]">Нажмите на звёздочку ☆ на любой карточке трека в «Главном Радаре», чтобы добавить его сюда.</p>
          <button onclick="window.HB.switchTab('radar')" class="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 text-white cursor-pointer">
            Перейти к Главному Радару
          </button>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        ${favTracks.map((t, idx) => renderTrackCardHtml(t, idx + 1)).join("")}
      </div>
    `;
  }

  // =========================================================================
  // AUDIO PLAYER & JSONP / API FRESH PREVIEW RESOLVER
  // =========================================================================

  const audioEl = document.getElementById("hb-audio-element");

  function setupAudioEvents() {
    if (!audioEl) return;

    audioEl.addEventListener("timeupdate", () => {
      const seek = document.getElementById("player-seek");
      const cur = document.getElementById("player-time-cur");
      const dur = document.getElementById("player-time-dur");
      if (seek && !isNaN(audioEl.duration) && audioEl.duration > 0) {
        seek.max = String(audioEl.duration);
        seek.value = String(audioEl.currentTime);
      }
      if (cur) cur.textContent = fmtTime(audioEl.currentTime);
      if (dur && !isNaN(audioEl.duration)) dur.textContent = fmtTime(audioEl.duration);
    });

    audioEl.addEventListener("play", () => {
      STATE.isPlaying = true;
      updatePlayerUI();
      renderActiveTab();
    });

    audioEl.addEventListener("pause", () => {
      STATE.isPlaying = false;
      updatePlayerUI();
      renderActiveTab();
    });

    audioEl.addEventListener("ended", () => {
      playNext();
    });

    audioEl.addEventListener("error", async () => {
      // Automatic fallback if a Deezer signed preview URL expired
      if (STATE.currentTrack && !STATE.currentTrack._retriedFreshAudio) {
        STATE.currentTrack._retriedFreshAudio = true;
        const freshUrl = await resolveFreshPreviewUrl(STATE.currentTrack.artist, STATE.currentTrack.title);
        if (freshUrl) {
          STATE.currentTrack.preview_url = freshUrl;
          audioEl.src = freshUrl;
          audioEl.play().catch(() => {});
          return;
        }
      }
      showToast("Для этого трека доступно видео — открываю клип YouTube", "🎬");
      if (STATE.currentTrack && STATE.currentTrack.youtube_video_id) {
        openVideoModal(STATE.currentTrack);
      }
    });
  }

  function fetchItunesJsonp(query) {
    return new Promise((resolve) => {
      const cbName = "hb_itunes_cb_" + Math.floor(Math.random() * 1e9);
      const script = document.createElement("script");
      const timer = setTimeout(() => {
        cleanup();
        resolve(null);
      }, 4500);

      function cleanup() {
        clearTimeout(timer);
        delete window[cbName];
        if (script.parentNode) script.parentNode.removeChild(script);
      }

      window[cbName] = (data) => {
        cleanup();
        if (data && data.results && data.results.length > 0) {
          resolve(data.results[0].previewUrl || null);
        } else {
          resolve(null);
        }
      };

      script.src = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&country=am&entity=song&limit=2&callback=${cbName}`;
      script.onerror = () => {
        cleanup();
        resolve(null);
      };
      document.body.appendChild(script);
    });
  }

  function fetchDeezerJsonp(query) {
    return new Promise((resolve) => {
      const cbName = "hb_deezer_cb_" + Math.floor(Math.random() * 1e9);
      const script = document.createElement("script");
      const timer = setTimeout(() => {
        cleanup();
        resolve(null);
      }, 4500);

      function cleanup() {
        clearTimeout(timer);
        delete window[cbName];
        if (script.parentNode) script.parentNode.removeChild(script);
      }

      window[cbName] = (data) => {
        cleanup();
        if (data && data.data && data.data.length > 0) {
          resolve(data.data[0].preview || null);
        } else {
          resolve(null);
        }
      };

      script.src = `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=2&output=jsonp&callback=${cbName}`;
      script.onerror = () => {
        cleanup();
        resolve(null);
      };
      document.body.appendChild(script);
    });
  }

  async function resolveFreshPreviewUrl(artist, title) {
    // 1. Try local backend API first
    try {
      const resp = await fetch(`/api/fresh-audio?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}`);
      if (resp.ok) {
        const d = await resp.json();
        if (d.preview_url) return d.preview_url;
      }
    } catch (e) {}

    // 2. Fallback to browser-native JSONP (works even on file://!)
    const q = `${artist} ${title}`;
    const itUrl = await fetchItunesJsonp(q);
    if (itUrl) return itUrl;
    const dzUrl = await fetchDeezerJsonp(q);
    return dzUrl;
  }

  async function playTrackObject(track, customQueue, queueName) {
    if (!track) return;
    if (customQueue && Array.isArray(customQueue)) {
      STATE.queue = customQueue;
      STATE.queueIndex = customQueue.findIndex((x) => x.id === track.id);
      if (queueName) STATE.queueLabel = queueName;
    } else if (STATE.queue.length === 0) {
      STATE.queue = getFilteredRadarTracks();
      STATE.queueIndex = STATE.queue.findIndex((x) => x.id === track.id);
    }

    // If same track clicked, toggle play/pause
    if (STATE.currentTrack && STATE.currentTrack.id === track.id && audioEl.src) {
      togglePlayPause();
      return;
    }

    STATE.currentTrack = track;
    updatePlayerUI();

    let url = track.preview_url;
    // Check if Deezer token might have expired
    if (!url || (url.includes("dzcdn.net") && url.includes("exp="))) {
      const m = url ? url.match(/exp=(\d+)/) : null;
      const nowSec = Math.floor(Date.now() / 1000);
      if (!url || (m && parseInt(m[1], 10) < nowSec + 60)) {
        const fresh = await resolveFreshPreviewUrl(track.artist, track.title);
        if (fresh) {
          url = fresh;
          track.preview_url = fresh;
        }
      }
    }

    if (!url) {
      if (track.youtube_video_id) {
        showToast("Запускаю видеоклип YouTube для этого трека", "🎬");
        openVideoModal(track);
      } else {
        showToast("Превью недоступно для данного трека", "⚠️");
      }
      return;
    }

    audioEl.src = url;
    audioEl.play().catch((err) => {
      console.warn("Audio playback error:", err);
    });
  }

  function playTrackById(trackId) {
    if (!STATE.data || !STATE.data.tracks) return;
    const t = STATE.data.tracks.find((x) => x.id === trackId);
    if (t) {
      playTrackObject(t, getFilteredRadarTracks(), "Радар");
    }
  }

  function togglePlayPause() {
    if (!audioEl) return;
    if (!STATE.currentTrack) {
      startTrendRadio();
      return;
    }
    if (audioEl.paused) {
      audioEl.play().catch(() => {});
    } else {
      audioEl.pause();
    }
  }

  function playNext() {
    if (!STATE.queue || STATE.queue.length === 0) {
      STATE.queue = getFilteredRadarTracks();
    }
    if (STATE.queue.length === 0) return;
    STATE.queueIndex = (STATE.queueIndex + 1) % STATE.queue.length;
    const nextTrack = STATE.queue[STATE.queueIndex];
    if (nextTrack) {
      STATE.currentTrack = null; // Force load
      playTrackObject(nextTrack);
    }
  }

  function playPrev() {
    if (!STATE.queue || STATE.queue.length === 0) return;
    STATE.queueIndex = (STATE.queueIndex - 1 + STATE.queue.length) % STATE.queue.length;
    const prevTrack = STATE.queue[STATE.queueIndex];
    if (prevTrack) {
      STATE.currentTrack = null;
      playTrackObject(prevTrack);
    }
  }

  function startTrendRadio() {
    const playable = getFilteredRadarTracks().filter((t) => t.preview_url);
    if (playable.length === 0) return;
    STATE.currentTrack = null;
    playTrackObject(playable[0], playable, "Радио Трендов");
    showToast(`Запущено Радио Трендов (${playable.length} треков в очереди)`, "📻");
  }

  function playFreshQueue() {
    const list = getFreshTracks().filter((t) => t.preview_url);
    if (list.length === 0) return;
    STATE.currentTrack = null;
    playTrackObject(list[0], list, "Новинки 2026");
    showToast(`Включен поток свежих релизов (${list.length} треков)`, "✨");
  }

  function playFavoritesQueue() {
    const favTracks = STATE.favorites
      .map((id) => (STATE.data.tracks || []).find((t) => t.id === id))
      .filter((t) => t && t.preview_url);
    if (favTracks.length === 0) {
      showToast("Добавьте треки в избранное для запуска плейлиста", "⭐");
      return;
    }
    STATE.currentTrack = null;
    playTrackObject(favTracks[0], favTracks, "Мой Плейлист");
    showToast(`Запущен ваш плейлист (${favTracks.length} треков)`, "⭐");
  }

  function updatePlayerUI() {
    const t = STATE.currentTrack;
    const btnPlay = document.getElementById("player-btn-play");
    const titleEl = document.getElementById("player-title");
    const artistEl = document.getElementById("player-artist");
    const coverEl = document.getElementById("player-cover");
    const badgeEl = document.getElementById("player-mode-badge");

    if (btnPlay) btnPlay.textContent = STATE.isPlaying ? "⏸" : "▶";
    if (t) {
      if (titleEl) titleEl.textContent = t.title;
      if (artistEl) artistEl.textContent = `${t.artist} • ${t.scene || "HAYBEAT"}`;
      if (coverEl && (t.artwork_url || t.youtube_thumbnail)) {
        coverEl.src = t.artwork_url || t.youtube_thumbnail;
      }
      if (badgeEl) {
        badgeEl.textContent = STATE.isPlaying ? `В эфире: ${STATE.queueLabel}` : "На паузе";
      }
    }
  }

  // =========================================================================
  // YOUTUBE VIDEO THEATER MODAL
  // =========================================================================

  function openVideoModal(track) {
    if (!track || !track.youtube_video_id) {
      showToast("Для этого трека видеоклип не найден", "⚠️");
      return;
    }
    if (audioEl && !audioEl.paused) {
      audioEl.pause();
    }

    const modal = document.getElementById("video-modal");
    const iframe = document.getElementById("modal-youtube-iframe");
    const title = document.getElementById("modal-video-title");
    const sub = document.getElementById("modal-video-subtitle");
    const footer = document.getElementById("modal-video-footer");

    if (title) title.textContent = `${track.artist} — ${track.title}`;
    if (sub) {
      sub.textContent = `${track.youtube_title || ""} • ${track.youtube_views_text || ""} • ${track.youtube_published || ""}`;
    }
    if (iframe) {
      iframe.src = `https://www.youtube.com/embed/${encodeURIComponent(track.youtube_video_id)}?autoplay=1&rel=0`;
    }
    if (footer) {
      footer.innerHTML = `
        <div class="flex items-center gap-3 flex-wrap">
          ${track.apple_pos ? `<span>🍎 Apple Music AM: <strong>#${track.apple_pos}</strong></span>` : ""}
          ${track.yt_pos ? `<span>▶️ YouTube AM: <strong>#${track.yt_pos}</strong> (${fmtNum(track.yt_weekly_streams)}/нед)</span>` : ""}
          ${track.youtube_views ? `<span>👁 Всего просмотров: <strong>${fmtNum(track.youtube_views)}</strong></span>` : ""}
        </div>
        <div class="flex items-center gap-2">
          <a href="https://www.youtube.com/watch?v=${encodeURIComponent(track.youtube_video_id)}" target="_blank" rel="noopener"
             class="px-3 py-1.5 rounded-lg bg-rose-600 text-white font-bold hover:bg-rose-500">
            Открыть на YouTube ↗
          </a>
        </div>
      `;
    }
    if (modal) modal.classList.remove("hidden");
  }

  function openVideoById(trackId) {
    if (!STATE.data) return;
    const t = (STATE.data.tracks || []).find((x) => x.id === trackId);
    if (t) {
      openVideoModal(t);
      return;
    }
    openFirehoseVideo(trackId);
  }

  function closeVideoModal() {
    const modal = document.getElementById("video-modal");
    const iframe = document.getElementById("modal-youtube-iframe");
    if (iframe) iframe.src = "";
    if (modal) modal.classList.add("hidden");
  }

  // =========================================================================
  // LIVE WEB SEARCH & LIVE DATA REFRESH
  // =========================================================================

  async function triggerLiveWebSearch(customQuery) {
    const input = document.getElementById("search-input");
    const q = (customQuery || (input ? input.value : "")).trim();
    if (!q) {
      showToast("Введите имя артиста или название песни в строку поиска", "🔍");
      if (input) input.focus();
      return;
    }

    const modal = document.getElementById("live-search-modal");
    const status = document.getElementById("live-search-status");
    const resultsBox = document.getElementById("live-search-results");
    if (!modal || !status || !resultsBox) return;

    modal.classList.remove("hidden");
    status.textContent = `Запрос «${q}» к YouTube, Apple Music AM и Deezer...`;
    resultsBox.innerHTML = `<div class="p-8 text-center text-sm text-[var(--text-secondary)]">⏳ Ищем живые результаты для «${escapeHtml(q)}»...</div>`;

    try {
      const resp = await fetch(`/api/live-search?q=${encodeURIComponent(q)}`);
      if (resp.ok) {
        const data = await resp.json();
        const items = data.results || [];
        status.textContent = `Найдено результатов для «${q}»: ${items.length}`;
        if (items.length === 0) {
          resultsBox.innerHTML = `<div class="p-6 text-center text-xs text-[var(--text-secondary)]">Ничего не найдено. Попробуйте уточнить запрос.</div>`;
          return;
        }
        window._liveSearchCache = items;
        resultsBox.innerHTML = items
          .map(
            (item, idx) => `
            <div class="p-3.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div class="flex items-center gap-3 min-w-0">
                <img src="${escapeHtml(item.artwork_url || item.youtube_thumbnail || "")}" class="w-14 h-14 rounded-xl object-cover flex-shrink-0" />
                <div class="min-w-0">
                  <div class="text-sm font-bold truncate">${escapeHtml(item.title)}</div>
                  <div class="text-xs text-amber-400 font-medium">${escapeHtml(item.artist)}</div>
                  <div class="text-xs text-[var(--text-muted)] mt-0.5">
                    ${escapeHtml(item.youtube_views_text || "")} • ${escapeHtml(item.youtube_published || "")} • ${escapeHtml(item.youtube_duration || "")}
                  </div>
                </div>
              </div>
              <div class="flex items-center gap-2 self-end sm:self-center flex-shrink-0">
                ${
                  item.preview_url
                    ? `<button onclick="window.HB.playLiveSearchItem(${idx})"
                               class="px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white cursor-pointer">
                         ▶ Аудио
                       </button>`
                    : ""
                }
                <button onclick="window.HB.openLiveSearchVideo(${idx})"
                        class="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 text-slate-950 hover:bg-amber-400 cursor-pointer">
                  🎬 Смотреть клип
                </button>
              </div>
            </div>
          `
          )
          .join("");
        return;
      }
    } catch (e) {}

    // Fallback if opened via file:// without server.py running: use iTunes JSONP
    status.textContent = `Поиск через Apple Music / iTunes Армения для «${q}»...`;
    const preview = await fetchItunesJsonp(q);
    resultsBox.innerHTML = `
      <div class="p-5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] space-y-3 text-center">
        <p class="text-sm font-semibold">Запрос: «${escapeHtml(q)}»</p>
        <div class="flex items-center justify-center gap-3">
          ${
            preview
              ? `<button onclick="window.HB.playRawPreviewUrl('${escapeHtml(preview)}', '${escapeHtml(q)}')"
                         class="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 text-white cursor-pointer">
                   ▶ Слушать найденное превью Apple Music
                 </button>`
              : ""
          }
          <a href="https://www.youtube.com/results?search_query=${encodeURIComponent(q)}" target="_blank" rel="noopener"
             class="px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 text-slate-950">
            Открыть результаты на YouTube ↗
          </a>
        </div>
      </div>
    `;
  }

  async function refreshLiveData() {
    const icon = document.getElementById("refresh-icon");
    const text = document.getElementById("refresh-text");
    if (icon) icon.classList.add("animate-spin-fast");
    if (text) text.textContent = "Обновление (~15 сек)...";
    showToast("Опрашиваем Apple Music AM, YouTube AM, iTunes и Deezer...", "🔄");

    try {
      try {
        const resp = await fetch("/api/refresh", { method: "POST" });
        if (resp.ok) {
          const res = await resp.json();
          if (res.ok && res.data) {
            if ((!res.data.firehose_releases || res.data.firehose_releases.length === 0) && STATE.data && STATE.data.firehose_releases) {
              res.data.firehose_releases = STATE.data.firehose_releases;
            }
            STATE.data = res.data;
            renderAll();
            const fhCount = (res.data.firehose_releases || []).length;
            showToast(`Данные обновлены! Чарты: ${res.data.tracks.length}, Поток новинок 0+: ${fhCount}`, "✅");
            return;
          }
        }
      } catch (e) {}

      // Fallback for cloud static hosting (e.g. GitHub Pages): fetch latest trends_data.json with cache-busting
      try {
        const cloudResp = await fetch(`data/trends_data.json?t=${Date.now()}`);
        if (cloudResp.ok) {
          const cloudData = await cloudResp.json();
          if (cloudData && cloudData.tracks) {
            if ((!cloudData.firehose_releases || cloudData.firehose_releases.length === 0) && STATE.data && STATE.data.firehose_releases) {
              cloudData.firehose_releases = STATE.data.firehose_releases;
            }
            STATE.data = cloudData;
            renderAll();
            const fhCount = (cloudData.firehose_releases || []).length;
            showToast(`Синхронизирован облачный срез! Чарты: ${cloudData.tracks.length}, Новинки 0+: ${fhCount}`, "✅");
            return;
          }
        }
      } catch (e2) {}

      showToast("Актуальный срез данных уже загружен", "✅");
    } finally {
      if (icon) icon.classList.remove("animate-spin-fast");
      if (text) text.textContent = "Обновить чарты";
    }
  }

  // =========================================================================
  // NAVIGATION & UI EVENT HANDLERS
  // =========================================================================

  function switchTab(tabId) {
    STATE.activeTab = tabId;
    document.querySelectorAll(".nav-tab").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-tab") === tabId);
    });
    ["radar", "firehose", "charts", "fresh", "artists", "favorites"].forEach((id) => {
      const panel = document.getElementById(`tab-panel-${id}`);
      if (panel) panel.classList.toggle("hidden", id !== tabId);
    });
    renderActiveTab();
  }

  function renderActiveTab() {
    if (STATE.activeTab === "radar") renderRadarTab();
    else if (STATE.activeTab === "firehose") renderFirehoseTab();
    else if (STATE.activeTab === "charts") renderPlatformChart();
    else if (STATE.activeTab === "fresh") renderFreshTab();
    else if (STATE.activeTab === "artists") renderArtistsAndAnalyticsTab();
    else if (STATE.activeTab === "favorites") renderFavoritesTab();
  }

  function renderAll() {
    renderHeaderStats();
    renderHeroSpotlights();
    renderQuickArtistPills();
    renderActiveTab();
  }

  // Expose Public API on window.HB
  window.HB = {
    switchTab,
    setFirehoseTier(tierId) {
      STATE.fhTier = tierId;
      document.querySelectorAll("[data-fh-tier]").forEach((b) => {
        b.classList.toggle("active", b.getAttribute("data-fh-tier") === tierId);
      });
      renderFirehoseTab();
    },
    setFirehoseSource(srcId) {
      STATE.fhSource = srcId;
      document.querySelectorAll("[data-fh-src]").forEach((b) => {
        b.classList.toggle("active", b.getAttribute("data-fh-src") === srcId);
      });
      renderFirehoseTab();
    },
    setFirehoseSort(val) {
      STATE.fhSort = val;
      const sel = document.getElementById("fh-sort-select");
      if (sel && sel.value !== val) sel.value = val;
      renderFirehoseTab();
    },
    setFirehoseView(mode) {
      STATE.fhView = mode;
      const gBtn = document.getElementById("fh-view-grid");
      const tBtn = document.getElementById("fh-view-table");
      if (gBtn && tBtn) {
        if (mode === "grid") {
          gBtn.className = "px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-600 text-white cursor-pointer";
          tBtn.className = "px-2.5 py-1 rounded-lg text-xs font-semibold text-[var(--text-secondary)] cursor-pointer";
        } else {
          tBtn.className = "px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-600 text-white cursor-pointer";
          gBtn.className = "px-2.5 py-1 rounded-lg text-xs font-semibold text-[var(--text-secondary)] cursor-pointer";
        }
      }
      renderFirehoseTab();
    },
    setFirehoseSearch(val) {
      STATE.fhSearch = val || "";
      const inp = document.getElementById("fh-search-input");
      if (inp && inp.value !== STATE.fhSearch) inp.value = STATE.fhSearch;
      renderFirehoseTab();
    },
    toggleFirehoseHideMixes(checked) {
      STATE.fhHideMixes = Boolean(checked);
      renderFirehoseTab();
    },
    toggleFirehoseHideAi(checked) {
      STATE.fhHideAi = Boolean(checked);
      renderFirehoseTab();
    },
    playFirehoseById,
    openFirehoseVideo,
    playFirehoseQueue,
    setSceneFilter(sceneId) {
      STATE.sceneFilter = sceneId;
      document.querySelectorAll("[data-scene]").forEach((b) => {
        b.classList.toggle("active", b.getAttribute("data-scene") === sceneId);
      });
      renderRadarTab();
    },
    setSignalFilter(sigId) {
      STATE.signalFilter = sigId;
      document.querySelectorAll("[data-signal]").forEach((b) => {
        b.classList.toggle("active", b.getAttribute("data-signal") === sigId);
      });
      renderRadarTab();
    },
    filterByArtist(artistName) {
      STATE.artistFilter = artistName;
      if (STATE.activeTab !== "radar") {
        switchTab("radar");
      } else {
        renderRadarTab();
      }
      renderQuickArtistPills();
    },
    toggleLocalOnly(checked) {
      STATE.localOnly = Boolean(checked);
      renderRadarTab();
    },
    setSortBy(val) {
      STATE.sortBy = val;
      renderRadarTab();
    },
    setViewMode(mode) {
      STATE.viewMode = mode;
      const gBtn = document.getElementById("view-btn-grid");
      const tBtn = document.getElementById("view-btn-table");
      if (gBtn && tBtn) {
        if (mode === "grid") {
          gBtn.className = "px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-600 text-white cursor-pointer";
          tBtn.className = "px-2.5 py-1 rounded-lg text-xs font-semibold text-[var(--text-secondary)] cursor-pointer";
        } else {
          tBtn.className = "px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-600 text-white cursor-pointer";
          gBtn.className = "px-2.5 py-1 rounded-lg text-xs font-semibold text-[var(--text-secondary)] cursor-pointer";
        }
      }
      renderRadarTab();
    },
    onSearchInput(val) {
      STATE.searchQuery = val || "";
      const clearBtn = document.getElementById("btn-clear-search");
      if (clearBtn) clearBtn.classList.toggle("hidden", !STATE.searchQuery);
      if (STATE.activeTab === "firehose") {
        renderFirehoseTab();
      } else if (STATE.activeTab !== "radar") {
        switchTab("radar");
      } else {
        renderRadarTab();
      }
    },
    clearSearch() {
      const input = document.getElementById("search-input");
      if (input) input.value = "";
      window.HB.onSearchInput("");
    },
    resetAllFilters() {
      STATE.sceneFilter = "all";
      STATE.signalFilter = "all";
      STATE.artistFilter = "all";
      STATE.localOnly = false;
      STATE.searchQuery = "";
      const input = document.getElementById("search-input");
      if (input) input.value = "";
      const chk = document.getElementById("chk-local-only");
      if (chk) chk.checked = false;
      document.querySelectorAll("[data-scene]").forEach((b) => b.classList.toggle("active", b.getAttribute("data-scene") === "all"));
      document.querySelectorAll("[data-signal]").forEach((b) => b.classList.toggle("active", b.getAttribute("data-signal") === "all"));
      renderAll();
    },
    setPlatformChart(src) {
      STATE.platformChart = src;
      document.querySelectorAll("[data-chart-src]").forEach((b) => {
        b.classList.toggle("active", b.getAttribute("data-chart-src") === src);
      });
      renderPlatformChart();
    },
    renderPlatformChart,
    playTrackById,
    togglePlayPause,
    playNext,
    playPrev,
    startTrendRadio,
    playFreshQueue,
    playFavoritesQueue,
    seekAudio(val) {
      if (audioEl) audioEl.currentTime = Number(val);
    },
    setVolume(val) {
      if (audioEl) audioEl.volume = Number(val);
    },
    openVideoById,
    openCurrentTrackVideo() {
      if (STATE.currentTrack && STATE.currentTrack.youtube_video_id) {
        openVideoModal(STATE.currentTrack);
      } else if (STATE.data && STATE.data.tracks && STATE.data.tracks[0]) {
        openVideoModal(STATE.data.tracks[0]);
      }
    },
    closeVideoModal,
    toggleFavorite,
    exportFavoritesText() {
      const favTracks = STATE.favorites
        .map((id) => (STATE.data.tracks || []).find((t) => t.id === id))
        .filter(Boolean);
      const text = favTracks
        .map((t, i) => `${i + 1}. ${t.artist} — ${t.title} (${t.youtube_url || ""})`)
        .join("\n");
      navigator.clipboard.writeText(text).then(() => {
        showToast("Список треков скопирован в буфер обмена!", "📋");
      });
    },
    triggerLiveWebSearch,
    quickWebPlay(q) {
      triggerLiveWebSearch(q);
    },
    closeLiveSearchModal() {
      const modal = document.getElementById("live-search-modal");
      if (modal) modal.classList.add("hidden");
    },
    playLiveSearchItem(idx) {
      const item = (window._liveSearchCache || [])[idx];
      if (!item) return;
      window.HB.closeLiveSearchModal();
      STATE.currentTrack = null;
      playTrackObject(item, window._liveSearchCache, "Живой поиск");
    },
    openLiveSearchVideo(idx) {
      const item = (window._liveSearchCache || [])[idx];
      if (!item) return;
      window.HB.closeLiveSearchModal();
      openVideoModal(item);
    },
    playRawPreviewUrl(url, title) {
      window.HB.closeLiveSearchModal();
      STATE.currentTrack = { id: "raw", artist: "Apple Music AM", title: title, preview_url: url };
      audioEl.src = url;
      audioEl.play().catch(() => {});
      updatePlayerUI();
    },
    refreshLiveData,
    toggleTheme() {
      const html = document.documentElement;
      const isLight = html.classList.toggle("light");
      const ic = document.getElementById("theme-icon");
      if (ic) ic.textContent = isLight ? "🌙" : "☀️";
    },
  };

  // Initialize on DOMContentLoaded
  document.addEventListener("DOMContentLoaded", async () => {
    loadFavorites();
    setupAudioEvents();
    renderAll();

    // Sync with local API server if running
    try {
      const resp = await fetch("/api/trends");
      if (resp.ok) {
        const freshData = await resp.json();
        if (freshData && freshData.tracks) {
          if ((!freshData.firehose_releases || freshData.firehose_releases.length === 0) && STATE.data && STATE.data.firehose_releases) {
            freshData.firehose_releases = STATE.data.firehose_releases;
          }
          STATE.data = freshData;
          renderAll();
        }
      }
    } catch (e) {
      // Running in standalone file:// mode using preloaded window.HAYBEAT_INITIAL_DATA
    }
  });
})();
