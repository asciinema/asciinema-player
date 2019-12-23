mod utils;

use wasm_bindgen::prelude::*;
// When the `wee_alloc` feature is enabled, use `wee_alloc` as the global
// allocator.
#[cfg(feature = "wee_alloc")]
#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

// #[macro_use]
// extern crate serde_derive;
// use serde::{Serialize, Deserialize};
// use serde::Serialize;

// extern crate vt;

// use rand::RngCore;
use vt::VT;
// use vt::Part;

// #[derive(Serialize)]
// #[serde(remote = "Part")]
// struct PartDef(Vec<char>, Pen)
//     secs: i64,
//     nanos: i32,
// }

#[wasm_bindgen]
extern {
    fn alert(s: &str);
}

#[wasm_bindgen]
pub fn greet() {
    alert("Hello, vt-js!");
}

#[wasm_bindgen]
pub struct X {
    vt: VT
}

#[wasm_bindgen]
pub fn create(w: usize, h: usize) -> X {
    X { vt: VT::new(w, h) }
}

#[wasm_bindgen]
impl X {
    pub fn feed(&mut self, s: &str) {
        // let mut bytes = [0u8; 1024 * 4];
        // let mut bytes = [0u8; 512 * 1024];
        // rand::thread_rng().fill_bytes(&mut bytes);

        // println!("go!");
        // use web_sys::console;

        // console::log_1(&"Hello using web-sys".into());

        // let mut vt = vt::VT::new(10, 4);

        self.vt.feed_str(s);

        // // for b in bytes.iter() {
        // //     vt.feed((*b) as char);
        // // }

        // console::log_1(&"fed".into());
        // console::log_1(&format!("{:?}", vt).into());
    }

    pub fn inspect(&self) -> String {
        format!("{:?}", self.vt)
    }

    // pub fn dump(&self) -> JsValue {
    //     // format!("{:?}", self.vt)
    //     // JsValue::from_serde(&self.vt.buffer).unwrap()

    //     let lines: Vec<String> =
    //       self.vt
    //       .dump()
    //       .iter()
    //       .map(|parts|
    //         parts
    //         .iter()
    //         .map(|part| part.text())
    //         .collect()
    //       )
    //       .collect();

    //     JsValue::from_serde(&lines).unwrap()
    // }

    // pub fn get_line(&self, l: usize) -> Result<wasm_bindgen::JsValue, serde_wasm_bindgen::error::Error> { //Result<JsValue, serde_wasm_bindgen::error::Error> {
    // pub fn get_line(&self, l: usize) -> serde_wasm_bindgen::Result<JsValue> {
    pub fn get_line(&self, l: usize) -> JsValue {
    // pub fn get_line(&self, l: usize) -> JsValue {
        let line = self.vt.get_line(l);
        // JsValue::from_serde(&line).unwrap()
        serde_wasm_bindgen::to_value(&line).unwrap()
        // serde_wasm_bindgen::to_value(&"xxxx").unwrap()
    }
}

#[wasm_bindgen]
pub fn x(s: &str) {
    // let mut bytes = [0u8; 1024 * 4];
    // let mut bytes = [0u8; 512 * 1024];
    // rand::thread_rng().fill_bytes(&mut bytes);

    println!("go!");
    use web_sys::console;

    console::log_1(&"Hello using web-sys".into());

    let mut vt = vt::VT::new(10, 4);

    vt.feed_str(s);

    // for b in bytes.iter() {
    //     vt.feed((*b) as char);
    // }

    console::log_1(&"fed".into());
    console::log_1(&format!("{:?}", vt).into());
}