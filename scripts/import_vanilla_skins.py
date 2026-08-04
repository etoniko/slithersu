# -*- coding: utf-8 -*-
"""Скачать vanilla skins с legendmod, 128px круг, skinlist с русскими никами."""
from __future__ import annotations

import json
import re
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SKINS_DIR = ROOT / "skins"
LIST_PATH = ROOT / "skinlist.txt"
BASE = "https://jimboy3100.github.io/vanillaskins/"
SIZE = 128
START_ID = 200001

# Имена с HTML legendmod.ml/skins Vanilla
SKIN_NAMES = [
    "Alien2_Gamma", "Alien2_Neila", "Alien2_Omicron", "Alien2_Smyg", "Alien2_Vega",
    "AlienX", "Apple", "Apple_Face", "AprilFool", "Army", "Astronaut",
    "Autumn_Acorn", "Autumn_Badger", "Autumn_Faun", "Autumn_Maple", "Autumn_Prey",
    "Autumn_Sly", "Autumn_Squirrel", "Banana", "Baseball", "BaseballSmile",
    "Basketball", "Bat", "Bear", "Birdie", "Bite", "BlackCat", "Blackhole",
    "Blueberry_Face", "Bomb", "Boot", "Bowling", "BraveHeart_Lion", "Breakfast",
    "BrightHeart_Racoon", "BroFist", "Bug", "Cactus", "Candy", "Carrot", "Cat",
    "Chihuahua", "ChilliPepper", "Choco_Egg", "ChupaCabra", "Cloud", "Comet",
    "Cookie", "Cougar", "Coyote", "CozyHeart_Penguin", "Crazy", "Crazy_Ball",
    "Crocodile", "Crow", "CupCake", "Cupid", "Cyclop_Ball", "Dead_Biker",
    "Dead_DesertFox", "Dead_Devourer", "Dead_Nuke", "Dead_Raider", "Dead_Ranger",
    "Dead_Viper", "Diver", "Dog", "Doggie", "Donuts", "Dragon", "Eagle",
    "EarthDay", "Easter_Island", "Evil", "Eye", "Eye_Ball", "Fly", "FootPrint",
    "Fox", "Frog", "FunShine_Bear", "Galaxy", "Gargoyle", "GingerBreadMan",
    "Glub", "Gold_Pot", "Goldfish", "Good", "Gopher", "GreenMan", "Grey",
    "Grinch", "Halloween", "Hamburguer", "Hat", "Heart", "Hockey", "Horse_Shoe",
    "Hot_Dog", "Hunter", "IcecreamFace", "Island_Coconuts", "Island_Pinehead",
    "Island_Scar", "Island_Sea_Turtle", "Island_Seer", "Island_Volcano",
    "Island_Warrior", "Jar_Brain", "JellyBlob", "Journey_Boar", "Journey_BullKing",
    "Journey_JadeDragon", "Journey_Kong", "Journey_Monk", "Journey_WaterSpirit",
    "Journey_WhiteHorse", "Jupiter", "KissBoy", "KissGirl", "Kraken", "Laika",
    "Leaf_Clover", "Leprechaun", "Liberty", "Lion", "Lizard", "LotsaHeart_Elephant",
    "Luchador", "Mammoth", "Mask", "Mercury", "Mighty", "Monster", "Mouse",
    "Mummy_Ball", "Mushroom", "Muu", "Neptune", "Nose", "Nuclear", "Nuclear_Hazmat",
    "Nuclear_Marauder", "Nuclear_Mutant", "Nuclear_Ogre", "Nuclear_Ooze",
    "Nuclear_Scavenger", "Nuclear_ToxicEater", "Octopus", "Owl", "Panda", "Panther",
    "Pineapple_Face", "Pinhata", "Pirate", "Pirates_CannonBall", "Pirates_Captain",
    "Pirates_Monkey", "Pirates_Parrot", "Pirates_PirateGirl", "Pirates_Rascal",
    "Pirates_SkullPirate", "Pizza", "Player_1", "Player_2", "Pluto", "Rabbit",
    "Radar", "Rainbow", "Raptor", "Rocket", "Rooster", "Saturn", "Scarecrow",
    "Seal", "Shark", "Sheep", "Shuttle", "SkullBrain_Ball", "Sky_Rocket",
    "SlimeFace", "Snake", "Snowman", "Soccer_Ball", "Soccer_Shoe", "Sombrero",
    "SpaceHunter", "Spider", "Sports_Basketball", "Sports_BoxingGlub",
    "Sports_Fencing", "Sports_Golf", "Sports_PingPong", "Sports_Target",
    "Sports_Volleyball", "Spy", "StarFish", "Starball", "Stars_and_Stripes",
    "Sumo", "Sun", "Sunbath", "Surfer", "T-Rex", "Target", "TenderHeart_Bear",
    "Terrible", "Thirteen", "Tiger_Pattern", "Tomato_Face", "Tortilha", "Toxic",
    "Treasure_SeaExplorer", "Treasure_Squiggly", "Turtle", "UFO", "Uncle_Sam",
    "Uranus", "Venus", "Virus", "Wasp", "Watermelon", "Willie", "Witch", "Wolf",
    "X-mas", "Zebra_Pattern", "birthday_cia", "birthday_doge", "birthday_lol",
    "birthday_sanik", "birthday_sir", "birthday_troll", "birthday_wojak",
    "evil_eye", "face", "food_Chicken_Leg", "food_Cofee", "food_French_Fries",
    "food_Hamburguer", "food_Jelly_Face", "food_Juice_Can", "food_Terminita",
    "ghost", "pig", "rio_athletic", "rio_gymnastic", "rio_judo", "rio_mico",
    "rio_swimmer", "rio_tennis", "rio_toco", "smile", "toon", "zombie",
]

