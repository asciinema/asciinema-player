use std::ops::RangeInclusive;

use serde::{
    ser::{SerializeMap, Serializer},
    Serialize,
};
use wasm_bindgen::prelude::*;

// Use `wee_alloc` as the global allocator for smaller binary size
#[cfg(feature = "wee_alloc")]
#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

static STANDALONE_CHARS_LUT: [bool; 65536] = build_standalone_chars_lut();
const NF_MATERIAL_DESIGN_ICONS: RangeInclusive<char> = '\u{f0001}'..='\u{f1af0}';

const fn build_standalone_chars_lut() -> [bool; 65536] {
    let mut lut = [false; 65536];

    // box drawing
    fill_lut(&mut lut, 0x2500..=0x257f);

    // block elements
    fill_lut(&mut lut, 0x2580..=0x259f);

    // braille patterns
    fill_lut(&mut lut, 0x2800..=0x28ff);

    // NF Seti-UI
    fill_lut(&mut lut, 0xe5fa..=0xe6b7);

    // NF Devicons
    fill_lut(&mut lut, 0xe700..=0xe8ef);

    // NF Font Awesome
    fill_lut(&mut lut, 0xed00..=0xf2ff);

    // NF Font Awesome Extension
    fill_lut(&mut lut, 0xe200..=0xe2a9);

    // NF Weather
    fill_lut(&mut lut, 0xe300..=0xe3e3);

    // NF Octicons
    fill_lut(&mut lut, 0xf400..=0xf533);
    fill_lut(&mut lut, 0x2665..=0x2665);
    fill_lut(&mut lut, 0x26a1..=0x26a1);

    // NF Powerline Symbols
    fill_lut(&mut lut, 0xe0a0..=0xe0a2);
    fill_lut(&mut lut, 0xe0b0..=0xe0b3);

    // NF Powerline Extra Symbols
    fill_lut(&mut lut, 0xe0a3..=0xe0a3);
    fill_lut(&mut lut, 0xe0b4..=0xe0c8);
    fill_lut(&mut lut, 0xe0ca..=0xe0ca);
    fill_lut(&mut lut, 0xe0cc..=0xe0d7);
    fill_lut(&mut lut, 0x2630..=0x2630);

    // NF IEC Power Symbols
    fill_lut(&mut lut, 0x23fb..=0x23fe);
    fill_lut(&mut lut, 0x2b58..=0x2b58);

    // NF Font Logos
    fill_lut(&mut lut, 0xf300..=0xf381);

    // NF Pomicons
    fill_lut(&mut lut, 0xe000..=0xe00a);

    // NF Codicons
    fill_lut(&mut lut, 0xea60..=0xec1e);

    lut
}

const fn fill_lut(t: &mut [bool; 65536], range: RangeInclusive<u32>) {
    let mut cp = *range.start();

    while cp <= *range.end() {
        t[cp as usize] = true;
        cp += 1;
    }
}

#[wasm_bindgen]
pub struct Vt {
    vt: avt::Vt,
}

#[wasm_bindgen]
pub fn create(cols: usize, rows: usize, scrollback_limit: usize) -> Vt {
    let vt = avt::Vt::builder()
        .size(cols, rows)
        .scrollback_limit(scrollback_limit)
        .build();

    Vt { vt }
}

#[wasm_bindgen]
impl Vt {
    pub fn feed(&mut self, s: &str) -> JsValue {
        let changes = self.vt.feed_str(s);
        serde_wasm_bindgen::to_value(&changes.lines).unwrap()
    }

    pub fn resize(&mut self, cols: usize, rows: usize) -> JsValue {
        let changes = self.vt.resize(cols, rows);
        serde_wasm_bindgen::to_value(&changes.lines).unwrap()
    }

    #[wasm_bindgen(js_name = getSize)]
    pub fn get_size(&self) -> Vec<usize> {
        let (cols, rows) = self.vt.size();

        vec![cols, rows]
    }

    #[wasm_bindgen(js_name = getLine)]
    pub fn get_line(&self, n: usize) -> JsValue {
        let chunks = self.vt.line(n).chunks(|c1: &avt::Cell, c2: &avt::Cell| {
            c1.pen() != c2.pen() || is_standalone_char(c1) || is_standalone_char(c2)
        });

        let mut offset = 0;
        let mut segments: Vec<Segment> = Vec::new();

        for cells in chunks {
            let text: String = cells.iter().map(avt::Cell::char).collect();
            let cell_count: usize = cells.iter().map(avt::Cell::width).sum();

            segments.push(Segment {
                text,
                pen: Pen(*cells[0].pen()),
                offset,
                cell_count,
                char_width: cells[0].width(),
            });

            offset += cell_count;
        }

        serde_wasm_bindgen::to_value(&segments).unwrap()
    }

    #[wasm_bindgen(js_name = getCursor)]
    pub fn get_cursor(&self) -> JsValue {
        let cursor: Option<(usize, usize)> = self.vt.cursor().into();

        serde_wasm_bindgen::to_value(&cursor).unwrap()
    }
}

fn is_standalone_char(cell: &avt::Cell) -> bool {
    let ch = cell.char();

    if ch.is_ascii() {
        return false;
    }

    // all wide chars should be standalone
    if cell.width() > 1 {
        return true;
    }

    // symbols with codepoints < 65536 - use lookup table
    if (ch as u32) & 0xffff0000 == 0 {
        return STANDALONE_CHARS_LUT[ch as usize];
    }

    NF_MATERIAL_DESIGN_ICONS.contains(&ch)
}

#[derive(Debug, Serialize)]
struct Segment {
    text: String,
    pen: Pen,
    offset: usize,
    #[serde(rename = "cellCount")]
    cell_count: usize,
    #[serde(rename = "charWidth")]
    char_width: usize,
}

#[derive(Debug)]
struct Pen(avt::Pen);

impl Serialize for Pen {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut len = 0;

        if self.0.foreground().is_some() {
            len += 1;
        }

        if self.0.background().is_some() {
            len += 1;
        }

        if self.0.is_bold() || self.0.is_faint() {
            len += 1;
        }

        if self.0.is_italic() {
            len += 1;
        }

        if self.0.is_underline() {
            len += 1;
        }

        if self.0.is_strikethrough() {
            len += 1;
        }

        if self.0.is_blink() {
            len += 1;
        }

        if self.0.is_inverse() {
            len += 1;
        }

        let mut map = serializer.serialize_map(Some(len))?;

        if let Some(c) = self.0.foreground() {
            map.serialize_entry("fg", &Color(c))?;
        }

        if let Some(c) = self.0.background() {
            map.serialize_entry("bg", &Color(c))?;
        }

        if self.0.is_bold() {
            map.serialize_entry("bold", &true)?;
        } else if self.0.is_faint() {
            map.serialize_entry("faint", &true)?;
        }

        if self.0.is_italic() {
            map.serialize_entry("italic", &true)?;
        }

        if self.0.is_underline() {
            map.serialize_entry("underline", &true)?;
        }

        if self.0.is_strikethrough() {
            map.serialize_entry("strikethrough", &true)?;
        }

        if self.0.is_blink() {
            map.serialize_entry("blink", &true)?;
        }

        if self.0.is_inverse() {
            map.serialize_entry("inverse", &true)?;
        }

        map.end()
    }
}

struct Color(avt::Color);

impl Serialize for Color {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        use avt::Color;

        match self.0 {
            Color::Indexed(c) => serializer.serialize_u8(c),

            Color::RGB(c) => {
                serializer.serialize_str(&format!("#{:02x}{:02x}{:02x}", c.r, c.g, c.b))
            }
        }
    }
}
