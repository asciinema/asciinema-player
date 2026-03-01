use std::mem::{align_of, size_of};
use std::ops::RangeInclusive;

use serde::{ser::Serializer, Serialize};
use wasm_bindgen::prelude::*;

// Use `wee_alloc` as the global allocator for smaller binary size
#[cfg(feature = "wee_alloc")]
#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

const STANDALONE_CHARS_LUT_BITS: usize = 65536;
const STANDALONE_CHARS_LUT_SIZE: usize = STANDALONE_CHARS_LUT_BITS / 8;
static STANDALONE_CHARS_LUT: [u8; STANDALONE_CHARS_LUT_SIZE] = build_standalone_chars_lut();
const NF_MATERIAL_DESIGN_ICONS: RangeInclusive<char> = '\u{f0001}'..='\u{f1af0}';

const BOLD_MASK: u8 = 1;
const FAINT_MASK: u8 = 1 << 1;
const ITALIC_MASK: u8 = 1 << 2;
const UNDERLINE_MASK: u8 = 1 << 3;
const STRIKETHROUGH_MASK: u8 = 1 << 4;
const BLINK_MASK: u8 = 1 << 5;
const INVERSE_MASK: u8 = 1 << 6;

#[wasm_bindgen]
pub struct Vt {
    vt: avt::Vt,
    bold_is_bright: bool,
    bg_spans: Vec<BgSpan>,
    text_spans: Vec<TextSpan>,
    raster_symbols: Vec<RasterSymbol>,
    vector_symbols: Vec<VectorSymbol>,
    codepoints: Vec<u32>,
}

#[derive(Serialize)]
struct Line {
    bg: (usize, u16),
    text: (usize, u16),
    codepoints: (usize, u16),
    raster_symbols: (usize, u16),
    vector_symbols: (usize, u16),
}

#[derive(Clone, Default)]
#[repr(C)]
struct BgSpan {
    column: u16,
    width: u16,
    color: Color,
}

#[repr(C)]
struct TextSpan {
    column: u16,
    text_start: u16,
    text_len: u16,
    color: Color,
    attrs: TextAttrs,
}

#[repr(C)]
struct RasterSymbol {
    column: u16,
    codepoint: u32,
    color: Color,
}

#[repr(C)]
struct VectorSymbol {
    column: u16,
    codepoint: u32,
    color: Color,
    attrs: TextAttrs,
}

#[derive(Clone, PartialEq, Default)]
#[repr(C, u8)]
enum Color {
    #[default]
    None = 0,
    DefaultFg = 1,
    DefaultBg = 2,
    Indexed(u8) = 3,
    Rgb(u8, u8, u8) = 4,
}

#[derive(PartialEq)]
#[repr(transparent)]
struct TextAttrs(u8);