# Русские ники (короткие, уникальные)
RU = {
    "Alien2_Gamma": "гамма",
    "Alien2_Neila": "нейла",
    "Alien2_Omicron": "омикрон",
    "Alien2_Smyg": "смыг",
    "Alien2_Vega": "вега",
    "AlienX": "пришелец",
    "Apple": "яблоко",
    "Apple_Face": "яблочко",
    "AprilFool": "шутник",
    "Army": "армия",
    "Astronaut": "космонавт",
    "Autumn_Acorn": "жёлудь",
    "Autumn_Badger": "барсук",
    "Autumn_Faun": "фавн",
    "Autumn_Maple": "клён",
    "Autumn_Prey": "добыча",
    "Autumn_Sly": "хитрец",
    "Autumn_Squirrel": "белка",
    "Banana": "банан",
    "Baseball": "бейсбол",
    "BaseballSmile": "мячик",
    "Basketball": "баскетбол",
    "Bat": "летучая",
    "Bear": "медведь",
    "Birdie": "пташка",
    "Bite": "укус",
    "BlackCat": "чёрныйкот",
    "Blackhole": "чёрнаядыра",
    "Blueberry_Face": "черника",
    "Bomb": "бомба",
    "Boot": "сапог",
    "Bowling": "боулинг",
    "BraveHeart_Lion": "храбрыйлев",
    "Breakfast": "завтрак",
    "BrightHeart_Racoon": "енот",
    "BroFist": "кулак",
    "Bug": "жук",
    "Cactus": "кактус",
    "Candy": "конфета",
    "Carrot": "морковка",
    "Cat": "кот",
    "Chihuahua": "чихуахуа",
    "ChilliPepper": "перец",
    "Choco_Egg": "шоколад",
    "ChupaCabra": "чупакабра",
    "Cloud": "облако",
    "Comet": "комета",
    "Cookie": "печенька",
    "Cougar": "пума",
    "Coyote": "койот",
    "CozyHeart_Penguin": "пингвин",
    "Crazy": "безумец",
    "Crazy_Ball": "шарик",
    "Crocodile": "крокодил",
    "Crow": "ворона",
    "CupCake": "кекс",
    "Cupid": "купидон",
    "Cyclop_Ball": "циклоп",
    "Dead_Biker": "байкер",
    "Dead_DesertFox": "лиспустыни",
    "Dead_Devourer": "пожиратель",
    "Dead_Nuke": "ядерный",
    "Dead_Raider": "рейдер",
    "Dead_Ranger": "рейнджер",
    "Dead_Viper": "гадюка",
    "Diver": "дайвер",
    "Dog": "пёс",
    "Doggie": "пёсик",
    "Donuts": "пончик",
    "Dragon": "дракон",
    "Eagle": "орёл",
    "EarthDay": "земля",
    "Easter_Island": "остров",
    "Evil": "злодей",
    "Eye": "глаз",
    "Eye_Ball": "глазик",
    "Fly": "муха",
    "FootPrint": "след",
    "Fox": "лиса",
    "Frog": "лягушка",
    "FunShine_Bear": "солнечный",
    "Galaxy": "галактика",
    "Gargoyle": "горгулья",
    "GingerBreadMan": "пряник",
    "Glub": "глуб",
    "Gold_Pot": "золото",
    "Goldfish": "золотаярыбка",
    "Good": "добряк",
    "Gopher": "суслик",
    "GreenMan": "зелёный",
    "Grey": "серый",
    "Grinch": "гринч",
    "Halloween": "хэллоуин",
    "Hamburguer": "бургер",
    "Hat": "шляпа",
    "Heart": "сердце",
    "Hockey": "хоккей",
    "Horse_Shoe": "подкова",
    "Hot_Dog": "хотдог",
    "Hunter": "охотник",
    "IcecreamFace": "мороженое",
    "Island_Coconuts": "кокос",
    "Island_Pinehead": "ананас",
    "Island_Scar": "шрам",
    "Island_Sea_Turtle": "черепаха",
    "Island_Seer": "провидец",
    "Island_Volcano": "вулкан",
    "Island_Warrior": "воин",
    "Jar_Brain": "мозг",
    "JellyBlob": "желе",
    "Journey_Boar": "кабан",
    "Journey_BullKing": "бык",
    "Journey_JadeDragon": "нефритовый",
    "Journey_Kong": "конг",
    "Journey_Monk": "монах",
    "Journey_WaterSpirit": "духводы",
    "Journey_WhiteHorse": "белыйконь",
    "Jupiter": "юпитер",
    "KissBoy": "поцелуй",
    "KissGirl": "поцелуйчик",
    "Kraken": "кракен",
    "Laika": "лайка",
    "Leaf_Clover": "клевер",
    "Leprechaun": "лепрекон",
    "Liberty": "свобода",
    "Lion": "лев",
    "Lizard": "ящерица",
    "LotsaHeart_Elephant": "слон",
    "Luchador": "лучадор",
    "Mammoth": "мамонт",
    "Mask": "маска",
    "Mercury": "меркурий",
    "Mighty": "могучий",
    "Monster": "монстр",
    "Mouse": "мышь",
    "Mummy_Ball": "мумия",
    "Mushroom": "гриб",
    "Muu": "муу",
    "Neptune": "нептун",
    "Nose": "нос",
    "Nuclear": "атом",
    "Nuclear_Hazmat": "хазмат",
    "Nuclear_Marauder": "мародёр",
    "Nuclear_Mutant": "мутант",
    "Nuclear_Ogre": "огр",
    "Nuclear_Ooze": "слякоть",
    "Nuclear_Scavenger": "падальщик",
    "Nuclear_ToxicEater": "токсик",
    "Octopus": "осьминог",
    "Owl": "сова",
    "Panda": "панда",
    "Panther": "пантера",
    "Pineapple_Face": "ананасик",
    "Pinhata": "пиньята",
    "Pirate": "пират",
    "Pirates_CannonBall": "ядро",
    "Pirates_Captain": "капитан",
    "Pirates_Monkey": "обезьяна",
    "Pirates_Parrot": "попугай",
    "Pirates_PirateGirl": "пиратка",
    "Pirates_Rascal": "плут",
    "Pirates_SkullPirate": "череп",
    "Pizza": "пицца",
    "Player_1": "игрок1",
    "Player_2": "игрок2",
    "Pluto": "плутон",
    "Rabbit": "кролик",
    "Radar": "радар",
    "Rainbow": "радуга",
    "Raptor": "раптор",
    "Rocket": "ракета",
    "Rooster": "петух",
    "Saturn": "сатурн",
    "Scarecrow": "пугало",
    "Seal": "тюлень",
    "Shark": "акула",
    "Sheep": "овца",
    "Shuttle": "шаттл",
    "SkullBrain_Ball": "черепмозг",
    "Sky_Rocket": "фейерверк",
    "SlimeFace": "слизь",
    "Snake": "змея",
    "Snowman": "снеговик",
    "Soccer_Ball": "футбол",
    "Soccer_Shoe": "бутса",
    "Sombrero": "сомбреро",
    "SpaceHunter": "охотниккосмос",
    "Spider": "паук",
    "Sports_Basketball": "баскет",
    "Sports_BoxingGlub": "бокс",
    "Sports_Fencing": "фехтование",
    "Sports_Golf": "гольф",
    "Sports_PingPong": "пингпонг",
    "Sports_Target": "мишень",
    "Sports_Volleyball": "волейбол",
    "Spy": "шпион",
    "StarFish": "звезда",
    "Starball": "звёздочка",
    "Stars_and_Stripes": "америка",
    "Sumo": "сумо",
    "Sun": "солнце",
    "Sunbath": "загар",
    "Surfer": "сёрфер",
    "T-Rex": "тирекс",
    "Target": "цель",
    "TenderHeart_Bear": "мишка",
    "Terrible": "ужас",
    "Thirteen": "тринадцать",
    "Tiger_Pattern": "тигр",
    "Tomato_Face": "помидор",
    "Tortilha": "тортилья",
    "Toxic": "яд",
    "Treasure_SeaExplorer": "мореход",
    "Treasure_Squiggly": "извилина",
    "Turtle": "черепашка",
    "UFO": "нло",
    "Uncle_Sam": "дядясэм",
    "Uranus": "уран",
    "Venus": "венера",
    "Virus": "вирус",
    "Wasp": "оса",
    "Watermelon": "арбуз",
    "Willie": "вилли",
    "Witch": "ведьма",
    "Wolf": "волк",
    "X-mas": "новыйгод",
    "Zebra_Pattern": "зебра",
    "birthday_cia": "циа",
    "birthday_doge": "доге",
    "birthday_lol": "лол",
    "birthday_sanik": "саник",
    "birthday_sir": "сэр",
    "birthday_troll": "тролль",
    "birthday_wojak": "воджак",
    "evil_eye": "злойглаз",
    "face": "лицо",
    "food_Chicken_Leg": "курица",
    "food_Cofee": "кофе",
    "food_French_Fries": "картошка",
    "food_Hamburguer": "гамбургер",
    "food_Jelly_Face": "желелицо",
    "food_Juice_Can": "сок",
    "food_Terminita": "терминита",
    "ghost": "призрак",
    "pig": "свинья",
    "rio_athletic": "атлет",
    "rio_gymnastic": "гимнаст",
    "rio_judo": "дзюдо",
    "rio_mico": "мико",
    "rio_swimmer": "пловец",
    "rio_tennis": "теннис",
    "rio_toco": "токо",
    "smile": "улыбка",
    "toon": "мультик",
    "zombie": "зомби",
}


