#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
HAYBEAT — Armenian Music Trends & Unfiltered New Releases Firehose Engine
Собирает живые данные о трендах И всех новых релизах армянской музыки (независимо от просмотров и рейтинга):
1. Apple Music Armenia Top 200 (Kworb + Apple RSS Marketing Tools AM)
2. YouTube Armenia Weekly Music Insights (Kworb YouTube AM)
3. iTunes Armenia Chart (Kworb iTunes AM)
4. Радар ключевых армянских артистов и новых релизов 2026
5. ПОТОК ВСЕХ НОВИНОК (ALL NEW RELEASES FIREHOSE 0+ VIEWS):
   - YouTube (Загружено сегодня / За неделю / За месяц) по армянским тегам (Поп, Рэп, Рок, Инди, Фолк, Rabiz, Демо) — даже с 0..500 просмотрами!
   - Apple Music / iTunes Armenia (country=am) — все свежие цифровые синглы 2026 вне чартов
   - Deezer API — независимые и малоизвестные релизы на армянском языке
"""

import concurrent.futures
import datetime
import html
import json
import math
import os
import re
import sys
import time
import urllib.parse
import urllib.request

sys.stdout.reconfigure(encoding="utf-8")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9,ru;q=0.8",
}


def http_get(url, timeout=10):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", "ignore")


def http_get_json(url, timeout=10):
    raw = http_get(url, timeout=timeout)
    return json.loads(raw)


ARMENIAN_ARTISTS_DB = {
    "sirusho": {
        "canonical": "Sirusho",
        "name_ru": "Сирушо (Sirusho)",
        "scene": "HayPop / Этно-Поп",
        "scene_id": "haypop",
        "origin": "Ереван, Армения",
        "bio_ru": "Икона современной армянской поп- и этно-поп музыки, создательница проекта Pregomesh. Возглавляет Apple Music Армения с синглом «chem neri».",
        "is_diaspora": False,
    },
    "brunette": {
        "canonical": "Brunette",
        "name_ru": "Brunette (Элен Еремян)",
        "scene": "Инди-Поп / R&B",
        "scene_id": "haypop",
        "origin": "Ереван, Армения",
        "bio_ru": "Главная звезда новой волны армянского поп- и R&B-звучания, рекордсменка Apple Music Армения (7 треков в Топ-200 одновременно).",
        "is_diaspora": False,
    },
    "arkadi dumikyan": {
        "canonical": "Arkadi Dumikyan",
        "name_ru": "Аркадий Думикян",
        "scene": "Kef / Городской Поп",
        "scene_id": "kef",
        "origin": "Ереван / Диаспора",
        "bio_ru": "Абсолютный король YouTube Армения: сразу 6 его клипов входят в недельный Топ-20 страны с суммарным трафиком свыше 2 млн просмотров в неделю.",
        "is_diaspora": False,
    },
    "d'litte": {
        "canonical": "D'Litte",
        "name_ru": "D'Litte",
        "scene": "Хип-Хоп / R&B / Урбан",
        "scene_id": "hiphop",
        "origin": "Ереван, Армения",
        "bio_ru": "Лидер ереванской урбан- и мелодик-рэп сцены: 8 треков и коллабораций в текущем чарте Apple Music Армения.",
        "is_diaspora": False,
    },
    "yellowheart.": {
        "canonical": "yellowheart.",
        "name_ru": "yellowheart.",
        "scene": "Инди / Альтернатива",
        "scene_id": "indie",
        "origin": "Ереван, Армения",
        "bio_ru": "Флагман новой ереванской инди- и альтернативной сцены; совместный релиз «K/ES» с Misho вошёл в Топ-25 Apple Music AM.",
        "is_diaspora": False,
    },
    "valkar": {
        "canonical": "Valkar & Lyov",
        "name_ru": "Valkar & Lyov",
        "scene": "Хип-Хоп / Урбан-Поп",
        "scene_id": "hiphop",
        "origin": "Ереван, Армения",
        "bio_ru": "Молодой дуэт новой волны армянского урбан-попа, стремительно ворвавшийся в Топ-15 Apple Music Армения с треком «Sirayin».",
        "is_diaspora": False,
    },
    "misho": {
        "canonical": "Misho",
        "name_ru": "Misho (Мишо / Hay Team)",
        "scene": "Хип-Хоп / Рэп",
        "scene_id": "hiphop",
        "origin": "Ереван, Армения",
        "bio_ru": "Пионер и легенда армянского хип-хопа (Hay Team, Hay Tgheq), удерживающий 5 сольных и совместных работ в чарте Apple Music AM.",
        "is_diaspora": False,
    },
    "anette aghabekyan": {
        "canonical": "Anette Aghabekyan",
        "name_ru": "Анетт Агабекян",
        "scene": "HayPop / Городской Поп",
        "scene_id": "haypop",
        "origin": "Ереван, Армения",
        "bio_ru": "Феномен YouTube Армения 2026 года: дуэт «Erkusov» продержался на 1-м месте рекордные 14 недель и собрал более 26 млн просмотров.",
        "is_diaspora": False,
    },
    "arshavir martirosyan": {
        "canonical": "Arshavir Martirosyan",
        "name_ru": "Аршавир Мартиросян",
        "scene": "Kef / Романтический Поп",
        "scene_id": "kef",
        "origin": "Ереван, Армения",
        "bio_ru": "Автор суперхитов «Depi Sirt» и «Qo Erazac Sere» (37 недель в чарте YouTube Армения).",
        "is_diaspora": False,
    },
    "lilit hovhannisyan": {
        "canonical": "Lilit Hovhannisyan",
        "name_ru": "Лилит Оганесян",
        "scene": "HayPop / Эстрада",
        "scene_id": "haypop",
        "origin": "Ереван, Армения",
        "bio_ru": "Суперзвезда армянской поп-сцены: новая работа «Mer Verjin Ashune» входит в Топ-10 YouTube Армения.",
        "is_diaspora": False,
    },
    "ernest ogannesyan": {
        "canonical": "Ernest Ogannesyan",
        "name_ru": "Эрнест Оганесян",
        "scene": "Kef / Городской Поп",
        "scene_id": "kef",
        "origin": "Армения / Диаспора",
        "bio_ru": "Исполнитель хитов «Imanam» и «Chem Uzum», многократно возглавлявших чарт YouTube Армения.",
        "is_diaspora": False,
    },
    "zoya baraghamyan": {
        "canonical": "Zoya Baraghamyan",
        "name_ru": "Зоя Барагамян",
        "scene": "HayPop / Лирика",
        "scene_id": "haypop",
        "origin": "Ереван, Армения",
        "bio_ru": "Певица, чей свежий сингл «Es u Du» дебютировал в Топ-20 YouTube Армения.",
        "is_diaspora": False,
    },
    "naré": {
        "canonical": "Naré",
        "name_ru": "Naré (Наре)",
        "scene": "HayPop / Dance-Pop",
        "scene_id": "haypop",
        "origin": "Армения / США",
        "bio_ru": "Современная поп-исполнительница, победительница Junior Eurovision 2026 с хитом «BOO!».",
        "is_diaspora": False,
    },
    "galife": {
        "canonical": "GALIFE",
        "name_ru": "GALIFE",
        "scene": "Хип-Хоп / Клубный Рэп",
        "scene_id": "hiphop",
        "origin": "Ереван, Армения",
        "bio_ru": "Хитмейкер клубного армянского хип-хопа («TAQ HAC», «DJ BOBO»).",
        "is_diaspora": False,
    },
    "kami friends": {
        "canonical": "Kami Friends",
        "name_ru": "Kami Friends",
        "scene": "Инди / Live-Фьюжн",
        "scene_id": "indie",
        "origin": "Ереван, Армения",
        "bio_ru": "Музыкальный резидент-проект культового ереванского клуба KAMI, создающий живые коллаборации со звёздами.",
        "is_diaspora": False,
    },
    "reincarnation": {
        "canonical": "Reincarnation",
        "name_ru": "Reincarnation (Роланд Гаспарян)",
        "scene": "Инди / Регги / Фолк-Рок",
        "scene_id": "indie",
        "origin": "Ереван, Армения",
        "bio_ru": "Легендарная ереванская группа Роланда Гаспаряна; их хиты «Heranal» (+48 позиций) и «Kancnen Orer» (+29) переживают новый ренессанс в чартах.",
        "is_diaspora": False,
    },
    "iveta mukuchyan": {
        "canonical": "Iveta Mukuchyan",
        "name_ru": "Ивета Мукучян",
        "scene": "HayPop / Электро-Поп",
        "scene_id": "haypop",
        "origin": "Ереван, Армения",
        "bio_ru": "Одна из самых ярких поп-див Армении, вошедшая в чарты с композицией «Ser Ka Erknqum Yerevani».",
        "is_diaspora": False,
    },
    "arman hovhannisyan": {
        "canonical": "Arman Hovhannisyan",
        "name_ru": "Арман Оганесян",
        "scene": "Kef / Традиционный Поп",
        "scene_id": "kef",
        "origin": "Ереван, Армения",
        "bio_ru": "Заслуженный артист Армении, один из главных голосов национальной популярной музыки.",
        "is_diaspora": False,
    },
    "arame": {
        "canonical": "Arame",
        "name_ru": "Араме (Arame)",
        "scene": "HayPop / Эстрада",
        "scene_id": "haypop",
        "origin": "Ереван, Армения",
        "bio_ru": "Популярный певец армянской эстрады, объединившийся с D'Litte в треке «Namak Im Aghjkan».",
        "is_diaspora": False,
    },
    "razmik amyan": {
        "canonical": "Razmik Amyan",
        "name_ru": "Размик Амян",
        "scene": "HayPop / Эстрада",
        "scene_id": "haypop",
        "origin": "Ереван, Армения",
        "bio_ru": "Один из самых любимых вокалистов армянской поп-сцены, автор классических и современных хитов.",
        "is_diaspora": False,
    },
    "vardanik": {
        "canonical": "Vardanik",
        "name_ru": "Варданик (Vardanik)",
        "scene": "Kef / Народный Хит",
        "scene_id": "kef",
        "origin": "Армения",
        "bio_ru": "Исполнитель народно-патриотических и застольных хитов, занимающий #3 в чарте iTunes Армения с треком «Ararate Mer Lerna».",
        "is_diaspora": False,
    },
    "hayko": {
        "canonical": "Hayko",
        "name_ru": "Айко (Hayko)",
        "scene": "HayPop / Симфо-Поп",
        "scene_id": "haypop",
        "origin": "Ереван, Армения",
        "bio_ru": "Классик армянской романтической музыки; симфоническая лайв-версия «Harsaniq Tikunqum» входит в Топ-10 iTunes Армения.",
        "is_diaspora": False,
    },
    "ladaniva": {
        "canonical": "Ladaniva",
        "name_ru": "Ladaniva (Жаклин Багдасарян)",
        "scene": "Инди / Этно-Фолк / World",
        "scene_id": "indie",
        "origin": "Армения / Франция",
        "bio_ru": "Мировой этно-поп феномен: новые клипы 2026 года «Margarita» (1.8 млн просмотров за месяц) и «Yasaman» покоряют Европу и Армению.",
        "is_diaspora": False,
    },
    "rosa linn": {
        "canonical": "Rosa Linn",
        "name_ru": "Rosa Linn (Роза Костандян)",
        "scene": "Инди-Поп / Глобал",
        "scene_id": "indie",
        "origin": "Ванадзор, Армения",
        "bio_ru": "Первая армянская певица, преодолевшая 1 миллиард стримов в мире с мегахитом «SNAP».",
        "is_diaspora": False,
    },
    "hayat project": {
        "canonical": "Hayat Project",
        "name_ru": "Hayat Project",
        "scene": "Kef / Фолк-Поп Бэнд",
        "scene_id": "kef",
        "origin": "Гюмри, Армения",
        "bio_ru": "Главный лайв-бэнд из Гюмри: в октябре 2026 выпустили подряд два ярких клипа — «LABAROSH» и «This Is Armenia, Baby!».",
        "is_diaspora": False,
    },
    "oksy avdalyan": {
        "canonical": "Oksy Avdalyan",
        "name_ru": "Окси Авдалян",
        "scene": "HayPop / Городской Поп",
        "scene_id": "haypop",
        "origin": "Ереван, Армения",
        "bio_ru": "Певица, чьи осенние релизы 2026 года «Gna Du Yerevanic» и «I Love You» набрали свыше 3 млн просмотров на YouTube за 2 месяца.",
        "is_diaspora": False,
    },
    "saro tovmasyan": {
        "canonical": "Saro Tovmasyan",
        "name_ru": "Саро Товмасян",
        "scene": "HayPop / Городской Поп",
        "scene_id": "haypop",
        "origin": "Ереван, Армения",
        "bio_ru": "Хитмейкер армянской поп-сцены, активно выпускающий романтические синглы в 2026 году («Sern Uni Astgher»).",
        "is_diaspora": False,
    },
    "erik karapetyan": {
        "canonical": "Erik Karapetyan",
        "name_ru": "Эрик Карапетян",
        "scene": "HayPop / Поп-Вокал",
        "scene_id": "haypop",
        "origin": "Ереван, Армения",
        "bio_ru": "Один из сильнейших поп-вокалистов современной Армении («Im Ser», «Bella Si»).",
        "is_diaspora": False,
    },
    "mihran tsarukyan": {
        "canonical": "Mihran Tsarukyan",
        "name_ru": "Мигран Царукян",
        "scene": "HayPop / Эстрада",
        "scene_id": "haypop",
        "origin": "Ереван, Армения",
        "bio_ru": "Популярный певец и актёр, автор хита 2026 года «Sirelis» (1.46 млн просмотров).",
        "is_diaspora": False,
    },
    "gevorg martirosyan": {
        "canonical": "Gevorg Martirosyan",
        "name_ru": "Геворг Мартиросян",
        "scene": "Kef / Танцевальный Поп",
        "scene_id": "kef",
        "origin": "Ереван, Армения",
        "bio_ru": "Звезда танцевальных и праздничных хитов («TARINER» — 8.4 млн просмотров, «Im ynker» 2026).",
        "is_diaspora": False,
    },
    "project la": {
        "canonical": "Project LA",
        "name_ru": "Project LA (Гор Суджян)",
        "scene": "Инди / Поэтический Рок",
        "scene_id": "indie",
        "origin": "Ереван, Армения",
        "bio_ru": "Культовый музыкальный проект Левона Аревшатяна и Гора Суджяна; в октябре 2026 представили новую работу «NO (Չէ, չէ, չէ)».",
        "is_diaspora": False,
    },
    "sevak amroyan": {
        "canonical": "Sevak Amroyan",
        "name_ru": "Севак Амроян",
        "scene": "Инди / Этно-Фолк",
        "scene_id": "indie",
        "origin": "Ереван, Армения",
        "bio_ru": "Мощный голос современного армянского фолка, выпустивший в 2026 году новую интерпретацию «Krunk (Կռունկ)».",
        "is_diaspora": False,
    },
    "xcho": {
        "canonical": "Xcho",
        "name_ru": "Xcho (Хачик Дунамалян)",
        "scene": "Звёзды Диаспоры / СНГ-Чарты",
        "scene_id": "diaspora",
        "origin": "Ванадзор, Армения",
        "bio_ru": "Уроженец Ванадзора, ставший мультиплатиновым хитмейкером: 8 треков одновременно в Топ-200 Apple Music Армения.",
        "is_diaspora": True,
    },
    "jakone": {
        "canonical": "Jakone",
        "name_ru": "Jakone (Арамаис Багдасарян)",
        "scene": "Звёзды Диаспоры / СНГ-Чарты",
        "scene_id": "diaspora",
        "origin": "Армянская диаспора",
        "bio_ru": "Один из самых стримируемых артистов армянского происхождения в чартах Apple Music (#5) и YouTube Армения (#3).",
        "is_diaspora": True,
    },
    "a.v.g": {
        "canonical": "A.V.G",
        "name_ru": "A.V.G (Валико Азатян)",
        "scene": "Звёзды Диаспоры / СНГ-Чарты",
        "scene_id": "diaspora",
        "origin": "Армянская диаспора",
        "bio_ru": "Рэп- и поп-артист армянского происхождения, активно записывающий фиты с ереванской сценой (D'Litte).",
        "is_diaspora": True,
    },
}


def detect_armenian_artist(artist_str, title_str=""):
    artist_low = artist_str.lower()
    lead = re.split(r"[,&]|feat\.?", artist_low)[0].strip()
    for key, info in ARMENIAN_ARTISTS_DB.items():
        if key in lead:
            return info
    for key, info in ARMENIAN_ARTISTS_DB.items():
        if key in artist_low:
            return info
    title_low = title_str.lower()
    for key, info in ARMENIAN_ARTISTS_DB.items():
        if key in title_low:
            return info
    return None


def parse_kworb_apple_am():
    print("[1/6] Fetching Apple Music Armenia Top 200 from Kworb...")
    url = "https://kworb.net/charts/apple_s/am.html"
    raw = http_get(url, timeout=10)
    rows = re.findall(r"<tr[^>]*>(.*?)</tr>", raw, re.S)
    results = []
    for row in rows:
        tds = re.findall(r"<td[^>]*>(.*?)</td>", row, re.S)
        if len(tds) >= 3:
            pos_str = re.sub(r"<[^>]+>", "", tds[0]).strip()
            delta_str = re.sub(r"<[^>]+>", "", tds[1]).strip()
            artist_title = html.unescape(re.sub(r"<[^>]+>", "", tds[2]).strip())
            if not pos_str.isdigit():
                continue
            pos = int(pos_str)
            if " - " in artist_title:
                artist, title = artist_title.split(" - ", 1)
            else:
                artist, title = artist_title, ""
            arm_info = detect_armenian_artist(artist, title)
            results.append({
                "pos": pos,
                "delta": delta_str,
                "artist": artist.strip(),
                "title": title.strip(),
                "is_armenian": arm_info is not None,
                "is_diaspora": arm_info["is_diaspora"] if arm_info else False,
                "scene": arm_info["scene"] if arm_info else "Мировой / СНГ Чарт",
                "scene_id": arm_info["scene_id"] if arm_info else "global",
                "artist_canonical": arm_info["canonical"] if arm_info else artist.strip(),
            })
    print(f"      Parsed {len(results)} rows from Apple Music AM Top 200 ({sum(1 for r in results if r['is_armenian'])} Armenian tracks).")
    return results


def parse_kworb_youtube_am():
    print("[2/6] Fetching YouTube Armenia Weekly Insights from Kworb...")
    url = "https://kworb.net/youtube/insights/am.html"
    raw = http_get(url, timeout=10)
    rows = re.findall(r"<tr[^>]*>(.*?)</tr>", raw, re.S)
    results = []
    for row in rows:
        tds = re.findall(r"<td[^>]*>(.*?)</td>", row, re.S)
        if len(tds) >= 8:
            pos_str = re.sub(r"<[^>]+>", "", tds[0]).strip()
            if not pos_str.isdigit():
                continue
            pos = int(pos_str)
            delta_str = re.sub(r"<[^>]+>", "", tds[1]).strip()
            artist_title = html.unescape(re.sub(r"<[^>]+>", "", tds[2]).strip())
            wks_str = re.sub(r"<[^>]+>", "", tds[3]).strip()
            pk_str = re.sub(r"<[^>]+>", "", tds[4]).strip()
            pk_times = re.sub(r"<[^>]+>", "", tds[5]).strip()
            streams_str = re.sub(r"<[^>]+>", "", tds[6]).strip()
            streams_delta_str = re.sub(r"<[^>]+>", "", tds[7]).strip()

            if " - " in artist_title:
                artist, title = artist_title.split(" - ", 1)
            else:
                artist, title = artist_title, ""
            if title.lower().startswith(artist.lower() + " - "):
                title = title[len(artist) + 3:]
            if title.endswith("Ashun&"):
                title = title[:-1] + "e"
            title = title.rstrip("&").strip()

            streams = int(streams_str.replace(",", "")) if streams_str.replace(",", "").isdigit() else 0
            streams_delta = 0
            if streams_delta_str:
                clean_d = streams_delta_str.replace(",", "").replace("+", "")
                try:
                    streams_delta = int(clean_d)
                except ValueError:
                    streams_delta = 0

            arm_info = detect_armenian_artist(artist, title)
            results.append({
                "pos": pos,
                "delta": delta_str,
                "artist": artist.strip(),
                "title": title.strip(),
                "weeks": int(wks_str) if wks_str.isdigit() else 1,
                "peak": int(pk_str) if pk_str.isdigit() else pos,
                "peak_times": pk_times,
                "weekly_streams": streams,
                "weekly_streams_delta": streams_delta,
                "is_armenian": arm_info is not None,
                "is_diaspora": arm_info["is_diaspora"] if arm_info else False,
                "scene": arm_info["scene"] if arm_info else "Мировой / СНГ Чарт",
                "scene_id": arm_info["scene_id"] if arm_info else "global",
                "artist_canonical": arm_info["canonical"] if arm_info else artist.strip(),
            })
    print(f"      Parsed {len(results)} rows from YouTube AM Weekly Insights.")
    return results


def parse_kworb_itunes_am():
    print("[3/6] Fetching iTunes Armenia chart from Kworb...")
    url = "https://kworb.net/charts/itunes/am.html"
    raw = http_get(url, timeout=10)
    rows = re.findall(r"<tr[^>]*>(.*?)</tr>", raw, re.S)
    results = []
    for row in rows:
        tds = re.findall(r"<td[^>]*>(.*?)</td>", row, re.S)
        if len(tds) >= 2:
            pos_str = re.sub(r"<[^>]+>", "", tds[0]).strip()
            if not pos_str.isdigit():
                continue
            pos = int(pos_str)
            if len(tds) >= 3:
                delta_str = re.sub(r"<[^>]+>", "", tds[1]).strip()
                artist_title = html.unescape(re.sub(r"<[^>]+>", "", tds[2]).strip())
            else:
                delta_str = "="
                artist_title = html.unescape(re.sub(r"<[^>]+>", "", tds[1]).strip())
            if " - " in artist_title:
                artist, title = artist_title.split(" - ", 1)
            else:
                artist, title = artist_title, ""
            arm_info = detect_armenian_artist(artist, title)
            results.append({
                "pos": pos,
                "delta": delta_str,
                "artist": artist.strip(),
                "title": title.strip(),
                "is_armenian": arm_info is not None,
                "is_diaspora": arm_info["is_diaspora"] if arm_info else False,
                "scene": arm_info["scene"] if arm_info else "Мировой / СНГ Чарт",
                "scene_id": arm_info["scene_id"] if arm_info else "global",
                "artist_canonical": arm_info["canonical"] if arm_info else artist.strip(),
            })
    print(f"      Parsed {len(results)} rows from iTunes AM ({sum(1 for r in results if r['is_armenian'])} Armenian tracks).")
    return results


def fetch_apple_rss_am():
    print("[4/6] Fetching Apple Music RSS AM metadata...")
    try:
        data = http_get_json("https://rss.marketingtools.apple.com/api/v2/am/music/most-played/50/songs.json", timeout=10)
        items = data.get("feed", {}).get("results", [])
        print(f"      Got {len(items)} items from Apple Music RSS AM.")
        return items
    except Exception as e:
        print(f"      Apple RSS fallback notice: {e}")
        return []


def search_itunes_track(artist, title):
    clean_title = re.sub(r"\[.*?\]|\(.*?\)", "", title).strip()
    query = urllib.parse.quote(f"{artist} {clean_title}")
    for country in ("am", "us"):
        try:
            url = f"https://itunes.apple.com/search?term={query}&country={country}&entity=song&limit=3"
            data = http_get_json(url, timeout=6)
            results = data.get("results", [])
            if results:
                r = results[0]
                art = r.get("artworkUrl100", "")
                if art:
                    art = art.replace("100x100bb", "600x600bb")
                return {
                    "preview_url": r.get("previewUrl", ""),
                    "artwork_url": art,
                    "release_date": (r.get("releaseDate") or "")[:10],
                    "album_name": r.get("collectionName", ""),
                    "genre_itunes": r.get("primaryGenreName", ""),
                    "duration_sec": round((r.get("trackTimeMillis") or 0) / 1000),
                    "apple_music_url": r.get("trackViewUrl", ""),
                }
        except Exception:
            pass
    return {}


def search_deezer_track(artist, title):
    clean_title = re.sub(r"\[.*?\]|\(.*?\)", "", title).strip()
    query = urllib.parse.quote(f"{artist} {clean_title}")
    try:
        url = f"https://api.deezer.com/search?q={query}&limit=3"
        data = http_get_json(url, timeout=6)
        results = data.get("data", [])
        if results:
            r = results[0]
            album = r.get("album", {})
            return {
                "deezer_preview": r.get("preview", ""),
                "deezer_artwork": album.get("cover_xl") or album.get("cover_big") or "",
                "deezer_rank": r.get("rank", 0),
                "deezer_url": r.get("link", ""),
                "duration_sec": r.get("duration", 0),
            }
    except Exception:
        pass
    return {}


def search_youtube_video(artist, title):
    clean_title = re.sub(r"\[.*?\]", "", title).strip()
    query = urllib.parse.quote(f"{artist} {clean_title}")
    try:
        raw = http_get(f"https://www.youtube.com/results?search_query={query}", timeout=8)
        m = re.search(r"var ytInitialData = (\{.*?\});</script>", raw)
        if not m:
            return {}
        data = json.loads(m.group(1))
        sections = (
            data.get("contents", {})
            .get("twoColumnSearchResultsRenderer", {})
            .get("primaryContents", {})
            .get("sectionListRenderer", {})
            .get("contents", [])
        )
        for sec in sections:
            items = sec.get("itemSectionRenderer", {}).get("contents", [])
            for item in items:
                if "videoRenderer" in item:
                    v = item["videoRenderer"]
                    vid = v.get("videoId", "")
                    if not vid:
                        continue
                    yt_title = "".join(r.get("text", "") for r in v.get("title", {}).get("runs", []))
                    views_text = v.get("viewCountText", {}).get("simpleText", "")
                    digits = re.sub(r"[^\d]", "", views_text)
                    views_num = int(digits) if digits else 0
                    pub_text = v.get("publishedTimeText", {}).get("simpleText", "")
                    length_text = v.get("lengthText", {}).get("simpleText", "")
                    channel = "".join(r.get("text", "") for r in v.get("ownerText", {}).get("runs", []))
                    return {
                        "youtube_video_id": vid,
                        "youtube_title": yt_title,
                        "youtube_views_text": views_text,
                        "youtube_views": views_num,
                        "youtube_published": pub_text,
                        "youtube_duration": length_text,
                        "youtube_channel": channel,
                        "youtube_thumbnail": f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg",
                        "youtube_url": f"https://www.youtube.com/watch?v={vid}",
                    }
    except Exception:
        pass
    return {}


def parse_delta_int(delta_str):
    if not delta_str:
        return 0
    if delta_str in ("NEW", "RE"):
        return 25
    if delta_str == "=":
        return 0
    try:
        return int(delta_str.replace("+", ""))
    except ValueError:
        return 0


def build_unified_armenian_trends(apple_rows, yt_rows, itunes_rows, rss_items):
    rss_map = {}
    for item in rss_items:
        k = (item.get("artistName", "").lower().strip(), item.get("name", "").lower().strip())
        rss_map[k] = item

    tracks_by_key = {}

    def norm_key(artist, title):
        a = re.sub(r"[^a-zа-яё0-9]", "", artist.lower())
        t = re.sub(r"[^a-zа-яё0-9]", "", title.lower())
        return f"{a}__{t}"

    for r in apple_rows:
        if not r["is_armenian"]:
            continue
        k = norm_key(r["artist"], r["title"])
        rss_match = rss_map.get((r["artist"].lower(), r["title"].lower()), {})
        art_rss = rss_match.get("artworkUrl100", "").replace("100x100bb", "600x600bb")
        tracks_by_key[k] = {
            "id": k,
            "artist": r["artist"],
            "title": r["title"],
            "artist_canonical": r["artist_canonical"],
            "scene": r["scene"],
            "scene_id": r["scene_id"],
            "is_diaspora": r["is_diaspora"],
            "apple_pos": r["pos"],
            "apple_delta": r["delta"],
            "yt_pos": None,
            "yt_delta": None,
            "yt_weekly_streams": 0,
            "yt_weekly_delta": 0,
            "yt_weeks": 0,
            "yt_peak": None,
            "itunes_pos": None,
            "release_date": rss_match.get("releaseDate", ""),
            "artwork_url": art_rss,
            "apple_music_url": rss_match.get("url", ""),
        }

    for r in yt_rows:
        if not r["is_armenian"]:
            continue
        k = norm_key(r["artist"], r["title"])
        matched_key = None
        if k in tracks_by_key:
            matched_key = k
        else:
            for ek, ev in tracks_by_key.items():
                if (
                    r["artist_canonical"].lower() == ev["artist_canonical"].lower()
                    and (
                        r["title"].lower() in ev["title"].lower()
                        or ev["title"].lower() in r["title"].lower()
                    )
                ):
                    matched_key = ek
                    break
        if matched_key:
            t = tracks_by_key[matched_key]
            t["yt_pos"] = r["pos"]
            t["yt_delta"] = r["delta"]
            t["yt_weekly_streams"] = r["weekly_streams"]
            t["yt_weekly_delta"] = r["weekly_streams_delta"]
            t["yt_weeks"] = r["weeks"]
            t["yt_peak"] = r["peak"]
        else:
            tracks_by_key[k] = {
                "id": k,
                "artist": r["artist"],
                "title": r["title"],
                "artist_canonical": r["artist_canonical"],
                "scene": r["scene"],
                "scene_id": r["scene_id"],
                "is_diaspora": r["is_diaspora"],
                "apple_pos": None,
                "apple_delta": None,
                "yt_pos": r["pos"],
                "yt_delta": r["delta"],
                "yt_weekly_streams": r["weekly_streams"],
                "yt_weekly_delta": r["weekly_streams_delta"],
                "yt_weeks": r["weeks"],
                "yt_peak": r["peak"],
                "itunes_pos": None,
                "release_date": "",
                "artwork_url": "",
                "apple_music_url": "",
            }

    for r in itunes_rows:
        if not r["is_armenian"]:
            continue
        k = norm_key(r["artist"], r["title"])
        if k in tracks_by_key:
            tracks_by_key[k]["itunes_pos"] = r["pos"]
        else:
            tracks_by_key[k] = {
                "id": k,
                "artist": r["artist"],
                "title": r["title"],
                "artist_canonical": r["artist_canonical"],
                "scene": r["scene"],
                "scene_id": r["scene_id"],
                "is_diaspora": r["is_diaspora"],
                "apple_pos": None,
                "apple_delta": None,
                "yt_pos": None,
                "yt_delta": None,
                "yt_weekly_streams": 0,
                "yt_weekly_delta": 0,
                "yt_weeks": 0,
                "yt_peak": None,
                "itunes_pos": r["pos"],
                "release_date": "",
                "artwork_url": "",
                "apple_music_url": "",
            }

    curated_2026_radar = [
        ("Ladaniva", "Margarita"),
        ("Ladaniva", "Yasaman"),
        ("Hayat Project", "LABAROSH"),
        ("Hayat Project", "This Is Armenia, Baby!"),
        ("Hayat Project", "Jigyard Utem"),
        ("Oksy Avdalyan", "Gna Du Yerevanic"),
        ("Oksy Avdalyan", "I Love You"),
        ("Saro Tovmasyan", "Sern Uni Astgher"),
        ("Erik Karapetyan", "Im Ser"),
        ("Mihran Tsarukyan", "Sirelis"),
        ("Gevorg Martirosyan", "TARINER"),
        ("Project LA", "NO"),
        ("Sevak Amroyan", "Krunk"),
    ]
    for artist, title in curated_2026_radar:
        k = norm_key(artist, title)
        if k not in tracks_by_key:
            arm_info = detect_armenian_artist(artist, title)
            tracks_by_key[k] = {
                "id": k,
                "artist": artist,
                "title": title,
                "artist_canonical": arm_info["canonical"] if arm_info else artist,
                "scene": arm_info["scene"] if arm_info else "HayPop / Поп",
                "scene_id": arm_info["scene_id"] if arm_info else "haypop",
                "is_diaspora": arm_info["is_diaspora"] if arm_info else False,
                "apple_pos": None,
                "apple_delta": None,
                "yt_pos": None,
                "yt_delta": None,
                "yt_weekly_streams": 0,
                "yt_weekly_delta": 0,
                "yt_weeks": 0,
                "yt_peak": None,
                "itunes_pos": None,
                "release_date": "2026",
                "artwork_url": "",
                "apple_music_url": "",
                "is_radar_spotlight": True,
            }

    track_list = list(tracks_by_key.values())
    print(f"[5/6] Enriching {len(track_list)} chart/radar Armenian tracks...")

    def enrich_one(t):
        it = search_itunes_track(t["artist"], t["title"])
        dz = search_deezer_track(t["artist"], t["title"])
        yt = search_youtube_video(t["artist"], t["title"])

        t["preview_url"] = it.get("preview_url") or dz.get("deezer_preview") or ""
        t["artwork_url"] = (
            t.get("artwork_url")
            or it.get("artwork_url")
            or dz.get("deezer_artwork")
            or yt.get("youtube_thumbnail")
            or ""
        )
        t["release_date"] = t.get("release_date") or it.get("release_date") or ""
        t["album_name"] = it.get("album_name") or ""
        t["duration_sec"] = it.get("duration_sec") or dz.get("duration_sec") or 0
        t["apple_music_url"] = t.get("apple_music_url") or it.get("apple_music_url") or ""
        t["deezer_url"] = dz.get("deezer_url") or ""
        t["deezer_rank"] = dz.get("deezer_rank") or 0

        t["youtube_video_id"] = yt.get("youtube_video_id", "")
        t["youtube_title"] = yt.get("youtube_title", "")
        t["youtube_views"] = yt.get("youtube_views", 0)
        t["youtube_views_text"] = yt.get("youtube_views_text", "")
        t["youtube_published"] = yt.get("youtube_published", "")
        t["youtube_duration"] = yt.get("youtube_duration", "")
        t["youtube_channel"] = yt.get("youtube_channel", "")
        t["youtube_thumbnail"] = yt.get("youtube_thumbnail", "")
        t["youtube_url"] = yt.get("youtube_url", "")

        score = 0.0
        if t["apple_pos"] is not None:
            score += max(10.0, 52.0 * (1.0 - (t["apple_pos"] - 1) / 210.0))
            if t["apple_pos"] == 1:
                score += 18.0
            elif t["apple_pos"] <= 3:
                score += 12.0
            elif t["apple_pos"] <= 10:
                score += 6.0
            d_int = parse_delta_int(t["apple_delta"])
            if d_int > 0:
                score += min(12.0, d_int * 0.22)
        if t["yt_pos"] is not None:
            score += max(18.0, 52.0 * (1.0 - (t["yt_pos"] - 1) / 22.0))
            if t["yt_pos"] == 1:
                score += 20.0
            elif t["yt_pos"] <= 3:
                score += 12.0
            if t["yt_weekly_delta"] > 0:
                score += min(8.0, t["yt_weekly_delta"] / 8000.0)
        if t["itunes_pos"] is not None:
            score += max(12.0, 38.0 * (1.0 - (t["itunes_pos"] - 1) / 25.0))
        if t["youtube_views"] > 0:
            score += min(14.0, math.log10(max(10, t["youtube_views"])) * 1.9)
        pub_low = t["youtube_published"].lower()
        if (
            t["release_date"].startswith("2026-10")
            or t["release_date"].startswith("2026-09")
            or any(x in pub_low for x in ("day", "d ago", "wk", "w ago", "1mo", "1 mo", "2mo", "2 mo"))
        ):
            score += 9.0
        elif t["apple_delta"] == "NEW" or t["yt_delta"] == "NEW":
            score += 7.0

        if t["is_diaspora"]:
            score *= 0.86

        t["trend_score"] = min(99, max(28, round(score)))

        badges = []
        if (t["apple_pos"] and t["apple_pos"] <= 5) or (t["yt_pos"] and t["yt_pos"] <= 5) or (t["itunes_pos"] and t["itunes_pos"] <= 5):
            badges.append({"id": "leader", "label": "🔥 Лидер чарта", "color": "amber"})
        d_apple = parse_delta_int(t["apple_delta"])
        if d_apple >= 15 or t["yt_weekly_delta"] >= 15000:
            badges.append({"id": "riser", "label": "🚀 Взлёт недели", "color": "emerald"})
        if (
            t["apple_delta"] == "NEW"
            or t["yt_delta"] == "NEW"
            or t["release_date"] >= "2026-09-01"
            or any(x in pub_low for x in ("day", "d ago", "wk", "w ago", "1mo", "1 mo", "2mo", "2 mo"))
        ):
            badges.append({"id": "fresh", "label": "✨ Свежий релиз", "color": "violet"})
        if t["yt_weeks"] >= 10:
            badges.append({"id": "evergreen", "label": f"💎 {t['yt_weeks']} нед. в топе", "color": "cyan"})
        if t["is_diaspora"]:
            badges.append({"id": "diaspora", "label": "🌍 Хит диаспоры", "color": "blue"})
        if not badges:
            badges.append({"id": "active", "label": "📈 В ротации", "color": "slate"})

        t["badges"] = badges
        t["primary_badge"] = badges[0]
        return t

    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as ex:
        enriched = list(ex.map(enrich_one, track_list))

    enriched.sort(
        key=lambda x: (
            x["trend_score"],
            x["yt_weekly_streams"],
            -(x["apple_pos"] or 999),
            x["youtube_views"],
        ),
        reverse=True,
    )
    for idx, item in enumerate(enriched, 1):
        item["haybeat_rank"] = idx

    return enriched


# =============================================================================
# UNFILTERED NEW RELEASES FIREHOSE (ALL NEW ARMENIAN SONGS REGARDLESS OF VIEWS)
# =============================================================================

def parse_age_hours(pub_str="", release_date=""):
    """Convert relative age ('4h ago', '2d ago', '3w ago') or YYYY-MM-DD into hours ago."""
    if pub_str:
        s = pub_str.lower().strip()
        m = re.search(r"(\d+)\s*(sec|min|hour|h\b|day|d\b|week|wk|w\b|month|mo|year|yr|y\b)", s)
        if m:
            val = int(m.group(1))
            u = m.group(2)
            if u.startswith("sec") or u.startswith("min"):
                return 1
            if u.startswith("h"):
                return val
            if u.startswith("d"):
                return val * 24
            if u.startswith("w"):
                return val * 24 * 7
            if u.startswith("m"):
                return val * 24 * 30
            if u.startswith("y"):
                return val * 24 * 365
    if release_date and len(release_date) >= 10:
        try:
            dt = datetime.date.fromisoformat(release_date[:10])
            today = datetime.date(2026, 10, 30)
            days = max(0, (today - dt).days)
            return days * 24 + 12
        except Exception:
            pass
    return 9999


def parse_duration_sec(dur_str):
    if not dur_str:
        return 0
    parts = [int(p) for p in dur_str.split(":") if p.isdigit()]
    if len(parts) == 2:
        return parts[0] * 60 + parts[1]
    if len(parts) == 3:
        return parts[0] * 3600 + parts[1] * 60 + parts[2]
    return 0


def is_valid_armenian_music_item(title, artist_or_channel):
    """Filter out non-music news/sports/gibberish while keeping ALL genuine Armenian music releases (even 0 views)."""
    combined = f"{artist_or_channel} {title}"
    low = combined.lower()

    # Exclude non-music political/news/sports videos or Unicode spam
    bad_patterns = [
        "wrestler", "blind auditions", "the voice of bulgaria", "итоги детского",
        "recap", "2007-2026", "ֆիլմ", "հումորային", "lovestroke rodeo",
        "jayacuu", "feka 23", "graham gouldman", "sweeps - haystack",
        "carnaval sp", "interviews", "լուրեր", "news", "abc media",
        "փաշինյան", "սահմանադրության", "կառավարություն", "պատգամավոր",
        "նախագահ", "ոստիկան", "դատարան", "քաղաքական", "մամուլի", "ասուլիս",
        "ուղիղ․", "factor tv", "azatutyun", "civilnet", "armenia tv",
    ]
    if any(b in low for b in bad_patterns):
        return False

    # Exclude weird math/phonetic unicode spam
    if re.search(r"[\u0250-\u02AF\u1D00-\u1DBF\u1E00-\u1EFF]", combined):
        return False

    # Check Armenian script (\u0530-\u058F) or known Armenian music terms/names
    if re.search(r"[\u0530-\u058F]", combined):
        return True

    arm_keywords = [
        "armenia", "armenian", "hayastan", "haykakan", "yerevan", "erevan", "gyumri",
        "армян", "ереван", "nor erg", "sirt", "sere", "ser ", "achqer", "karot",
        "ashun", "gisher", "kyanq", "vardanik", "dumikyan", "aghabekyan", "martirosyan",
        "hovhannisyan", "mukuchyan", "sirusho", "brunette", "ladaniva", "misho",
        "d'litte", "hayat project", "reincarnation", "amroyan", "tsarukyan", "amyan",
        "arame", "asatryan", "harutyunyan", "gevorgyan", "arakelyan", "arshakyan",
        "mkheyan", "hakobyan", "avdalyan", "tovmasyan", "karapetyan", "nanul", "naré",
        "nare ", "armenchik", "super sako", "rosa linn", "malena", "srbuk", "nemra",
        "shahinyan", "muradyan", "bangoyan", "petrosyan", "sargsyan", "kirakosyan",
        "avetisyan", "badalyan", "daryan", "bambir", "lav eli", "rozen tal",
    ]
    return any(k in low for k in arm_keywords)


def detect_is_ai(title, channel):
    low = f"{title} {channel}".lower()
    ai_markers = [" ai ", "ai cover", "ai clone", "ai music", "mos ai", "shafai", "armasound ai", "deep soul ai"]
    return any(m in low for m in ai_markers) or low.endswith(" ai")



def classify_views_tier(views, has_chart=False):
    if views == 0 and not has_chart:
        return "micro", "🌱 Цифровой сингл / Вне чартов"
    if views < 1500:
        return "micro", f"🌱 Микро-релиз ({views} просм.)"
    if views < 25000:
        return "underground", "🔍 Андеграунд / Малоизвестное"
    if views < 250000:
        return "mid", "📈 Набирает обороты"
    return "major", "🔥 Крупная премьера"


def harvest_unfiltered_new_releases(enriched_chart_tracks):
    """
    Collect ALL new Armenian releases regardless of views or rating from:
    1. YouTube (Today, This Week, This Month across Pop, Premiere, Rap, Rock, Indie, Folk)
    2. iTunes / Apple Music Armenia (country=am, 2026 digital singles)
    3. Deezer API (independent Armenian tracks)
    4. Recent 2026 drops from our enriched chart/radar dataset
    """
    print("[6/6] Harvesting UNFILTERED New Releases Firehose (0+ views, all sources)...")

    yt_queries = [
        ("նոր երգ", "EgIIAg%3D%3D", "yt_today", "YouTube • За 24 часа", "Поп / Новинка"),
        ("հայկական երգ", "EgIIAg%3D%3D", "yt_today", "YouTube • За 24 часа", "Армянская песня"),
        ("նոր երգ 2026", "EgIIAw%3D%3D", "yt_week", "YouTube • За неделю", "Поп / Новинка"),
        ("պրեմիերա երգ", "EgIIAw%3D%3D", "yt_week", "YouTube • Премьеры недели", "Премьера"),
        ("հայկական երգ", "EgIIAw%3D%3D", "yt_week", "YouTube • За неделю", "Поп / Фолк"),
        ("nor erg 2026", "EgIIAw%3D%3D", "yt_week", "YouTube • За неделю", "Городской Поп / Kef"),
        ("armenian song 2026", "EgIIAw%3D%3D", "yt_week", "YouTube • За неделю", "Поп / Этно"),
        ("armenian music 2026", "EgIIAw%3D%3D", "yt_week", "YouTube • За неделю", "Разное"),
        ("նոր տեսահոլովակ 2026", "EgIIBA%3D%3D", "yt_month", "YouTube • Клипы месяца", "Видеоклип"),
        ("պրեմիերա 2026 երգ", "EgIIBA%3D%3D", "yt_month", "YouTube • Премьеры месяца", "Премьера"),
        ("official video 2026 հայկական", "CAISAhAB", "yt_month", "YouTube • Офиц. клипы", "Поп / Эстрада"),
        ("հայկական ռեփ 2026", "EgIIBA%3D%3D", "yt_underground", "YouTube • Андеграунд & Рэп", "Хип-Хоп / Рэп"),
        ("armenian rap 2026", "EgIIBA%3D%3D", "yt_underground", "YouTube • Андеграунд & Рэп", "Хип-Хоп / Рэп"),
        ("հայկական ռոք 2026", "EgIIBA%3D%3D", "yt_underground", "YouTube • Рок & Соул", "Рок / Альтернатива"),
        ("armenian indie music 2026", "EgIIBA%3D%3D", "yt_underground", "YouTube • Инди & Альтернатива", "Инди / Альтернатива"),
        ("հայկական էթնո 2026", "EgIIBA%3D%3D", "yt_underground", "YouTube • Этно & Фолк", "Этно / Фолк"),
        ("армянская песня 2026", "EgIIAw%3D%3D", "yt_week", "YouTube • За неделю", "Городской Поп"),
    ]

    def fetch_yt_batch(q_tuple):
        q, sp, src_id, src_label, genre_hint = q_tuple
        out = []
        try:
            url = f"https://www.youtube.com/results?search_query={urllib.parse.quote(q)}&sp={sp}"
            raw = http_get(url, timeout=8)
            m = re.search(r"var ytInitialData = (\{.*?\});</script>", raw)
            if not m:
                return out
            data = json.loads(m.group(1))
            sections = (
                data.get("contents", {})
                .get("twoColumnSearchResultsRenderer", {})
                .get("primaryContents", {})
                .get("sectionListRenderer", {})
                .get("contents", [])
            )
            for sec in sections:
                for it in sec.get("itemSectionRenderer", {}).get("contents", []):
                    if "videoRenderer" in it:
                        v = it["videoRenderer"]
                        vid = v.get("videoId", "")
                        if not vid:
                            continue
                        raw_title = "".join(r.get("text", "") for r in v.get("title", {}).get("runs", []))
                        channel = "".join(r.get("text", "") for r in v.get("ownerText", {}).get("runs", []))
                        if not is_valid_armenian_music_item(raw_title, channel):
                            continue
                        views_text = v.get("viewCountText", {}).get("simpleText", "0 views")
                        digits = re.sub(r"[^\d]", "", views_text)
                        views_num = int(digits) if digits else 0
                        pub_text = v.get("publishedTimeText", {}).get("simpleText", "")
                        dur_text = v.get("lengthText", {}).get("simpleText", "")
                        dur_sec = parse_duration_sec(dur_text)
                        # Skip tiny <30s shorts
                        if 0 < dur_sec < 35:
                            continue
                        age_h = parse_age_hours(pub_text, "")
                        # Keep items from roughly the last 6 months (<= 4500h)
                        if age_h > 4500:
                            continue

                        # Split Artist - Title if present
                        if " - " in raw_title:
                            parts = raw_title.split(" - ", 1)
                            artist_guess = parts[0].strip()
                            title_guess = parts[1].strip()
                        elif " — " in raw_title:
                            parts = raw_title.split(" — ", 1)
                            artist_guess = parts[0].strip()
                            title_guess = parts[1].strip()
                        else:
                            artist_guess = channel or "Армянский исполнитель"
                            title_guess = raw_title

                        tier_id, tier_label = classify_views_tier(views_num, False)
                        is_mix = dur_sec > 660

                        out.append({
                            "id": f"fh_yt_{vid}",
                            "source_id": src_id,
                            "source_label": src_label,
                            "platform": "YouTube",
                            "artist": artist_guess,
                            "title": title_guess,
                            "full_title": raw_title,
                            "channel": channel,
                            "genre": "Сборник / DJ Mix" if is_mix else genre_hint,
                            "is_mix": is_mix,
                            "views": views_num,
                            "views_text": views_text if views_num > 0 else "Новинка (0–10 просм.)",
                            "published_text": pub_text or "Сегодня",
                            "release_date": "",
                            "age_hours": age_h,
                            "duration_text": dur_text,
                            "duration_sec": dur_sec,
                            "tier_id": tier_id,
                            "tier_label": tier_label,
                            "artwork_url": f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg",
                            "preview_url": "",
                            "youtube_video_id": vid,
                            "youtube_url": f"https://www.youtube.com/watch?v={vid}",
                            "apple_music_url": "",
                            "deezer_url": "",
                        })
        except Exception:
            pass
        return out

    itunes_terms = [
        "ա", "ե", "ի", "ո", "ս", "մ", "կ", "նոր", "երգ", "սեր",
        "կարոտ", "գիշեր", "աշուն", "Երևան", "Հայաստան", "Yerevan", "Hayastan", "Sirt", "Ashun"
    ]

    def fetch_itunes_am_new(term):
        out = []
        try:
            u = f"https://itunes.apple.com/search?term={urllib.parse.quote(term)}&country=am&entity=song&limit=50"
            data = http_get_json(u, timeout=7)
            for r in data.get("results", []):
                rd = (r.get("releaseDate") or "")[:10]
                if rd < "2026-07-01":
                    continue
                artist = r.get("artistName", "")
                title = r.get("trackName", "")
                if not is_valid_armenian_music_item(title, artist):
                    continue
                tid = r.get("trackId")
                dur_sec = round((r.get("trackTimeMillis") or 0) / 1000)
                age_h = parse_age_hours("", rd)
                out.append({
                    "id": f"fh_it_{tid}",
                    "source_id": "itunes_am_new",
                    "source_label": "Apple Music / iTunes AM • Цифровой релиз",
                    "platform": "Apple Music AM",
                    "artist": artist,
                    "title": title,
                    "full_title": f"{artist} — {title}",
                    "channel": artist,
                    "genre": r.get("primaryGenreName") or "Pop",
                    "is_mix": dur_sec > 660,
                    "views": 0,
                    "views_text": "Цифровой сингл (Apple AM)",
                    "published_text": f"Релиз: {rd}",
                    "release_date": rd,
                    "age_hours": age_h,
                    "duration_text": f"{dur_sec // 60}:{dur_sec % 60:02d}" if dur_sec else "",
                    "duration_sec": dur_sec,
                    "tier_id": "micro",
                    "tier_label": "🌱 Цифровой сингл (Вне чартов)",
                    "artwork_url": (r.get("artworkUrl100") or "").replace("100x100bb", "600x600bb"),
                    "preview_url": r.get("previewUrl") or "",
                    "youtube_video_id": "",
                    "youtube_url": "",
                    "apple_music_url": r.get("trackViewUrl") or "",
                    "deezer_url": "",
                })
        except Exception:
            pass
        return out

    deezer_terms = ["նոր երգ", "սեր", "Երևան", "Հայաստան", "գիշեր", "աշուն", "կարոտ"]

    def fetch_deezer_indie(term):
        out = []
        try:
            u = f"https://api.deezer.com/search?q={urllib.parse.quote(term)}&limit=12"
            data = http_get_json(u, timeout=7)
            for r in data.get("data", []):
                artist = r.get("artist", {}).get("name", "")
                title = r.get("title", "")
                if not is_valid_armenian_music_item(title, artist):
                    continue
                did = r.get("id")
                dur_sec = r.get("duration") or 0
                rank = r.get("rank") or 0
                album = r.get("album", {})
                out.append({
                    "id": f"fh_dz_{did}",
                    "source_id": "deezer_indie",
                    "source_label": "Deezer • Независимый каталог",
                    "platform": "Deezer",
                    "artist": artist,
                    "title": title,
                    "full_title": f"{artist} — {title}",
                    "channel": album.get("title") or artist,
                    "genre": "Инди / Каталог Армении",
                    "is_mix": dur_sec > 660,
                    "views": rank,
                    "views_text": f"Deezer индекс: {rank:,}".replace(",", " "),
                    "published_text": f"Альбом: {album.get('title', 'Сингл')[:28]}",
                    "release_date": "",
                    "age_hours": 720,
                    "duration_text": f"{dur_sec // 60}:{dur_sec % 60:02d}" if dur_sec else "",
                    "duration_sec": dur_sec,
                    "tier_id": "micro" if rank <= 35000 else "underground",
                    "tier_label": "🌱 Редкий релиз (Deezer)" if rank <= 35000 else "🔍 Каталог Deezer",
                    "artwork_url": album.get("cover_xl") or album.get("cover_big") or "",
                    "preview_url": r.get("preview") or "",
                    "youtube_video_id": "",
                    "youtube_url": "",
                    "apple_music_url": "",
                    "deezer_url": r.get("link") or "",
                })
        except Exception:
            pass
        return out

    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as ex:
        f_yt = list(ex.map(fetch_yt_batch, yt_queries))
        f_it = list(ex.map(fetch_itunes_am_new, itunes_terms))
        f_dz = list(ex.map(fetch_deezer_indie, deezer_terms))

    combined = {}

    # 1. Add YouTube firehose items (deduplicating by videoId)
    for batch in f_yt:
        for item in batch:
            vid = item["youtube_video_id"]
            if vid not in combined:
                combined[vid] = item

    # 2. Also add recent 2026 tracks from our enriched chart dataset if not already in combined
    for t in enriched_chart_tracks:
        pub_low = (t.get("youtube_published") or "").lower()
        rd = t.get("release_date") or ""
        if (
            rd >= "2026-08-01"
            or any(x in pub_low for x in ("h ago", "d ago", "day", "w ago", "wk", "1mo", "1 mo", "2mo", "2 mo"))
        ):
            vid = t.get("youtube_video_id") or t["id"]
            if vid not in combined:
                age_h = parse_age_hours(t.get("youtube_published", ""), rd)
                tier_id, tier_label = classify_views_tier(t.get("youtube_views", 0), bool(t.get("apple_pos") or t.get("yt_pos")))
                combined[vid] = {
                    "id": f"fh_ch_{t['id']}",
                    "source_id": "chart_premiere",
                    "source_label": "Чарт Армении • Свежая премьера",
                    "platform": "YouTube + Apple AM",
                    "artist": t["artist"],
                    "title": t["title"],
                    "full_title": f"{t['artist']} — {t['title']}",
                    "channel": t.get("youtube_channel") or t["artist"],
                    "genre": t.get("scene") or "HayPop",
                    "is_mix": False,
                    "views": t.get("youtube_views", 0),
                    "views_text": t.get("youtube_views_text") or "Новинка",
                    "published_text": t.get("youtube_published") or (f"Релиз: {rd}" if rd else "Октябрь 2026"),
                    "release_date": rd,
                    "age_hours": age_h,
                    "duration_text": t.get("youtube_duration") or "",
                    "duration_sec": t.get("duration_sec") or 180,
                    "tier_id": tier_id,
                    "tier_label": tier_label,
                    "artwork_url": t.get("artwork_url") or t.get("youtube_thumbnail") or "",
                    "preview_url": t.get("preview_url") or "",
                    "youtube_video_id": t.get("youtube_video_id") or "",
                    "youtube_url": t.get("youtube_url") or "",
                    "apple_music_url": t.get("apple_music_url") or "",
                    "deezer_url": t.get("deezer_url") or "",
                }
            else:
                # Attach preview_url if available
                if t.get("preview_url") and not combined[vid].get("preview_url"):
                    combined[vid]["preview_url"] = t["preview_url"]

    # 3. Add iTunes AM 2026 digital singles (deduplicate by normalized artist+title)
    seen_norm = {
        re.sub(r"[^a-zа-яё\u0530-\u058F0-9]", "", (v["artist"] + v["title"]).lower())
        for v in combined.values()
    }
    for batch in f_it:
        for item in batch:
            nk = re.sub(r"[^a-zа-яё\u0530-\u058F0-9]", "", (item["artist"] + item["title"]).lower())
            if nk and nk not in seen_norm:
                seen_norm.add(nk)
                combined[item["id"]] = item

    # 4. Add Deezer independent Armenian tracks
    for batch in f_dz:
        for item in batch:
            nk = re.sub(r"[^a-zа-яё\u0530-\u058F0-9]", "", (item["artist"] + item["title"]).lower())
            if nk and nk not in seen_norm:
                seen_norm.add(nk)
                combined[item["id"]] = item

    firehose_list = list(combined.values())
    # Sort strictly chronologically by age_hours ascending (newest first, regardless of views!)
    firehose_list.sort(key=lambda x: (x["age_hours"], x["views"]))
    for idx, item in enumerate(firehose_list, 1):
        item["firehose_rank"] = idx
        item["is_ai"] = detect_is_ai(item.get("full_title", ""), item.get("channel", ""))

    print(f"      Harvested {len(firehose_list)} unfiltered new Armenian releases (including {sum(1 for x in firehose_list if x['tier_id']=='micro')} micro/0-chart releases)!")
    return firehose_list


def build_artists_summary(enriched_tracks):
    by_artist = {}
    for t in enriched_tracks:
        canon = t["artist_canonical"]
        if canon not in by_artist:
            info = ARMENIAN_ARTISTS_DB.get(canon.lower(), {})
            by_artist[canon] = {
                "name": canon,
                "name_ru": info.get("name_ru", canon),
                "scene": info.get("scene", t["scene"]),
                "scene_id": info.get("scene_id", t["scene_id"]),
                "origin": info.get("origin", "Армения"),
                "bio_ru": info.get("bio_ru", "Популярный исполнитель в чартах Армении."),
                "is_diaspora": info.get("is_diaspora", t["is_diaspora"]),
                "tracks_count": 0,
                "apple_chart_count": 0,
                "yt_chart_count": 0,
                "best_apple_pos": None,
                "best_yt_pos": None,
                "total_yt_weekly_streams": 0,
                "total_yt_views": 0,
                "avatar_url": t["artwork_url"],
                "top_tracks": [],
                "power_score": 0,
            }
        a = by_artist[canon]
        a["tracks_count"] += 1
        if not a["avatar_url"] and t["artwork_url"]:
            a["avatar_url"] = t["artwork_url"]
        if t["apple_pos"] is not None:
            a["apple_chart_count"] += 1
            if a["best_apple_pos"] is None or t["apple_pos"] < a["best_apple_pos"]:
                a["best_apple_pos"] = t["apple_pos"]
        if t["yt_pos"] is not None:
            a["yt_chart_count"] += 1
            if a["best_yt_pos"] is None or t["yt_pos"] < a["best_yt_pos"]:
                a["best_yt_pos"] = t["yt_pos"]
        a["total_yt_weekly_streams"] += t["yt_weekly_streams"]
        a["total_yt_views"] += t["youtube_views"]
        a["power_score"] += t["trend_score"]
        a["top_tracks"].append({
            "id": t["id"],
            "title": t["title"],
            "haybeat_rank": t["haybeat_rank"],
            "apple_pos": t["apple_pos"],
            "yt_pos": t["yt_pos"],
            "preview_url": t["preview_url"],
            "youtube_video_id": t["youtube_video_id"],
        })

    artists = list(by_artist.values())
    artists.sort(key=lambda x: (x["power_score"], x["total_yt_weekly_streams"]), reverse=True)
    for idx, a in enumerate(artists, 1):
        a["rank"] = idx
    return artists


def harvest_all(output_dir):
    t0 = time.time()
    apple_rows = parse_kworb_apple_am()
    yt_rows = parse_kworb_youtube_am()
    itunes_rows = parse_kworb_itunes_am()
    rss_items = fetch_apple_rss_am()

    enriched_tracks = build_unified_armenian_trends(apple_rows, yt_rows, itunes_rows, rss_items)
    artists_summary = build_artists_summary(enriched_tracks)
    unfiltered_firehose = harvest_unfiltered_new_releases(enriched_tracks)

    # Merge with any previously saved firehose_releases on disk so a refresh only adds new items and never loses tracks
    existing_json_path = os.path.join(output_dir, "trends_data.json")
    if os.path.exists(existing_json_path):
        try:
            with open(existing_json_path, "r", encoding="utf-8") as ef:
                old_data = json.load(ef)
            old_fh = old_data.get("firehose_releases") or []
            seen_fh_ids = {x["id"] for x in unfiltered_firehose}
            for old_item in old_fh:
                if old_item.get("id") and old_item["id"] not in seen_fh_ids:
                    if is_valid_armenian_music_item(old_item.get("full_title", ""), old_item.get("channel", "")):
                        old_item["is_ai"] = detect_is_ai(old_item.get("full_title", ""), old_item.get("channel", ""))
                        unfiltered_firehose.append(old_item)
                        seen_fh_ids.add(old_item["id"])
            unfiltered_firehose.sort(key=lambda x: (x.get("age_hours", 999), x.get("views", 0)))
            for idx, item in enumerate(unfiltered_firehose, 1):
                item["firehose_rank"] = idx
        except Exception:
            pass

    scene_stats = {}
    for t in enriched_tracks:
        sid = t["scene_id"]
        if sid not in scene_stats:
            scene_stats[sid] = {
                "scene_id": sid,
                "scene_name": t["scene"],
                "count": 0,
                "weekly_yt_streams": 0,
                "total_yt_views": 0,
                "avg_score": 0,
            }
        scene_stats[sid]["count"] += 1
        scene_stats[sid]["weekly_yt_streams"] += t["yt_weekly_streams"]
        scene_stats[sid]["total_yt_views"] += t["youtube_views"]
        scene_stats[sid]["avg_score"] += t["trend_score"]

    for sid, st in scene_stats.items():
        if st["count"] > 0:
            st["avg_score"] = round(st["avg_score"] / st["count"], 1)

    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    payload = {
        "updated_at": now_str,
        "elapsed_sec": round(time.time() - t0, 2),
        "summary": {
            "total_armenian_tracks": len(enriched_tracks),
            "total_artists": len(artists_summary),
            "total_firehose_releases": len(unfiltered_firehose),
            "micro_firehose_count": sum(1 for x in unfiltered_firehose if x["tier_id"] == "micro"),
            "underground_firehose_count": sum(1 for x in unfiltered_firehose if x["tier_id"] == "underground"),
            "apple_am_armenian_count": sum(1 for r in apple_rows if r["is_armenian"]),
            "apple_am_total": len(apple_rows),
            "yt_am_armenian_count": sum(1 for r in yt_rows if r["is_armenian"]),
            "yt_am_total": len(yt_rows),
            "itunes_am_armenian_count": sum(1 for r in itunes_rows if r["is_armenian"]),
            "tracks_with_audio_preview": sum(1 for t in enriched_tracks if t["preview_url"]),
            "tracks_with_youtube_video": sum(1 for t in enriched_tracks if t["youtube_video_id"]),
            "total_weekly_yt_streams": sum(t["yt_weekly_streams"] for t in enriched_tracks),
            "top_apple_track": next((t for t in enriched_tracks if t["apple_pos"] == 1), enriched_tracks[0] if enriched_tracks else None),
            "top_youtube_track": next((t for t in enriched_tracks if t["yt_pos"] == 1), enriched_tracks[0] if enriched_tracks else None),
        },
        "tracks": enriched_tracks,
        "firehose_releases": unfiltered_firehose,
        "artists": artists_summary,
        "scenes": list(scene_stats.values()),
        "raw_charts": {
            "apple_am_top100": apple_rows[:100],
            "youtube_am_top20": yt_rows,
            "itunes_am_top20": itunes_rows,
        },
    }

    os.makedirs(output_dir, exist_ok=True)
    json_path = os.path.join(output_dir, "trends_data.json")
    js_path = os.path.join(output_dir, "trends_data.js")

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    with open(js_path, "w", encoding="utf-8") as f:
        f.write("window.HAYBEAT_INITIAL_DATA = ")
        json.dump(payload, f, ensure_ascii=False)
        f.write(";\n")

    print(
        f"Done in {payload['elapsed_sec']}s! Saved {len(enriched_tracks)} chart tracks, "
        f"{len(unfiltered_firehose)} unfiltered new releases, and {len(artists_summary)} artists to {json_path}"
    )
    return payload


if __name__ == "__main__":
    base_dir = os.path.dirname(os.path.abspath(__file__))
    out_dir = os.path.join(base_dir, "data")
    harvest_all(out_dir)