#[wasm_bindgen]
pub fn create(cols: usize, rows: usize, scrollback_limit: usize, bold_is_bright: bool) -> Vt {
    let vt = avt::Vt::builder()
        .size(cols, rows)
        .scrollback_limit(scrollback_limit)
        .build();

    Vt {
        vt,
        bold_is_bright,
        bg_spans: Vec::with_capacity(cols),
        text_spans: Vec::with_capacity(cols),
        raster_symbols: Vec::with_capacity(cols),
        vector_symbols: Vec::with_capacity(cols),
        codepoints: Vec::with_capacity(cols),
    }
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
    pub fn get_line(&mut self, row: usize, cursor_on: bool) -> JsValue {
        let mut prev_bg_span: Option<BgSpan> = None;
        let mut prev_text_span: Option<TextSpan> = None;
        let mut column = 0u16;

        self.bg_spans.clear();
        self.text_spans.clear();
        self.raster_symbols.clear();
        self.vector_symbols.clear();
        self.codepoints.clear();

        let cursor_column = {
            let cursor = self.vt.cursor();

            if cursor.visible && cursor.row == row && cursor_on {
                Some(cursor.col as u16)
            } else {
                None
            }
        };

        let cells = self.vt.line(row).cells().iter().filter(|c| c.width() > 0);

        for (idx, cell) in cells.enumerate() {
            let mut ch = cell.char();
            let width = cell.width() as u16;
            let pen = cell.pen();
            let inverse = matches!(cursor_column, Some(col) if col == column);
            let bg_color = self.bg_color(pen, inverse);
            let fg_color = self.fg_color(pen, inverse);

            // bg spans

            match (prev_bg_span.take(), bg_color.as_ref()) {
                (None, None) => {}

                (None, Some(color)) => {
                    prev_bg_span = Some(BgSpan {
                        column,
                        width,
                        color: color.clone(),
                    });
                }

                (Some(span), None) => {
                    self.bg_spans.push(span);
                    prev_bg_span = None;
                }

                (Some(mut span), Some(c)) if &span.color == c => {
                    span.width += width;
                    prev_bg_span = Some(span);
                }

                (Some(span), Some(color)) => {
                    self.bg_spans.push(span);

                    prev_bg_span = Some(BgSpan {
                        column,
                        width,
                        color: color.clone(),
                    });
                }
            }

            // text spans and symbols

            if is_raster_symbol(ch) {
                self.raster_symbols.push(RasterSymbol {
                    column,
                    codepoint: ch as u32,
                    color: fg_color.clone(),
                });

                ch = ' ';
            } else if is_vector_symbol(ch) {
                self.vector_symbols.push(VectorSymbol {
                    column,
                    codepoint: ch as u32,
                    color: fg_color.clone(),
                    attrs: pen.into(),
                });

                ch = ' ';
            }

            if is_standalone_char(ch, width) {
                if let Some(span) = prev_text_span.take() {
                    self.text_spans.push(span);
                }

                self.text_spans
                    .push(build_text_span(column, idx, fg_color, cell));
            } else {
                match (prev_text_span.take(), pen) {
                    (None, _pen) => {
                        prev_text_span = Some(build_text_span(column, idx, fg_color, cell));
                    }

                    (Some(mut span), pen)
                        if (fg_color == span.color && is_same_text_style(&span, pen))
                            || (ch == ' '
                                && span.is_underline() == pen.is_underline()
                                && span.is_strikethrough() == pen.is_strikethrough()) =>
                    // spaces with the same underline/strike-through values can be safely merged
                    // into the previous span regardles of their other attr values (color, bold,
                    // italic etc), reducing the overall number of text spans representing a row
                    {
                        span.text_len += 1;
                        prev_text_span = Some(span);
                    }

                    (Some(span), _pen) => {
                        self.text_spans.push(span);
                        prev_text_span = Some(build_text_span(column, idx, fg_color, cell));
                    }
                }
            }

            self.codepoints.push(ch as u32);
            column += width;
        }

        if let Some(span) = prev_bg_span {
            self.bg_spans.push(span);
        }

        if let Some(span) = prev_text_span {
            self.text_spans.push(span);
        }

        let line = Line {
            bg: (self.bg_spans.as_ptr() as usize, self.bg_spans.len() as u16),
            text: (
                self.text_spans.as_ptr() as usize,
                self.text_spans.len() as u16,
            ),
            raster_symbols: (
                self.raster_symbols.as_ptr() as usize,
                self.raster_symbols.len() as u16,
            ),
            vector_symbols: (
                self.vector_symbols.as_ptr() as usize,
                self.vector_symbols.len() as u16,
            ),
            codepoints: (
                self.codepoints.as_ptr() as usize,
                self.codepoints.len() as u16,
            ),
        };

        serde_wasm_bindgen::to_value(&line).unwrap()
    }

    #[wasm_bindgen(js_name = getCursor)]
    pub fn get_cursor(&self) -> JsValue {
        let cursor: Option<(usize, usize)> = self.vt.cursor().into();

        serde_wasm_bindgen::to_value(&cursor).unwrap()
    }

    fn bg_color(&self, pen: &avt::Pen, inverse: bool) -> Option<Color> {
        if pen.is_inverse() ^ inverse {
            match pen.foreground() {
                Some(avt::Color::Indexed(n)) => Some(Color::Indexed(n)),
                Some(avt::Color::RGB(c)) => Some(Color::Rgb(c.r, c.g, c.b)),
                None => Some(Color::DefaultFg),
            }
        } else {
            pen.background().map(|c| match c {
                avt::Color::Indexed(n) => Color::Indexed(n),
                avt::Color::RGB(c) => Color::Rgb(c.r, c.g, c.b),
            })
        }
    }

    fn fg_color(&self, pen: &avt::Pen, inverse: bool) -> Color {
        if pen.is_inverse() ^ inverse {
            match pen.background() {
                Some(avt::Color::Indexed(n)) if n < 8 && self.bold_is_bright && pen.is_bold() => {
                    Color::Indexed(n + 8)
                }
                Some(avt::Color::Indexed(n)) => Color::Indexed(n),
                Some(avt::Color::RGB(c)) => Color::Rgb(c.r, c.g, c.b),
                None => Color::DefaultBg,
            }
        } else {
            match pen.foreground() {
                Some(avt::Color::Indexed(n)) if n < 8 && self.bold_is_bright && pen.is_bold() => {
                    Color::Indexed(n + 8)
                }
                Some(avt::Color::Indexed(n)) => Color::Indexed(n),
                Some(avt::Color::RGB(c)) => Color::Rgb(c.r, c.g, c.b),
                None => Color::None,
            }
        }
    }
}

