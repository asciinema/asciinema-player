mod utils;
use avt::Vt;
use std::ops::RangeInclusive;
use wasm_bindgen::prelude::*;

const BOX_DRAWING_RANGE: RangeInclusive<char> = '\u{2500}'..='\u{257f}';
const BLOCK_ELEMENTS_RANGE: RangeInclusive<char> = '\u{2580}'..='\u{259f}';
const BRAILLE_PATTERNS_RANGE: RangeInclusive<char> = '\u{2800}'..='\u{28ff}';
const POWERLINE_TRIANGLES_RANGE: RangeInclusive<char> = '\u{e0b0}'..='\u{e0b3}';

#[wasm_bindgen]
pub struct VtWrapper {
    vt: Vt,
}

#[wasm_bindgen]
pub fn create(cols: usize, rows: usize, resizable: bool, scrollback_limit: usize) -> VtWrapper {
    utils::set_panic_hook();

    let vt = Vt::builder()
        .size(cols, rows)
        .resizable(resizable)
        .scrollback_limit(scrollback_limit)
        .build();

    VtWrapper { vt }
}

#[wasm_bindgen]
impl VtWrapper {
    pub fn feed(&mut self, s: &str) -> JsValue {
        let changes = self.vt.feed_str(s);
        let changes = (changes.lines, changes.resized);
        serde_wasm_bindgen::to_value(&changes).unwrap()
    }

    pub fn inspect(&self) -> String {
        format!("{:?}", self.vt)
    }

    pub fn get_size(&self) -> Vec<usize> {
        let (cols, rows) = self.vt.size();

        vec![cols, rows]
    }

    pub fn get_line(&self, l: usize) -> JsValue {
        let line: Vec<_> = self
            .vt
            .line(l)
            .group(|c, w| {
                w > 1
                    || BOX_DRAWING_RANGE.contains(c)
                    || BRAILLE_PATTERNS_RANGE.contains(c)
                    || BLOCK_ELEMENTS_RANGE.contains(c)
                    || POWERLINE_TRIANGLES_RANGE.contains(c)
            })
            .collect();

        serde_wasm_bindgen::to_value(&line).unwrap()
    }

    pub fn get_cursor(&self) -> JsValue {
        let cursor: Option<(usize, usize)> = self.vt.cursor().into();

        serde_wasm_bindgen::to_value(&cursor).unwrap()
    }
}
