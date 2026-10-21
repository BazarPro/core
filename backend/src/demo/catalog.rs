//! Texts of the demo data in German and English: photos, categories, people, items.

use crate::i18n::Locale;

/// Photos from Unsplash (free to use), downloaded when seeding: key and photo ID.
pub const IMAGES: &[(&str, &str)] = &[
    // Covers of the events
    ("cover_winter", "photo-1517048676732-d65bc937f952"),
    ("cover_bikes", "photo-1759300632932-09738e21dc13"),
    ("cover_rack", "photo-1470309864661-68328b2cd0a5"),
    ("cover_store", "photo-1441986300917-64674bd600d8"),
    ("cover_market", "photo-1533900298318-6b8da08a523e"),
    ("cover_clothes", "photo-1520006403909-838d6b92c22e"),
    ("cover_library", "photo-1481627834876-b7833e8f5570"),
    // Items of the seed users (end-to-end tests)
    ("ski", "photo-1551698618-1dfe5d97d256"),
    ("ski_helmet", "photo-1670113125057-ac1220b5e90a"),
    ("jacket", "photo-1591047139829-d91aecb6caea"),
    ("boots", "photo-1605733160314-4fc7dac4bb16"),
    ("mtb", "photo-1673121414328-52eff37bc6d0"),
    ("mtb_mountains", "photo-1728121777927-9dfdfb3058d2"),
    ("bike_helmet", "photo-1591511275477-88f079d88154"),
    // Items of the other demo users
    ("bike_city", "photo-1485965120184-e220f721d03e"),
    ("bike_road", "photo-1532298229144-0ec0c57515c7"),
    ("bike_gravel", "photo-1576435728678-68d0fbf94e91"),
    ("shirts", "photo-1489987707025-afc232f7ea0f"),
    ("tees", "photo-1523381210434-271e8be1f52b"),
    ("jeans", "photo-1565084888279-aca607ecce0c"),
    ("knit", "photo-1556905055-8f358a7a47b2"),
    ("sneakers", "photo-1560769629-975ec94e6a86"),
    ("sneaker_brown", "photo-1549298916-b41d501d3772"),
    ("sneakers_pastel", "photo-1595950653106-6c9ebd614d3a"),
    ("headphones", "photo-1505740420928-5e560c06d30e"),
    ("camera", "photo-1526170375885-4d8ecf77b99f"),
    ("laptop", "photo-1517336714731-489689fd1ca8"),
    ("phone", "photo-1511707171634-5f897ff02aa9"),
    ("tv_board", "photo-1567690187548-f07b1d7bf5a9"),
    ("books", "photo-1512820790803-83ca734da794"),
    ("robots", "photo-1558060370-d644479cb6f7"),
    ("wooden_train", "photo-1596461404969-9ae70f2830c1"),
    ("toys", "photo-1515488042361-ee00e0ddd4e4"),
    ("sofa", "photo-1555041469-a586c61ea9bc"),
    ("chair", "photo-1592078615290-033ee584e267"),
    ("armchair", "photo-1586023492125-27b2c045efd7"),
    ("tote", "photo-1544816155-12df9643f363"),
];

pub fn image_url(id: &str) -> String {
    format!("https://images.unsplash.com/{id}?q=80&w=1000")
}

/// German or English, whichever the demo is seeded in.
#[derive(Clone, Copy)]
pub struct Text {
    pub de: &'static str,
    pub en: &'static str,
}

impl Text {
    pub fn get(self, locale: Locale) -> &'static str {
        match locale {
            Locale::De => self.de,
            Locale::En => self.en,
        }
    }
}

pub const fn t(de: &'static str, en: &'static str) -> Text {
    Text { de, en }
}

#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub enum Cat {
    Clothing,
    Shoes,
    Sports,
    Bikes,
    Electronics,
    Books,
    Toys,
    Furniture,
    Household,
    Accessories,
    Other,
}

impl Cat {
    /// Symbol photo for items without one of their own
    pub fn photo(self) -> &'static str {
        match self {
            Self::Clothing => "shirts",
            Self::Shoes => "sneakers",
            Self::Sports => "ski_helmet",
            Self::Bikes => "bike_city",
            Self::Electronics => "headphones",
            Self::Books => "books",
            Self::Toys => "toys",
            Self::Furniture => "chair",
            Self::Household | Self::Accessories => "tote",
            Self::Other => "wooden_train",
        }
    }
}

