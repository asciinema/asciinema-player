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

#[wasm_bindgen]
pub struct Vt {
    vt: avt::Vt,
}

#[derive(Serialize)]
struct Line {
    bg: Vec<BgSpan>,
    fg: Vec<FgSpan>,
}

struct BgSpan {
    x: usize,
    width: usize,
    bg: Color,
}

struct FgSpan {
    x: usize,
    width: usize,
    text: Vec<char>,
    bg: Option<Color>,
    fg: Option<Color>,
    bold: bool,
    faint: bool,
    italic: bool,
    underline: bool,
    strikethrough: bool,
    blink: bool,
}

#[derive(Clone, PartialEq)]
enum Color {
    Value(avt::Color),
    DefaultBg,
    DefaultFg,
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
    pub fn get_line(&self, row: usize, cursor_on: bool) -> JsValue {
        let mut bg: Vec<BgSpan> = Vec::new();
        let mut fg: Vec<FgSpan> = Vec::new();
        let mut prev_bg_span: Option<BgSpan> = None;
        let mut prev_fg_span: Option<FgSpan> = None;
        let mut x = 0;

        let cursor_col = {
            let cursor = self.vt.cursor();

            if cursor.visible && cursor.row == row && cursor_on {
                Some(cursor.col)
            } else {
                None
            }
        };

        for cell in self.vt.line(row).cells().iter().filter(|c| c.width() > 0) {
            let width = cell.width();
            let pen = cell.pen();
            let inverse = matches!(cursor_col, Some(col) if col == x);
            let bg_color = bg_color(pen, inverse);
            let fg_color = fg_color(pen, inverse);

            // bg spans

            match (prev_bg_span.take(), bg_color.as_ref()) {
                (None, None) => {}

                (None, Some(color)) => {
                    prev_bg_span = Some(BgSpan {
                        x,
                        width,
                        bg: color.clone(),
                    });
                }

                (Some(span), None) => {
                    bg.push(span);
                    prev_bg_span = None;
                }

                (Some(mut span), Some(c)) if &span.bg == c => {
                    span.width += width;
                    prev_bg_span = Some(span);
                }

                (Some(span), Some(color)) => {
                    bg.push(span);
                    prev_bg_span = Some(BgSpan {
                        x,
                        width,
                        bg: color.clone(),
                    });
                }
            }

            // fg spans

            if is_standalone_char(cell) {
                if let Some(span) = prev_fg_span.take() {
                    fg.push(span);
                }

                fg.push(build_fg_span(x, width, bg_color, fg_color, cell));
            } else {
                match (prev_fg_span.take(), pen) {
                    (None, _pen) => {
                        prev_fg_span = Some(build_fg_span(x, width, bg_color, fg_color, cell));
                    }

                    (Some(mut span), pen)
                        if (fg_color == span.fg && is_same_text_style(&span, pen))
                            || (cell.char() == ' ' && !span.underline) =>
                    {
                        span.text.push(cell.char());
                        span.width += width;
                        prev_fg_span = Some(span);
                    }

                    (Some(span), _pen) => {
                        fg.push(span);
                        prev_fg_span = Some(build_fg_span(x, width, bg_color, fg_color, cell));
                    }
                }
            }

            x += width;
        }

        if let Some(span) = prev_bg_span {
            bg.push(span);
        }

        if let Some(span) = prev_fg_span {
            fg.push(span);
        }

        let line = Line { bg, fg };

        serde_wasm_bindgen::to_value(&line).unwrap()
    }

    #[wasm_bindgen(js_name = getCursor)]
    pub fn get_cursor(&self) -> JsValue {
        let cursor: Option<(usize, usize)> = self.vt.cursor().into();

        serde_wasm_bindgen::to_value(&cursor).unwrap()
    }
}

