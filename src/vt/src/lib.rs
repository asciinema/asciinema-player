mod utils;
use serde::{
    ser::{SerializeMap, Serializer},
    Serialize,
};
use std::ops::RangeInclusive;
use wasm_bindgen::prelude::*;

const BOX_DRAWING_RANGE: RangeInclusive<char> = '\u{2500}'..='\u{257f}';
const BLOCK_ELEMENTS_RANGE: RangeInclusive<char> = '\u{2580}'..='\u{259f}';
const BRAILLE_PATTERNS_RANGE: RangeInclusive<char> = '\u{2800}'..='\u{28ff}';
const POWERLINE_TRIANGLES_RANGE: RangeInclusive<char> = '\u{e0b0}'..='\u{e0b3}';

#[wasm_bindgen]
pub struct Vt {
    vt: avt::Vt,
}

#[wasm_bindgen]
pub fn create(cols: usize, rows: usize, scrollback_limit: usize) -> Vt {
    utils::set_panic_hook();

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
            c1.pen() != c2.pen() || is_special_char(c1) || is_special_char(c2)
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

fn is_special_char(cell: &avt::Cell) -> bool {
    let ch = &cell.char();

    cell.width() > 1
        || BOX_DRAWING_RANGE.contains(ch)
        || BRAILLE_PATTERNS_RANGE.contains(ch)
        || BLOCK_ELEMENTS_RANGE.contains(ch)
        || POWERLINE_TRIANGLES_RANGE.contains(ch)
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