/// The default categories (categories.seedCategories), in both languages.
pub const CATEGORIES: &[(Cat, Text)] = &[
    (Cat::Clothing, t("Kleidung", "Clothing")),
    (Cat::Shoes, t("Schuhe", "Shoes")),
    (Cat::Sports, t("Sport", "Sports")),
    (Cat::Bikes, t("Fahrräder", "Bikes")),
    (Cat::Electronics, t("Elektronik", "Electronics")),
    (Cat::Books, t("Bücher", "Books")),
    (Cat::Toys, t("Spielzeug", "Toys")),
    (Cat::Furniture, t("Möbel", "Furniture")),
    (Cat::Household, t("Haushalt", "Household")),
    (Cat::Accessories, t("Accessoires", "Accessories")),
    (Cat::Other, t("Sonstiges", "Other")),
];

pub struct Person {
    pub first: Text,
    pub last: Text,
}

const fn p(
    first_de: &'static str,
    last_de: &'static str,
    first_en: &'static str,
    last_en: &'static str,
) -> Person {
    Person {
        first: t(first_de, first_en),
        last: t(last_de, last_en),
    }
}

/// Organizers of the demo events: kids' bazaar, ski bazaar, flea markets, a newcomer.
pub const ORGANIZERS: [Person; 4] = [
    p("Sabine", "Krause", "Sarah", "Miller"),
    p("Thomas", "Berger", "Tom", "Baker"),
    p("Miriam", "Okafor", "Grace", "Okafor"),
    p("Jonas", "Weber", "Jonah", "Walker"),
];

pub const HELPERS: [Person; 3] = [
    p("Lena", "Hoffmann", "Lily", "Hughes"),
    p("Paul", "Schröder", "Paul", "Turner"),
    p("Aylin", "Demir", "Aisha", "Khan"),
];

pub const SELLERS: [Person; 20] = [
    p("Anna", "Schmidt", "Amelia", "Smith"),
    p("Ben", "Fischer", "Ben", "Foster"),
    p("Clara", "Wagner", "Chloe", "Wright"),
    p("David", "Becker", "Daniel", "Cooper"),
    p("Emma", "Schulz", "Emily", "Clarke"),
    p("Felix", "Richter", "Finn", "Murphy"),
    p("Greta", "Klein", "Georgia", "Lee"),
    p("Hannah", "Wolf", "Hannah", "Ward"),
    p("Ismail", "Yılmaz", "Isaac", "Patel"),
    p("Julia", "Neumann", "Julia", "Evans"),
    p("Karl", "Schwarz", "Kyle", "Morgan"),
    p("Laura", "Zimmermann", "Laura", "Bennett"),
    p("Moritz", "Braun", "Matt", "Brooks"),
    p("Nina", "Hartmann", "Nora", "Price"),
    p("Oskar", "Lange", "Oliver", "Grant"),
    p("Pia", "Krüger", "Poppy", "Reed"),
    p("Quentin", "Roth", "Quinn", "Hayes"),
    p("Rosa", "Vogel", "Rosie", "Bell"),
    p("Sven", "Jäger", "Sam", "Fletcher"),
    p("Tanja", "Peters", "Tara", "Collins"),
];

pub const BUYERS: [Person; 6] = [
    p("Uwe", "Maier", "Ursula", "Green"),
    p("Vera", "König", "Victor", "Adams"),
    p("Werner", "Huber", "Will", "Harris"),
    p("Xenia", "Frank", "Xander", "Young"),
    p("Yusuf", "Arslan", "Yasmin", "Ali"),
    p("Zoe", "Lehmann", "Zoe", "Carter"),
];

/// Accounts in the other states: banned after spam, inactive, not verified yet.
pub const SPAMMER: Person = p("Kevin", "Spam", "Kevin", "Spam");
pub const INACTIVE: Person = p("Rita", "Ruhe", "Rita", "Rest");
pub const UNVERIFIED: Person = p("Nora", "Neu", "Nora", "New");

/// Walk-in seller without account at the kids' bazaar
pub const WALK_IN: Person = p("Ilse", "Bauer", "Irene", "Baxter");

pub const STREETS: &[Text] = &[
    t("Lindenstraße", "Linden Street"),
    t("Bahnhofstraße", "Station Road"),
    t("Gartenweg", "Garden Lane"),
    t("Schillerstraße", "Church Street"),
    t("Am Mühlbach", "Mill Lane"),
    t("Rosenweg", "Rose Avenue"),
    t("Bergstraße", "Hill Road"),
    t("Kirchplatz", "Park Road"),
];

pub struct City {
    pub zip: &'static str,
    pub name: &'static str,
    pub country: &'static str,
}