fn build_text_span(
    column: u16,
    codepoints_start: usize,
    color: Color,
    cell: &avt::Cell,
) -> TextSpan {
    TextSpan {
        column,
        text_start: codepoints_start as u16,
        text_len: 1,
        color,
        attrs: cell.pen().into(),
    }
}

fn is_same_text_style(span: &TextSpan, pen: &avt::Pen) -> bool {
    let pen_attrs: TextAttrs = pen.into();

    (span.attrs.0 & !INVERSE_MASK) == (pen_attrs.0 & !INVERSE_MASK)
}

fn is_standalone_char(ch: char, width: u16) -> bool {
    if ch.is_ascii() {
        return false;
    }

    // all wide chars should be standalone
    if width > 1 {
        return true;
    }

    // symbols with codepoints < 65536 - use lookup table
    if (ch as u32) & 0xffff0000 == 0 {
        return standalone_chars_lut_contains(ch as u16);
    }

    NF_MATERIAL_DESIGN_ICONS.contains(&ch)
}

#[inline]
fn standalone_chars_lut_contains(cp: u16) -> bool {
    let (byte_idx, mask) = standalone_chars_lut_byte_and_mask(cp as u32);
    let byte = STANDALONE_CHARS_LUT[byte_idx];

    byte & mask != 0
}

#[inline(always)]
const fn standalone_chars_lut_byte_and_mask(cp: u32) -> (usize, u8) {
    let idx = cp as usize;
    let byte_idx = idx >> 3;
    let bit_mask = 1u8 << (idx & 7);

    (byte_idx, bit_mask)
}

fn is_vector_symbol(ch: char) -> bool {
    // Geometric Shapes: black triangles
    ('\u{25e2}'..='\u{25e5}').contains(&ch)
    // digram for greater yin (⚏)
    || ch == '\u{268f}'
    // Powerline triangles
    || ('\u{e0b0}'..='\u{e0b3}').contains(&ch)
    // Symbols for Legacy Computing: block diagonals + triangular blocks
    || ('\u{1fb3c}'..='\u{1fb69}').contains(&ch)
    || ('\u{1fb6a}'..='\u{1fb6c}').contains(&ch)
}

fn is_raster_symbol(ch: char) -> bool {
    // box drawing + block elements
    ('\u{2580}'..='\u{259f}').contains(&ch)
        // box drawing light/heavy vertical
        || ch == '\u{2502}'
        || ch == '\u{2503}'
        // box drawing light/heavy vertical half lines
        || ch == '\u{2575}'
        || ch == '\u{2577}'
        || ch == '\u{2579}'
        || ch == '\u{257b}'
        // black square
        || ch == '\u{25a0}'
        // block sextants (1FB00-1FB3B)
        || ('\u{1fb00}'..='\u{1fb3b}').contains(&ch)
}

