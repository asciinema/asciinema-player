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
    VtWrapper { vt: Vt::new(w, h) }
}

#[wasm_bindgen]
impl VtWrapper {
    pub fn feed(&mut self, s: &str) -> Vec<usize> {
        self.vt.feed_str(s)
    }

    pub fn inspect(&self) -> String {
        format!("{:?}", self.vt)
    }

    pub fn get_line(&self, l: usize) -> JsValue {
        let line: Vec<_> = self.vt.line(l).segments().collect();
        serde_wasm_bindgen::to_value(&line).unwrap()
    }

    pub fn get_cursor(&self) -> JsValue {
        let cursor = self.vt.cursor();
        serde_wasm_bindgen::to_value(&cursor).unwrap()
    }
}