pub fn city(locale: Locale, index: usize) -> City {
    const DE: [City; 3] = [
        City {
            zip: "89073",
            name: "Ulm",
            country: "Deutschland",
        },
        City {
            zip: "89231",
            name: "Neu-Ulm",
            country: "Deutschland",
        },
        City {
            zip: "89077",
            name: "Ulm",
            country: "Deutschland",
        },
    ];
    const EN: [City; 3] = [
        City {
            zip: "OX1 2JD",
            name: "Oxford",
            country: "United Kingdom",
        },
        City {
            zip: "OX4 1AB",
            name: "Oxford",
            country: "United Kingdom",
        },
        City {
            zip: "OX2 6NN",
            name: "Oxford",
            country: "United Kingdom",
        },
    ];
    let list = match locale {
        Locale::De => DE,
        Locale::En => EN,
    };
    let City { zip, name, country } = &list[index % list.len()];
    City { zip, name, country }
}

/// An item a demo seller brings; attributes are (key, German value, English value).
pub struct Item {
    pub title: Text,
    pub description: Text,
    pub price: f64,
    pub minimum_price: Option<f64>,
    pub condition: &'static str,
    pub cat: Cat,
    pub attrs: &'static [(&'static str, &'static str, &'static str)],
    pub image: Option<&'static str>,
}

const fn item(
    cat: Cat,
    condition: &'static str,
    price: f64,
    image: Option<&'static str>,
    title: Text,
    description: Text,
    attrs: &'static [(&'static str, &'static str, &'static str)],
) -> Item {
    Item {
        title,
        description,
        price,
        minimum_price: None,
        condition,
        cat,
        attrs,
        image,
    }
}

const fn haggle(mut item: Item, minimum: f64) -> Item {
    item.minimum_price = Some(minimum);
    item
}

