// В релизе на Windows не открываем консольное окно
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    flowdo_lib::run()
}
