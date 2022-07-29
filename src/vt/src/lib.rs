mod utils;

use wasm_bindgen::prelude::*;
// When the `wee_alloc` feature is enabled, use `wee_alloc` as the global
// allocator.
#[cfg(feature = "wee_alloc")]
#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

use vt::VT;

#[wasm_bindgen]
pub struct VtWrapper {
    vt: VT,
}

#[wasm_bindgen]
pub fn create(w: usize, h: usize) -> VtWrapper {
    utils::set_panic_hook();
    VtWrapper { vt: VT::new(w, h) }
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
        let line = self.vt.get_line(l);
        serde_wasm_bindgen::to_value(&line).unwrap()
    }

    pub fn get_cursor(&self) -> JsValue {
        let cursor = self.vt.cursor();
        serde_wasm_bindgen::to_value(&cursor).unwrap()
    }
}