/// Children's clothes, toys and gear for the kids' bazaar.
pub const KIDS: &[Item] = &[
    item(
        Cat::Clothing,
        "very-good",
        8.0,
        Some("tees"),
        t(
            "T-Shirt-Paket Gr. 110/116 (5 Stück)",
            "T-shirt bundle size 4-5 years (5 pieces)",
        ),
        t(
            "Fünf T-Shirts in Grün- und Blautönen, kaum getragen, keine Flecken.",
            "Five T-shirts in green and blue, hardly worn, no stains.",
        ),
        &[("size", "110/116", "4-5 years")],
    ),
    item(
        Cat::Clothing,
        "good",
        12.0,
        Some("jacket"),
        t("Übergangsjacke Gr. 122", "Spring jacket size 6-7 years"),
        t(
            "Wasserabweisend, mit abnehmbarer Kapuze. Ärmel leicht ausgewaschen.",
            "Water-repellent with a detachable hood. Sleeves slightly faded.",
        ),
        &[("size", "122", "6-7 years")],
    ),
    item(
        Cat::Clothing,
        "very-good",
        15.0,
        Some("knit"),
        t(
            "Strickpullover und Mütze Gr. 128",
            "Knitted jumper and hat age 8",
        ),
        t(
            "Handgestrickt aus Merinowolle, sehr warm.",
            "Hand-knitted merino wool, very warm.",
        ),
        &[("size", "128", "8 years")],
    ),
    item(
        Cat::Clothing,
        "good",
        6.0,
        Some("jeans"),
        t("Jeans Gr. 134, zwei Stück", "Two pairs of jeans age 9"),
        t(
            "Eine dunkelblau, eine hellblau, verstellbarer Bund.",
            "One dark, one light blue, adjustable waist.",
        ),
        &[("size", "134", "9 years")],
    ),
    item(
        Cat::Clothing,
        "new",
        18.0,
        Some("shirts"),
        t(
            "Festliche Hemden Gr. 140 (3 Stück)",
            "Smart shirts age 10 (3 pieces)",
        ),
        t(
            "Nur einmal zur Kommunion getragen.",
            "Worn once for a family celebration.",
        ),
        &[("size", "140", "10 years")],
    ),
    item(
        Cat::Clothing,
        "good",
        9.0,
        None,
        t("Schneeanzug Gr. 98", "Snowsuit age 3"),
        t(
            "Gefüttert, mit Füßlingen. Reißverschluss läuft einwandfrei.",
            "Lined, with foot straps. Zip works perfectly.",
        ),
        &[("size", "98", "3 years")],
    ),
    item(
        Cat::Clothing,
        "very-good",
        5.0,
        None,
        t(
            "Body-Set Gr. 62/68 (8 Stück)",
            "Baby bodysuits 3-6 months (8 pieces)",
        ),
        t(
            "Bio-Baumwolle, kurz- und langärmlig gemischt.",
            "Organic cotton, short and long sleeves.",
        ),
        &[("size", "62/68", "3-6 months")],
    ),
    item(
        Cat::Shoes,
        "very-good",
        14.0,
        Some("sneakers_pastel"),
        t("Turnschuhe Gr. 31", "Trainers size 12.5 kids"),
        t(
            "Klettverschluss, helle Sohle, kaum Abrieb.",
            "Velcro straps, light sole, barely worn.",
        ),
        &[("size", "31", "12.5 kids")],
    ),
    item(
        Cat::Shoes,
        "good",
        10.0,
        Some("boots"),
        t("Winterstiefel Gr. 29", "Winter boots size 11 kids"),
        t(
            "Gefüttert und wasserdicht, Profil noch gut.",
            "Lined and waterproof, tread still good.",
        ),
        &[("size", "29", "11 kids")],
    ),
    item(
        Cat::Shoes,
        "good",
        7.0,
        Some("sneakers"),
        t("Hallenschuhe Gr. 33", "Indoor sports shoes size 1"),
        t(
            "Helle Sohle, für den Schulsport.",
            "Non-marking soles for school PE.",
        ),
        &[("size", "33", "1")],
    ),
    item(
        Cat::Toys,
        "good",
        25.0,
        Some("wooden_train"),
        t("Holzeisenbahn mit Bahnhof", "Wooden railway with station"),
        t(
            "Über 40 Teile, Schienen, Brücke, zwei Loks mit Magnetkupplung.",
            "Over 40 pieces: tracks, bridge, two magnetic engines.",
        ),
        &[],
    ),
    item(
        Cat::Toys,
        "very-good",
        18.0,
        Some("robots"),
        t("Roboter-Sammlung aus Blech", "Tin robot collection"),
        t(
            "Sechs Aufziehroboter, alle laufen noch.",
            "Six wind-up robots, all still walking.",
        ),
        &[],
    ),
    item(
        Cat::Toys,
        "good",
        12.0,
        Some("toys"),
        t(
            "Kuscheltiere und Holztiere (Kiste)",
            "Box of soft toys and wooden animals",
        ),
        t(
            "Gewaschen, aus tierfreiem Haushalt.",
            "Washed, from a pet-free home.",
        ),
        &[],
    ),
    item(
        Cat::Toys,
        "very-good",
        30.0,
        None,
        t("Bausteine-Set Bauernhof", "Building bricks farm set"),
        t(
            "Komplett mit Anleitung und Originalkarton.",
            "Complete with instructions and box.",
        ),
        &[],
    ),
    item(
        Cat::Toys,
        "good",
        8.0,
        None,
        t(
            "Puzzle-Paket ab 4 Jahren (6 Stück)",
            "Six jigsaw puzzles, age 4+",
        ),
        t(
            "Alle vollständig, 24 bis 100 Teile.",
            "All complete, 24 to 100 pieces.",
        ),
        &[],
    ),
    item(
        Cat::Toys,
        "ok",
        4.0,
        None,
        t("Sandspielzeug-Eimer", "Bucket of sand toys"),
        t(
            "Schaufeln, Förmchen, Sieb – gebraucht, aber vollständig.",
            "Spades, moulds and a sieve – used but complete.",
        ),
        &[],
    ),
    item(
        Cat::Books,
        "very-good",
        6.0,
        Some("books"),
        t("Erstlesebücher (5 Stück)", "Early reader books (5)"),
        t(
            "Lesestufe 1 und 2, wie neu.",
            "Reading levels 1 and 2, like new.",
        ),
        &[],
    ),
    item(
        Cat::Books,
        "good",
        3.0,
        None,
        t("Bilderbuch „Der Mondbär“", "Picture book “The Moon Bear”"),
        t("Ecken leicht bestoßen.", "Corners slightly worn."),
        &[],
    ),
    item(
        Cat::Books,
        "good",
        8.0,
        None,
        t(
            "Kinderlexikon in zwei Bänden",
            "Children's encyclopedia, two volumes",
        ),
        t(
            "Mit vielen Fotos, gut erhalten.",
            "Lots of photos, good condition.",
        ),
        &[],
    ),
    haggle(
        item(
            Cat::Other,
            "good",
            140.0,
            None,
            t("Kinderwagen mit Babywanne", "Pram with carrycot"),
            t(
                "Luftreifen, Regenverdeck und Wickeltasche dabei.",
                "Air tyres, rain cover and changing bag included.",
            ),
            &[],
        ),
        110.0,
    ),
    haggle(
        item(
            Cat::Furniture,
            "very-good",
            45.0,
            Some("chair"),
            t("Mitwachsender Kinderstuhl", "Adjustable children's chair"),
            t(
                "Höhenverstellbar, Buche natur.",
                "Height adjustable, natural beech.",
            ),
            &[],
        ),
        35.0,
    ),
    item(
        Cat::Other,
        "good",
        35.0,
        None,
        t("Autokindersitz 9–18 kg", "Child car seat 9–18 kg"),
        t(
            "Unfallfrei, Bezug gewaschen.",
            "Accident-free, cover washed.",
        ),
        &[],
    ),
    item(
        Cat::Bikes,
        "good",
        55.0,
        Some("bike_city"),
        t("Kinderfahrrad 16 Zoll", "Kids' bike 16 inch"),
        t(
            "Mit Stützrädern und Klingel.",
            "With stabilisers and a bell.",
        ),
        &[
            ("wheelSize", "16 Zoll", "16 inch"),
            ("brand", "Puky", "Puky"),
        ],
    ),
    item(
        Cat::Sports,
        "very-good",
        20.0,
        Some("bike_helmet"),
        t(
            "Kinderhelm Gr. S (48–54 cm)",
            "Kids' helmet size S (48–54 cm)",
        ),
        t(
            "Sturzfrei, mit Rücklicht.",
            "Never crashed, with rear light.",
        ),
        &[("size", "S", "S")],
    ),
];