def to_circle(img: Image.Image, size: int = SIZE) -> Image.Image:
    img = img.convert("RGBA")
    # cover-fit в квадрат
    w, h = img.size
    scale = max(size / w, size / h)
    nw, nh = max(1, int(w * scale)), max(1, int(h * scale))
    img = img.resize((nw, nh), Image.Resampling.LANCZOS)
    left = (nw - size) // 2
    top = (nh - size) // 2
    img = img.crop((left, top, left + size, top + size))

    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse((0, 0, size - 1, size - 1), fill=255)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask=mask)
    return out


def unique_nicks(mapping: dict[str, str]) -> dict[str, str]:
    used: dict[str, str] = {}
    out: dict[str, str] = {}
    for en, ru in mapping.items():
        nick = re.sub(r"\s+", "", ru.lower())
        base = nick
        n = 2
        while nick in used:
            nick = f"{base}{n}"
            n += 1
        used[nick] = en
        out[en] = nick
    return out


def download(name: str) -> Image.Image | None:
    url = BASE + name + ".png"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=30) as r:
            data = r.read()
        from io import BytesIO
        return Image.open(BytesIO(data))
    except Exception as e:
        print("FAIL", name, e)
        return None


def main():
    SKINS_DIR.mkdir(parents=True, exist_ok=True)
    nicks = unique_nicks({k: RU.get(k, k.lower()) for k in SKIN_NAMES})

    # Сохраняем кастомные строки (не 200xxx)
    keep_lines: list[str] = []
    if LIST_PATH.exists():
        for line in LIST_PATH.read_text(encoding="utf-8").splitlines():
            s = line.strip()
            if not s or s.startswith("#"):
                continue
            if ":" not in s:
                continue
            nick, sid = s.split(":", 1)
            sid = sid.strip()
            if re.fullmatch(r"\d{6}", sid) and not sid.startswith("20"):
                keep_lines.append(f"{nick.strip()}:{sid}")

    rows: list[str] = []
    meta = []
    for i, name in enumerate(SKIN_NAMES):
        sid = f"{START_ID + i:06d}"
        img = download(name)
        if img is None:
            continue
        circle = to_circle(img)
        out_path = SKINS_DIR / f"{sid}.png"
        circle.save(out_path, "PNG", optimize=True)
        ru = nicks[name]
        rows.append(f"{ru}:{sid}")
        meta.append({"id": sid, "en": name, "ru": ru})
        print(f"OK {sid} {ru} <- {name}")

    header = [
        "# Автогенерация: vanilla skins с legendmod.ml",
        "# nick:idcode → skins/XXXXXX.png (128px круг)",
        "# Кастомные скины сохранены выше блока vanilla",
        "",
    ]
    text = "\n".join(header + keep_lines + [""] + ["# === vanilla ==="] + rows) + "\n"
    LIST_PATH.write_text(text, encoding="utf-8")
    (ROOT / "scripts" / "vanilla_skins_meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"\nDone: {len(rows)} skins -> {SKINS_DIR}")
    print(f"skinlist: {LIST_PATH}")


if __name__ == "__main__":
    main()
