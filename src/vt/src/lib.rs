mod utils;

use wasm_bindgen::prelude::*;
// When the `wee_alloc` feature is enabled, use `wee_alloc` as the global
// allocator.
#[cfg(feature = "wee_alloc")]
#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

use avt::Vt;

#[wasm_bindgen]
pub struct VtWrapper {
    vt: Vt,
}

#[wasm_bindgen]
pub fn create(w: usize, h: usize) -> VtWrapper {
    utils::set_panic_hook();
    let mut vt = Vt::new(w, h);
    vt.resizable(true);

    VtWrapper { vt }
}

#[wasm_bindgen]
impl VtWrapper {
    pub fn feed(&mut self, s: &str) -> JsValue {
        let changes = self.vt.feed_str(s);
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
        let line: Vec<_> = self.vt.line(l).segments().collect();
        serde_wasm_bindgen::to_value(&line).unwrap()
    }

    pub fn get_cursor(&self) -> JsValue {
        let (col, row, visible) = self.vt.cursor();
        let cursor = if visible { Some((col, row)) } else { None };

        serde_wasm_bindgen::to_value(&cursor).unwrap()
    }
}