/// Ski and winter gear for the ski bazaar.
pub const SKI: &[Item] = &[
    haggle(
        item(
            Cat::Sports,
            "good",
            180.0,
            Some("ski"),
            t(
                "Allmountain-Ski 170 cm mit Bindung",
                "All-mountain skis 170 cm with bindings",
            ),
            t(
                "Belag und Kanten frisch geschliffen, Bindung auf 35 cm Sohle eingestellt.",
                "Base and edges freshly serviced, bindings set for 35 cm boot sole.",
            ),
            &[("size", "170 cm", "170 cm"), ("brand", "Atomic", "Atomic")],
        ),
        150.0,
    ),
    item(
        Cat::Sports,
        "very-good",
        90.0,
        Some("ski"),
        t("Kinderski 120 cm", "Kids' skis 120 cm"),
        t(
            "Zwei Saisons gefahren, Bindung bis 30 kg.",
            "Used for two seasons, bindings up to 30 kg.",
        ),
        &[("size", "120 cm", "120 cm"), ("brand", "Head", "Head")],
    ),
    item(
        Cat::Sports,
        "good",
        140.0,
        None,
        t(
            "Snowboard 152 cm mit Bindung",
            "Snowboard 152 cm with bindings",
        ),
        t(
            "Camber, ein paar Kratzer auf der Oberseite.",
            "Camber profile, a few scratches on top.",
        ),
        &[("size", "152 cm", "152 cm"), ("brand", "Burton", "Burton")],
    ),
    item(
        Cat::Sports,
        "very-good",
        45.0,
        Some("ski_helmet"),
        t("Skihelm mit Visier Gr. M", "Ski helmet with visor size M"),
        t(
            "Visier kratzerfrei, Größe verstellbar.",
            "Visor without scratches, adjustable size.",
        ),
        &[("size", "M", "M"), ("brand", "Uvex", "Uvex")],
    ),
    item(
        Cat::Shoes,
        "good",
        60.0,
        Some("boots"),
        t("Skischuhe Mondo 27,5", "Ski boots mondo 27.5"),
        t(
            "Flex 90, Innenschuh angenehm.",
            "Flex 90, comfortable liners.",
        ),
        &[("size", "43", "9"), ("brand", "Salomon", "Salomon")],
    ),
    item(
        Cat::Shoes,
        "very-good",
        40.0,
        None,
        t("Kinder-Skischuhe Mondo 22", "Kids' ski boots mondo 22"),
        t(
            "Eine Schnalle, leicht anzuziehen.",
            "Single buckle, easy to put on.",
        ),
        &[("size", "35", "3"), ("brand", "Nordica", "Nordica")],
    ),
    item(
        Cat::Clothing,
        "very-good",
        70.0,
        Some("jacket"),
        t("Skijacke Damen Gr. 38", "Women's ski jacket size 10"),
        t(
            "Wassersäule 10.000 mm, Schneefang.",
            "10,000 mm waterproof rating, snow skirt.",
        ),
        &[("size", "38", "10")],
    ),
    item(
        Cat::Clothing,
        "good",
        35.0,
        None,
        t("Skihose Kinder Gr. 140", "Kids' ski trousers age 10"),
        t(
            "Verstärkte Knie, verstellbare Träger.",
            "Reinforced knees, adjustable braces.",
        ),
        &[("size", "140", "10 years")],
    ),
    item(
        Cat::Clothing,
        "new",
        25.0,
        Some("knit"),
        t("Funktionsunterwäsche-Set Gr. M", "Base layer set size M"),
        t("Noch originalverpackt.", "Still in the original packaging."),
        &[("size", "M", "M")],
    ),
    item(
        Cat::Sports,
        "good",
        15.0,
        None,
        t("Skistöcke 120 cm", "Ski poles 120 cm"),
        t(
            "Aluminium, Teller für Tiefschnee.",
            "Aluminium, powder baskets.",
        ),
        &[("size", "120 cm", "120 cm")],
    ),
    item(
        Cat::Sports,
        "very-good",
        30.0,
        None,
        t(
            "Skibrille mit Wechselscheibe",
            "Ski goggles with spare lens",
        ),
        t(
            "Helmkompatibel, mit Beutel.",
            "Helmet compatible, with pouch.",
        ),
        &[("brand", "Oakley", "Oakley")],
    ),
    item(
        Cat::Sports,
        "good",
        55.0,
        None,
        t("Schlittschuhe Gr. 38", "Ice skates size 5"),
        t("Kufen frisch geschliffen.", "Blades freshly sharpened."),
        &[("size", "38", "5")],
    ),
    item(
        Cat::Sports,
        "good",
        40.0,
        None,
        t("Holzschlitten Davos", "Wooden sledge"),
        t(
            "Klassiker, Kufen leicht rostig.",
            "A classic, runners slightly rusty.",
        ),
        &[],
    ),
    item(
        Cat::Accessories,
        "very-good",
        12.0,
        None,
        t("Handschuhe und Mütze Kinder", "Kids' gloves and hat"),
        t("Wasserdicht, Fleece-Futter.", "Waterproof, fleece lined."),
        &[],
    ),
];