impl TextSpan {
    fn is_underline(&self) -> bool {
        self.attrs.0 & UNDERLINE_MASK != 0
    }

    fn is_strikethrough(&self) -> bool {
        self.attrs.0 & STRIKETHROUGH_MASK != 0
    }
}

impl From<&avt::Pen> for TextAttrs {
    fn from(pen: &avt::Pen) -> Self {
        let mut attrs = 0u8;

        if pen.is_bold() {
            attrs |= BOLD_MASK;
        }

        if pen.is_faint() {
            attrs |= FAINT_MASK;
        }

        if pen.is_italic() {
            attrs |= ITALIC_MASK;
        }

        if pen.is_underline() {
            attrs |= UNDERLINE_MASK;
        }

        if pen.is_strikethrough() {
            attrs |= STRIKETHROUGH_MASK;
        }

        if pen.is_blink() {
            attrs |= BLINK_MASK;
        }

        if pen.is_inverse() {
            attrs |= INVERSE_MASK;
        }

        TextAttrs(attrs)
    }
}

impl Serialize for Color {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        use Color::*;

        match self {
            None => serializer.serialize_none(),
            DefaultFg => serializer.serialize_str("fg"),
            DefaultBg => serializer.serialize_str("bg"),
            Indexed(n) => serializer.serialize_u8(*n),
            Rgb(r, g, b) => serializer.serialize_str(&format!("#{:02x}{:02x}{:02x}", r, g, b)),
        }
    }
}

const fn build_standalone_chars_lut() -> [u8; STANDALONE_CHARS_LUT_SIZE] {
    let mut lut = [0; STANDALONE_CHARS_LUT_SIZE];

    // box drawing
    fill_lut(&mut lut, 0x2500..=0x257f);

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

    // Black Large Circle
    fill_lut(&mut lut, 0x2b24..=0x2b24);

    lut
}

const fn fill_lut(t: &mut [u8; STANDALONE_CHARS_LUT_SIZE], range: RangeInclusive<u32>) {
    let mut cp = *range.start();

    while cp <= *range.end() {
        let (byte_idx, bit_mask) = standalone_chars_lut_byte_and_mask(cp);
        t[byte_idx] |= bit_mask;
        cp += 1;
    }
}

// Compile-time assertions for the layout of structs and enums
// It's crucial that Terminal.js follows these values!
const _: () = {
    assert!(size_of::<BgSpan>() == 8);
    assert!(align_of::<BgSpan>() == 2);

    assert!(size_of::<TextSpan>() == 12);
    assert!(align_of::<TextSpan>() == 2);

    assert!(size_of::<RasterSymbol>() == 12);
    assert!(align_of::<RasterSymbol>() == 4);

    assert!(size_of::<VectorSymbol>() == 16);
    assert!(align_of::<VectorSymbol>() == 4);

    assert!(size_of::<Color>() == 4);
    assert!(align_of::<Color>() == 1);

    assert!(size_of::<TextAttrs>() == 1);
    assert!(align_of::<TextAttrs>() == 1);
};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn standalone_chars_lut_lookup_has_expected_values() {
        assert!(standalone_chars_lut_contains(0x2500));
        assert!(standalone_chars_lut_contains(0x257f));
        assert!(standalone_chars_lut_contains(0x2800));
        assert!(standalone_chars_lut_contains(0x28ff));
        assert!(standalone_chars_lut_contains(0xe0b0));
        assert!(standalone_chars_lut_contains(0xf533));
        assert!(!standalone_chars_lut_contains(0x24ff));
        assert!(!standalone_chars_lut_contains(0x2600));
        assert!(!standalone_chars_lut_contains(0xffff));
    }

    #[test]
    fn is_standalone_char_behavior_is_preserved_for_non_lut_paths() {
        assert!(!is_standalone_char('A', 1));
        assert!(is_standalone_char('中', 2));
        assert!(is_standalone_char('\u{f0001}', 1));
        assert!(!is_standalone_char('\u{1f600}', 1));
    }
}