fn build_fg_span(
    x: usize,
    width: usize,
    bg: Option<Color>,
    fg: Option<Color>,
    cell: &avt::Cell,
) -> FgSpan {
    let pen = cell.pen();

    FgSpan {
        x,
        width,
        bg,
        fg,
        bold: pen.is_bold(),
        faint: pen.is_faint(),
        italic: pen.is_italic(),
        underline: pen.is_underline(),
        strikethrough: pen.is_strikethrough(),
        blink: pen.is_blink(),
        text: vec![cell.char()],
    }
}

fn is_same_text_style(span: &FgSpan, pen: &avt::Pen) -> bool {
    span.bold == pen.is_bold()
        && span.faint == pen.is_faint()
        && span.italic == pen.is_italic()
        && span.underline == pen.is_underline()
        && span.strikethrough == pen.is_strikethrough()
        && span.blink == pen.is_blink()
}

fn bg_color(pen: &avt::Pen, inverse: bool) -> Option<Color> {
    if pen.is_inverse() ^ inverse {
        if let Some(c) = pen.foreground() {
            Some(Color::Value(c))
        } else {
            Some(Color::DefaultFg)
        }
    } else {
        pen.background().map(Color::Value)
    }
}

fn fg_color(pen: &avt::Pen, inverse: bool) -> Option<Color> {
    if pen.is_inverse() ^ inverse {
        if let Some(c) = pen.background() {
            Some(Color::Value(c))
        } else {
            Some(Color::DefaultBg)
        }
    } else {
        pen.foreground().map(Color::Value)
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

impl Serialize for BgSpan {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut map = serializer.serialize_map(Some(3))?;
        map.serialize_entry("x", &self.x)?;
        map.serialize_entry("width", &self.width)?;
        map.serialize_entry("bg", &self.bg)?;

        map.end()
    }
}

impl Serialize for FgSpan {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut len = 3;
        let mut class = String::new();
        let mut css_symbol = false;

        if self.fg.is_some() {
            len += 1;
        }

        if self.bg.is_some() {
            len += 1;
        }

        if self.bold {
            class.push_str("ap-bold ");
        } else if self.faint {
            class.push_str("ap-faint ");
        }

        if self.italic {
            class.push_str("ap-italic ");
        }

        if self.underline {
            class.push_str("ap-underline ");
        }

        if self.strikethrough {
            class.push_str("ap-strike ");
        }

        if self.blink {
            class.push_str("ap-blink ");
        }

        if self.text.len() == 1 {
            let ch = self.text[0];

            // box drawing chars, block elements and some Powerline symbols
            // are rendered with CSS classes (cp-<codepoint>)
            if ('\u{2580}'..='\u{259f}').contains(&ch) || ('\u{e0b0}'..='\u{e0b3}').contains(&ch) {
                css_symbol = true;
                class.push_str(&format!("cp-{:04x} ", ch as u32));
            }
        }

        if !class.is_empty() {
            len += 1;
        }

        let mut map = serializer.serialize_map(Some(len))?;

        map.serialize_entry("x", &self.x)?;
        map.serialize_entry("width", &self.width)?;
        let text: String = self.text.iter().collect();

        if css_symbol {
            map.serialize_entry("text", " ")?;
        } else {
            map.serialize_entry("text", &text)?;
        }

        if let Some(color) = &self.fg {
            map.serialize_entry("fg", color)?;
        }

        if css_symbol {
            // some symbols rendered with CSS classes (see above) need bg color
            if let Some(color) = &self.bg {
                map.serialize_entry("bg", color)?;
            }
        }

        if !class.is_empty() {
            map.serialize_entry("class", &class)?;
        }

        map.end()
    }
}

impl Serialize for Color {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        use Color::*;

        match self {
            Value(avt::Color::Indexed(c)) => serializer.serialize_u8(*c),

            Value(avt::Color::RGB(c)) => {
                serializer.serialize_str(&format!("#{:02x}{:02x}{:02x}", c.r, c.g, c.b))
            }

            DefaultBg => serializer.serialize_str("bg"),

            DefaultFg => serializer.serialize_str("fg"),
        }
    }
}

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