/// Household, electronics, furniture and more for the flea markets.
pub const GENERAL: &[Item] = &[
    haggle(
        item(
            Cat::Electronics,
            "very-good",
            65.0,
            Some("headphones"),
            t(
                "Bluetooth-Kopfhörer mit Noise Cancelling",
                "Bluetooth noise-cancelling headphones",
            ),
            t(
                "Akku hält ca. 25 Stunden, mit Ladekabel und Etui.",
                "Battery lasts about 25 hours, with cable and case.",
            ),
            &[
                ("brand", "Sony", "Sony"),
                ("model", "WH-1000XM3", "WH-1000XM3"),
            ],
        ),
        50.0,
    ),
    item(
        Cat::Electronics,
        "good",
        45.0,
        Some("camera"),
        t("Sofortbildkamera", "Instant camera"),
        t(
            "Funktioniert einwandfrei, Film nicht enthalten.",
            "Works perfectly, film not included.",
        ),
        &[("brand", "Polaroid", "Polaroid"), ("model", "Now", "Now")],
    ),
    haggle(
        item(
            Cat::Electronics,
            "good",
            320.0,
            Some("laptop"),
            t("Notebook 13 Zoll, 16 GB RAM", "13-inch laptop, 16 GB RAM"),
            t(
                "Akku bei 87 %, frisch aufgesetzt, Ladegerät dabei.",
                "Battery at 87 %, freshly reset, charger included.",
            ),
            &[
                ("brand", "Apple", "Apple"),
                ("model", "MacBook Air 2020", "MacBook Air 2020"),
            ],
        ),
        280.0,
    ),
    item(
        Cat::Electronics,
        "ok",
        90.0,
        Some("phone"),
        t("Smartphone 64 GB", "Smartphone 64 GB"),
        t(
            "Display mit kleinem Kratzer, Akku neu.",
            "Small scratch on the screen, new battery.",
        ),
        &[
            ("brand", "Apple", "Apple"),
            ("model", "iPhone XR", "iPhone XR"),
        ],
    ),
    item(
        Cat::Electronics,
        "good",
        20.0,
        None,
        t("Radiowecker mit DAB+", "DAB+ clock radio"),
        t(
            "Zwei Weckzeiten, dimmbares Display.",
            "Two alarms, dimmable display.",
        ),
        &[("brand", "Grundig", "Roberts")],
    ),
    item(
        Cat::Furniture,
        "good",
        150.0,
        Some("sofa"),
        t("Zweisitzer-Sofa Samt grün", "Two-seater velvet sofa, green"),
        t(
            "Selbstabholung, Maße 160 × 85 cm.",
            "Collection only, 160 × 85 cm.",
        ),
        &[],
    ),
    item(
        Cat::Furniture,
        "very-good",
        60.0,
        Some("armchair"),
        t(
            "Sessel gelb mit Holzbeinen",
            "Yellow armchair with wooden legs",
        ),
        t("Bezug abnehmbar und gewaschen.", "Removable, washed cover."),
        &[],
    ),
    item(
        Cat::Furniture,
        "good",
        25.0,
        Some("chair"),
        t(
            "Esszimmerstuhl schwarz (2 Stück)",
            "Black dining chairs (pair)",
        ),
        t("Kunststoffschale, Eichenbeine.", "Plastic shell, oak legs."),
        &[],
    ),
    item(
        Cat::Furniture,
        "good",
        40.0,
        Some("tv_board"),
        t("TV-Lowboard weiß mit Körben", "White TV unit with baskets"),
        t(
            "Breite 120 cm, vier Stoffkörbe.",
            "120 cm wide, four fabric baskets.",
        ),
        &[],
    ),
    item(
        Cat::Household,
        "very-good",
        15.0,
        None,
        t("Kaffeeservice für 6 Personen", "Coffee set for six"),
        t(
            "Porzellan, vollständig, spülmaschinenfest.",
            "Porcelain, complete, dishwasher safe.",
        ),
        &[],
    ),
    item(
        Cat::Household,
        "good",
        30.0,
        None,
        t("Küchenmaschine mit Rührschüssel", "Stand mixer with bowl"),
        t(
            "Knethaken, Schneebesen und Flachrührer dabei.",
            "Dough hook, whisk and beater included.",
        ),
        &[],
    ),
    item(
        Cat::Household,
        "good",
        8.0,
        None,
        t("Bettwäsche 135 × 200 (2 Sets)", "Duvet covers, two sets"),
        t("Baumwolle, frisch gewaschen.", "Cotton, freshly washed."),
        &[],
    ),
    item(
        Cat::Household,
        "new",
        12.0,
        None,
        t("Gusseiserne Pfanne 26 cm", "Cast iron pan 26 cm"),
        t(
            "Unbenutzt, Geschenk doppelt bekommen.",
            "Unused, a duplicate present.",
        ),
        &[],
    ),
    item(
        Cat::Clothing,
        "very-good",
        35.0,
        Some("jacket"),
        t("Bomberjacke Gr. M", "Bomber jacket size M"),
        t("Rostbraun, kaum getragen.", "Rust brown, hardly worn."),
        &[("size", "M", "M")],
    ),
    item(
        Cat::Clothing,
        "good",
        15.0,
        Some("jeans"),
        t("Jeans Herren W32/L32", "Men's jeans W32/L32"),
        t("Straight Fit, dunkelblau.", "Straight fit, dark blue."),
        &[("size", "W32/L32", "W32/L32")],
    ),
    item(
        Cat::Shoes,
        "very-good",
        40.0,
        Some("sneaker_brown"),
        t("Sneaker braun Gr. 43", "Brown trainers size 9"),
        t("Zweimal getragen, wie neu.", "Worn twice, like new."),
        &[("size", "43", "9")],
    ),
    item(
        Cat::Shoes,
        "good",
        25.0,
        Some("sneakers"),
        t("Laufschuhe Gr. 39", "Running shoes size 6"),
        t(
            "Für Straße und Halle, Sohle gut.",
            "Road and indoor, good soles.",
        ),
        &[("size", "39", "6")],
    ),
    item(
        Cat::Accessories,
        "very-good",
        10.0,
        Some("tote"),
        t("Stoffbeutel Canvas (3 Stück)", "Canvas tote bags (3)"),
        t("Robust, mit Innentasche.", "Sturdy, with an inner pocket."),
        &[],
    ),
    item(
        Cat::Accessories,
        "good",
        18.0,
        None,
        t("Ledergürtel und Schal", "Leather belt and scarf"),
        t("Gürtel 95 cm, Schal aus Wolle.", "Belt 95 cm, wool scarf."),
        &[],
    ),
    haggle(
        item(
            Cat::Bikes,
            "good",
            240.0,
            Some("bike_city"),
            t("Singlespeed-Rad 28 Zoll", "Single-speed bike 28 inch"),
            t(
                "Leicht, Flip-Flop-Nabe, neue Reifen.",
                "Light, flip-flop hub, new tyres.",
            ),
            &[
                ("frameSize", "56 cm", "56 cm"),
                ("wheelSize", "28 Zoll", "28 inch"),
                ("brand", "Fixie Inc.", "Fixie Inc."),
            ],
        ),
        200.0,
    ),
    item(
        Cat::Bikes,
        "very-good",
        650.0,
        Some("bike_road"),
        t("Rennrad Carbon 105", "Carbon road bike 105"),
        t(
            "Shimano 105, 2.000 km gefahren.",
            "Shimano 105, ridden 2,000 km.",
        ),
        &[
            ("frameNumber", "WTU 2231 88", "WTU 2231 88"),
            ("frameSize", "54 cm", "54 cm"),
            ("brand", "Rose", "Rose"),
        ],
    ),
    item(
        Cat::Bikes,
        "good",
        480.0,
        Some("bike_gravel"),
        t("Gravelbike Alu, Größe M", "Aluminium gravel bike, size M"),
        t(
            "Hydraulische Scheibenbremsen, 2 × 11 Gänge.",
            "Hydraulic disc brakes, 2 × 11 speed.",
        ),
        &[
            ("frameNumber", "GR 7781 12", "GR 7781 12"),
            ("frameSize", "M", "M"),
            ("brand", "Canyon", "Canyon"),
        ],
    ),
    item(
        Cat::Sports,
        "good",
        20.0,
        None,
        t("Yogamatte und Blöcke", "Yoga mat and blocks"),
        t("Matte 6 mm, zwei Korkblöcke.", "6 mm mat, two cork blocks."),
        &[],
    ),
    item(
        Cat::Other,
        "good",
        10.0,
        None,
        t("Gesellschaftsspiele (3 Stück)", "Three board games"),
        t("Vollständig, Anleitungen dabei.", "Complete with rules."),
        &[],
    ),
];

