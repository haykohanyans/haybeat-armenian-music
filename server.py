#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
HAYBEAT — Local Web Server & Live Intelligence API
Запускает веб-интерфейс на http://localhost:8765 и предоставляет:
- GET  /api/trends        -> актуальный срез чартов и трендов Армении
- POST /api/refresh       -> живое обновление данных из Kworb, Apple Music, iTunes, Deezer, YouTube
- GET  /api/live-search   -> живой поиск любого армянского артиста или трека в YouTube + Apple Music + Deezer
- GET  /api/fresh-audio   -> мгновенное получение свежей ссылки на 30-сек аудио-превью
"""

import concurrent.futures
import http.server
import json
import os
import socketserver
import sys
import urllib.parse

sys.stdout.reconfigure(encoding="utf-8")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
PORT = int(os.environ.get("HAYBEAT_PORT", "8765"))

import fetch_trends


class HayBeatHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def _send_json(self, data, status=200):
        raw = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        qs = urllib.parse.parse_qs(parsed.query)

        if path == "/api/trends":
            json_path = os.path.join(DATA_DIR, "trends_data.json")
            if not os.path.exists(json_path):
                payload = fetch_trends.harvest_all(DATA_DIR)
                return self._send_json(payload)
            with open(json_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            return self._send_json(data)

        if path == "/api/fresh-audio":
            artist = (qs.get("artist") or [""])[0]
            title = (qs.get("title") or [""])[0]
            it = fetch_trends.search_itunes_track(artist, title)
            if it.get("preview_url"):
                return self._send_json({"ok": True, "preview_url": it["preview_url"], "source": "itunes"})
            dz = fetch_trends.search_deezer_track(artist, title)
            if dz.get("deezer_preview"):
                return self._send_json({"ok": True, "preview_url": dz["deezer_preview"], "source": "deezer"})
            return self._send_json({"ok": False, "preview_url": ""}, status=404)

        if path == "/api/live-search":
            query = (qs.get("q") or [""])[0].strip()
            if not query:
                return self._send_json({"ok": False, "error": "Empty query"}, status=400)
            results = live_search_multi(query)
            return self._send_json({"ok": True, "query": query, "results": results})

        return super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/refresh":
            try:
                import importlib
                importlib.reload(fetch_trends)
                payload = fetch_trends.harvest_all(DATA_DIR)
                return self._send_json({"ok": True, "data": payload})
            except Exception as e:
                return self._send_json({"ok": False, "error": str(e)}, status=500)
        return self._send_json({"ok": False, "error": "Not found"}, status=404)


def live_search_multi(query):
    """Search YouTube, iTunes AM, and Deezer simultaneously for any artist/track query."""
    q_enc = urllib.parse.quote(query)
    items = []

    def get_yt():
        try:
            raw = fetch_trends.http_get(f"https://www.youtube.com/results?search_query={q_enc}", timeout=8)
            import re
            m = re.search(r"var ytInitialData = (\{.*?\});</script>", raw)
            if not m:
                return []
            data = json.loads(m.group(1))
            sections = (
                data.get("contents", {})
                .get("twoColumnSearchResultsRenderer", {})
                .get("primaryContents", {})
                .get("sectionListRenderer", {})
                .get("contents", [])
            )
            out = []
            for sec in sections:
                for it in sec.get("itemSectionRenderer", {}).get("contents", []):
                    if "videoRenderer" in it:
                        v = it["videoRenderer"]
                        vid = v.get("videoId", "")
                        if not vid:
                            continue
                        title = "".join(r.get("text", "") for r in v.get("title", {}).get("runs", []))
                        views_text = v.get("viewCountText", {}).get("simpleText", "")
                        pub_text = v.get("publishedTimeText", {}).get("simpleText", "")
                        dur = v.get("lengthText", {}).get("simpleText", "")
                        chan = "".join(r.get("text", "") for r in v.get("ownerText", {}).get("runs", []))
                        out.append({
                            "youtube_video_id": vid,
                            "youtube_title": title,
                            "youtube_views_text": views_text,
                            "youtube_published": pub_text,
                            "youtube_duration": dur,
                            "youtube_channel": chan,
                            "youtube_thumbnail": f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg",
                        })
                        if len(out) >= 6:
                            return out
            return out
        except Exception:
            return []

    def get_audio():
        it = fetch_trends.search_itunes_track(query, "")
        dz = fetch_trends.search_deezer_track(query, "")
        return {
            "preview_url": it.get("preview_url") or dz.get("deezer_preview") or "",
            "artwork_url": it.get("artwork_url") or dz.get("deezer_artwork") or "",
            "release_date": it.get("release_date") or "",
            "apple_music_url": it.get("apple_music_url") or "",
            "deezer_url": dz.get("deezer_url") or "",
        }

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as ex:
        f_yt = ex.submit(get_yt)
        f_aud = ex.submit(get_audio)
        yt_list = f_yt.result()
        aud = f_aud.result()

    for idx, y in enumerate(yt_list):
        items.append({
            "id": f"live_{y['youtube_video_id']}",
            "artist": y["youtube_channel"] or query,
            "title": y["youtube_title"],
            "youtube_video_id": y["youtube_video_id"],
            "youtube_views_text": y["youtube_views_text"],
            "youtube_published": y["youtube_published"],
            "youtube_duration": y["youtube_duration"],
            "artwork_url": aud["artwork_url"] if idx == 0 and aud["artwork_url"] else y["youtube_thumbnail"],
            "preview_url": aud["preview_url"] if idx == 0 else "",
            "apple_music_url": aud["apple_music_url"] if idx == 0 else "",
            "deezer_url": aud["deezer_url"] if idx == 0 else "",
        })
    return items


class ThreadedHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


if __name__ == "__main__":
    print(f"============================================================")
    print(f"  HAYBEAT — Радар Трендов Армянской Музыки")
    print(f"  Сервер запущен: http://localhost:{PORT}")
    print(f"============================================================")
    server = ThreadedHTTPServer(("0.0.0.0", PORT), HayBeatHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...")
        server.server_close()