/// Second-hand books for the book market.
pub const BOOKS: &[Item] = &[
    item(
        Cat::Books,
        "good",
        4.0,
        Some("books"),
        t(
            "Sachbuch-Paket Gründen (6 Bände)",
            "Start-up book bundle (6 books)",
        ),
        t(
            "Mit Anstreichungen in zwei Bänden.",
            "Two books have highlights.",
        ),
        &[],
    ),
    item(
        Cat::Books,
        "very-good",
        6.0,
        None,
        t(
            "Kochbuch „Saisonal vegetarisch“",
            "Cookbook “Seasonal vegetarian”",
        ),
        t("Gebunden, wie neu.", "Hardback, like new."),
        &[],
    ),
    item(
        Cat::Books,
        "good",
        3.0,
        None,
        t(
            "Krimi-Reihe Taschenbuch (4 Bände)",
            "Crime series paperbacks (4)",
        ),
        t(
            "Gelesen, Rücken leicht geknickt.",
            "Read, spines slightly creased.",
        ),
        &[],
    ),
    item(
        Cat::Books,
        "ok",
        2.0,
        None,
        t("Reiseführer Italien", "Travel guide Italy"),
        t(
            "Ausgabe 2019, Karten vollständig.",
            "2019 edition, maps complete.",
        ),
        &[],
    ),
    item(
        Cat::Books,
        "very-good",
        12.0,
        None,
        t("Bildband Alpen", "Photo book of the Alps"),
        t(
            "Großformat, mit Schutzumschlag.",
            "Large format with dust jacket.",
        ),
        &[],
    ),
    item(
        Cat::Books,
        "good",
        5.0,
        None,
        t("Jugendbuch-Trilogie", "Young adult trilogy"),
        t(
            "Taschenbuch, alle drei Teile.",
            "Paperback, all three parts.",
        ),
        &[],
    ),
    item(
        Cat::Books,
        "good",
        8.0,
        None,
        t("Gartenratgeber Gemüse", "Vegetable gardening guide"),
        t(
            "Viele Pflanzpläne, gebunden.",
            "Lots of planting plans, hardback.",
        ),
        &[],
    ),
    item(
        Cat::Books,
        "very-good",
        15.0,
        None,
        t(
            "Klassiker-Edition (10 Bände)",
            "Classics edition (10 volumes)",
        ),
        t("Leinen, in Schmuckkassette.", "Cloth bound, in a slipcase."),
        &[],
    ),
];
